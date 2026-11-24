import { Router } from "express";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceMember } from "../middleware/workspace-access.js";
import { ApiError } from "../middleware/error-handler.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { emitWorkspaceEvent } from "../realtime/socket.js";
import { canArchiveProjects, canManageProjects } from "../security/permissions.js";

export const projectRouter = Router({ mergeParams: true });
projectRouter.use(requireAuth, requireWorkspaceMember());

const projectInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  color: z.enum(["violet", "blue", "orange", "green"]).optional(),
  dueDate: z.coerce.date().nullable().optional()
});

projectRouter.get("/", async (req, res, next) => {
  try {
    const projects = await Project.find({ workspaceId: req.workspaceId, status: "active" }).sort({ updatedAt: -1 }).lean();
    res.json({ projects });
  } catch (error) { next(error); }
});

projectRouter.post("/", async (req, res, next) => {
  try {
    if (!req.workspaceRole || !canManageProjects(req.workspaceRole)) throw new ApiError(403, "Only admins and managers can create projects");
    const input = projectInput.parse(req.body);
    const project = await Project.create({ ...input, workspaceId: req.workspaceId, createdBy: req.userId });
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "project", entityId: project._id, action: "project.created", summary: `Created project "${project.name}"` });
    emitWorkspaceEvent(req.workspaceId!, "project:created", { project });
    res.status(201).json({ project });
  } catch (error) { next(error); }
});

projectRouter.patch("/:projectId", async (req, res, next) => {
  try {
    if (!req.workspaceRole || !canManageProjects(req.workspaceRole)) throw new ApiError(403, "Only admins and managers can update projects");
    const input = projectInput.partial().parse(req.body);
    const project = await Project.findOneAndUpdate(
      { _id: req.params.projectId, workspaceId: req.workspaceId, status: "active" },
      { $set: input }, { new: true, runValidators: true }
    );
    if (!project) throw new ApiError(404, "Project not found");
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "project", entityId: project._id, action: "project.updated", summary: `Updated project "${project.name}"` });
    emitWorkspaceEvent(req.workspaceId!, "project:updated", { project });
    res.json({ project });
  } catch (error) { next(error); }
});

projectRouter.delete("/:projectId", async (req, res, next) => {
  try {
    if (!req.workspaceRole || !canArchiveProjects(req.workspaceRole)) throw new ApiError(403, "Only workspace admins can archive projects");
    const project = await Project.findOneAndUpdate(
      { _id: req.params.projectId, workspaceId: req.workspaceId, status: "active" },
      { $set: { status: "archived" } }, { new: true }
    );
    if (!project) throw new ApiError(404, "Project not found");
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "project", entityId: project._id, action: "project.archived", summary: `Archived project "${project.name}"` });
    emitWorkspaceEvent(req.workspaceId!, "project:updated", { project });
    res.json({ project });
  } catch (error) { next(error); }
});
