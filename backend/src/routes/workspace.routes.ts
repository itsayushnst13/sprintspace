import { Router } from "express";
import { z } from "zod";
import { Workspace } from "../models/Workspace.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";

export const workspaceRouter = Router();
workspaceRouter.use(requireAuth);

workspaceRouter.get("/", async (req, res, next) => {
  try {
    const memberships = await WorkspaceMember.find({ userId: req.userId, status: "active" })
      .populate("workspaceId", "name slug")
      .lean();
    res.json({ workspaces: memberships.map((item) => ({
      id: (item.workspaceId as unknown as { _id: { toString(): string }; name: string; slug: string })._id.toString(),
      name: (item.workspaceId as unknown as { name: string }).name,
      slug: (item.workspaceId as unknown as { slug: string }).slug,
      role: item.role
    })) });
  } catch (error) { next(error); }
});

workspaceRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
    const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
    const workspace = await Workspace.create({
      name: input.name,
      slug: `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`,
      createdBy: req.userId
    });
    await WorkspaceMember.create({ workspaceId: workspace._id, userId: req.userId, role: "Admin", status: "active" });
    res.status(201).json({ workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, role: "Admin" } });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return next(new ApiError(400, "Invalid workspace name"));
    next(error);
  }
});
