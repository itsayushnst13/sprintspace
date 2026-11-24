import { Router } from "express";
import { z } from "zod";
import { Task } from "../models/Task.js";
import { Project } from "../models/Project.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceMember } from "../middleware/workspace-access.js";
import { ApiError } from "../middleware/error-handler.js";

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
    res.status(201).json({ task });
  } catch (error) { next(error); }
});

taskRouter.patch("/:taskId", async (req, res, next) => {
  try {
    const input = taskInput.omit({ projectId: true }).partial().refine((value) => Object.keys(value).length > 0, "At least one field is required").parse(req.body);
    if (input.assigneeId) {
      const member = await WorkspaceMember.exists({ workspaceId: req.workspaceId, userId: input.assigneeId, status: "active" });
      if (!member) throw new ApiError(400, "Assignee must be an active member of this workspace");
    }
    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, workspaceId: req.workspaceId },
      { $set: input }, { new: true, runValidators: true }
    );
    if (!task) throw new ApiError(404, "Task not found");
    res.json({ task });
  } catch (error) { next(error); }
});

taskRouter.delete("/:taskId", async (req, res, next) => {
  try {
    if (!["Admin", "Manager"].includes(req.workspaceRole ?? "")) throw new ApiError(403, "Only admins and managers can delete tasks");
    const task = await Task.findOneAndDelete({ _id: req.params.taskId, workspaceId: req.workspaceId });
    if (!task) throw new ApiError(404, "Task not found");
    res.status(204).end();
  } catch (error) { next(error); }
});
