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
import { emitUserEvent, emitWorkspaceEvent } from "../realtime/socket.js";
import { canDeleteTasks } from "../security/permissions.js";

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
    const filter: Record<string, unknown> = { workspaceId: req.workspaceId };
    if (typeof req.query.projectId === "string") filter.projectId = req.query.projectId;
    if (typeof req.query.status === "string") filter.status = req.query.status;
    const tasks = await Task.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ tasks });
  } catch (error) { next(error); }
});

taskRouter.post("/", async (req, res, next) => {
  try {
    const input = taskInput.parse(req.body);
    const project = await Project.exists({ _id: input.projectId, workspaceId: req.workspaceId, status: "active" });
    if (!project) throw new ApiError(404, "Project not found in this workspace");
    if (input.assigneeId) {
      const member = await WorkspaceMember.exists({ workspaceId: req.workspaceId, userId: input.assigneeId, status: "active" });
      if (!member) throw new ApiError(400, "Assignee must be an active member of this workspace");
    }
    const task = await Task.create({ ...input, workspaceId: req.workspaceId, createdBy: req.userId });
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "task", entityId: task._id, action: "task.created", summary: `Created task "${task.title}"` });
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
    const isPrivileged = req.workspaceRole === "Admin" || req.workspaceRole === "Manager";
    const isOwnerOrAssignee = existingTask.createdBy.toString() === req.userId || existingTask.assigneeId?.toString() === req.userId;
    if (!isPrivileged && !isOwnerOrAssignee) throw new ApiError(403, "Only task creator, assignee, or workspace managers can edit this task");
    if (input.assigneeId) {
      const member = await WorkspaceMember.exists({ workspaceId: req.workspaceId, userId: input.assigneeId, status: "active" });
      if (!member) throw new ApiError(400, "Assignee must be an active member of this workspace");
    }
    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, workspaceId: req.workspaceId },
      { $set: input }, { new: true, runValidators: true }
    );
    if (!task) throw new ApiError(404, "Task not found");
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "task", entityId: task._id, action: "task.updated", summary: `Updated task "${task.title}"`, metadata: input });
    emitWorkspaceEvent(req.workspaceId!, "task:updated", { task });
    res.json({ task });
  } catch (error) { next(error); }
});

taskRouter.delete("/:taskId", async (req, res, next) => {
  try {
    if (!req.workspaceRole || !canDeleteTasks(req.workspaceRole)) throw new ApiError(403, "Only admins and managers can delete tasks");
    const task = await Task.findOneAndDelete({ _id: req.params.taskId, workspaceId: req.workspaceId });
    if (!task) throw new ApiError(404, "Task not found");
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "task", entityId: task._id, action: "task.deleted", summary: `Deleted task "${task.title}"` });
    emitWorkspaceEvent(req.workspaceId!, "task:deleted", { taskId: task.id });
    res.status(204).end();
  } catch (error) { next(error); }
});
