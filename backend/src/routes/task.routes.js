import { Router } from "express";
import { z } from "zod";
import { Task } from "../models/Task.js";
import { Project } from "../models/Project.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceMember } from "../middleware/workspace-access.js";
import { ApiError } from "../middleware/error-handler.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Notification } from "../models/Notification.js";
import { Comment } from "../models/Comment.js";
import { User } from "../models/User.js";
import { emitUserEvent, emitWorkspaceEvent } from "../realtime/socket.js";
import { canDeleteTasks, canEditTask } from "../security/permissions.js";
import { invalidateWorkspaceAnalytics } from "../cache/workspace-cache.js";

export const taskRouter = Router({ mergeParams: true });
taskRouter.use(requireAuth, requireWorkspaceMember());

const taskInput = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(2).max(180),
  description: z.string().max(5000).optional(),
  status: z.enum(["Todo", "In progress", "In review", "Done"]).optional(),
  priority: z.enum(["Low", "Medium", "High"]).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional()
});

taskRouter.get("/", async (req, res, next) => {
  try {
    const filter = { workspaceId: req.workspaceId };
    if (typeof req.query.projectId === "string") filter.projectId = req.query.projectId;
    if (typeof req.query.status === "string") filter.status = req.query.status;
    if (req.query.mine === "true") filter.$or = [{ createdBy: req.userId }, { assigneeId: req.userId }];
    const tasks = await Task.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ tasks });
  } catch (error) { next(error); }
});

taskRouter.post("/", async (req, res, next) => {
  try {
    const input = taskInput.parse(req.body);
    const project = await Project.exists({ _id: input.projectId, workspaceId: req.workspaceId, status: "active" });
    if (!project) throw new ApiError(404, "Project not found in this workspace");
    if (!input.assigneeId) throw new ApiError(400, "Assign this task to a developer before creating it", "ASSIGNEE_REQUIRED");
    const assignee = await WorkspaceMember.findOne({
      workspaceId: req.workspaceId, userId: input.assigneeId, status: "active"
    }).select("role").lean();
    if (!assignee || (assignee.role !== "Developer" && assignee.role !== "Member")) {
      throw new ApiError(400, "Choose an active Developer in this workspace", "INVALID_ASSIGNEE");
    }
    const canAssignOthers = req.workspaceRole === "Admin" || req.workspaceRole === "Manager";
    if (!canAssignOthers && input.assigneeId !== req.userId) {
      throw new ApiError(403, "Developers can create tasks assigned to themselves only", "ASSIGNMENT_FORBIDDEN");
    }
    const task = await Task.create({ ...input, workspaceId: req.workspaceId, createdBy: req.userId });
    await invalidateWorkspaceAnalytics(req.workspaceId!);
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "task", entityId: task._id, action: "task.created", summary: `Created task "${task.title}"` });
    if (task.assigneeId) {
      const assignee = await User.findById(task.assigneeId).select("name").lean();
      await ActivityLog.create({
        workspaceId: req.workspaceId, actorId: req.userId, entityType: "task", entityId: task._id,
        action: "task.assigned", summary: `Assigned ${assignee?.name ?? "a teammate"} to "${task.title}"`,
        metadata: { assigneeId: task.assigneeId.toString() }
      });
    }
    emitWorkspaceEvent(req.workspaceId!, "task:created", { task });
    if (task.assigneeId && task.assigneeId.toString() !== req.userId) {
      const notification = await Notification.create({ workspaceId: req.workspaceId, recipientId: task.assigneeId, actorId: req.userId, type: "task_assigned", title: "You were assigned a task", body: task.title, entityType: "task", entityId: task._id });
      emitUserEvent(notification.recipientId.toString(), "notification:created", { notification });
    }
    res.status(201).json({ task });
  } catch (error) { next(error); }
});

taskRouter.patch("/:taskId", async (req, res, next) => {
  try {
    const input = taskInput.omit({ projectId: true }).partial().refine((value) => Object.keys(value).length > 0, "At least one field is required").parse(req.body);
    const existingTask = await Task.findOne({ _id: req.params.taskId, workspaceId: req.workspaceId });
    if (!existingTask) throw new ApiError(404, "Task not found");
    const isCreator = existingTask.createdBy.toString() === req.userId;
    const isAssignee = existingTask.assigneeId?.toString() === req.userId;
    if (!req.workspaceRole || !canEditTask(req.workspaceRole, isCreator, isAssignee, Object.keys(input))) {
      throw new ApiError(403, "Assignees can update task status; task creators and workspace managers can edit all task fields");
    }
    if (Object.prototype.hasOwnProperty.call(input, "assigneeId") && !input.assigneeId) {
      throw new ApiError(400, "A task must stay assigned to a Developer", "ASSIGNEE_REQUIRED");
    }
    if (input.assigneeId) {
      const assignee = await WorkspaceMember.findOne({
        workspaceId: req.workspaceId, userId: input.assigneeId, status: "active"
      }).select("role").lean();
      if (!assignee || (assignee.role !== "Developer" && assignee.role !== "Member")) {
        throw new ApiError(400, "Choose an active Developer in this workspace", "INVALID_ASSIGNEE");
      }
      const canAssignOthers = req.workspaceRole === "Admin" || req.workspaceRole === "Manager";
      if (!canAssignOthers && input.assigneeId !== req.userId) {
        throw new ApiError(403, "Developers can only assign tasks to themselves", "ASSIGNMENT_FORBIDDEN");
      }
    }
    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, workspaceId: req.workspaceId },
      { $set: input }, { new: true, runValidators: true }
    );
    if (!task) throw new ApiError(404, "Task not found");
    await invalidateWorkspaceAnalytics(req.workspaceId!);
    const previousAssignee = existingTask.assigneeId?.toString() ?? null;
    const currentAssignee = task.assigneeId?.toString() ?? null;
    const assigneeChanged = currentAssignee !== previousAssignee;
    const assignedUser = assigneeChanged && currentAssignee
      ? await User.findById(currentAssignee).select("name").lean()
      : null;
    await ActivityLog.create({
      workspaceId: req.workspaceId, actorId: req.userId, entityType: "task", entityId: task._id,
      action: assigneeChanged ? (currentAssignee ? "task.assigned" : "task.unassigned") : "task.updated",
      summary: assigneeChanged
        ? currentAssignee ? `Assigned ${assignedUser?.name ?? "a teammate"} to "${task.title}"` : `Unassigned "${task.title}"`
        : `Updated task "${task.title}"`,
      metadata: {
        ...input,
        ...(assigneeChanged ? { previousAssigneeId: previousAssignee, currentAssigneeId: currentAssignee } : {})
      }
    });
    if (currentAssignee && currentAssignee !== previousAssignee && currentAssignee !== req.userId) {
      const notification = await Notification.create({
        workspaceId: req.workspaceId, recipientId: task.assigneeId, actorId: req.userId,
        type: "task_assigned", title: "You were assigned a task", body: task.title,
        entityType: "task", entityId: task._id
      });
      emitUserEvent(currentAssignee, "notification:created", { notification });
    }
    emitWorkspaceEvent(req.workspaceId!, "task:updated", { task });
    res.json({ task });
  } catch (error) { next(error); }
});

taskRouter.delete("/:taskId", async (req, res, next) => {
  try {
    if (!req.workspaceRole || !canDeleteTasks(req.workspaceRole)) throw new ApiError(403, "Only admins and managers can delete tasks");
    const task = await Task.findOneAndDelete({ _id: req.params.taskId, workspaceId: req.workspaceId });
    if (!task) throw new ApiError(404, "Task not found");
    await invalidateWorkspaceAnalytics(req.workspaceId!);
    await Promise.all([
      Comment.deleteMany({ taskId: task._id, workspaceId: req.workspaceId }),
      Notification.deleteMany({ entityType: "task", entityId: task._id, workspaceId: req.workspaceId })
    ]);
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "task", entityId: task._id, action: "task.deleted", summary: `Deleted task "${task.title}"` });
    emitWorkspaceEvent(req.workspaceId!, "task:deleted", { taskId: task.id });
    res.status(204).end();
  } catch (error) { next(error); }
});
