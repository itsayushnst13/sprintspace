import { Router } from "express";
import mongoose from "mongoose";
import { Task } from "../models/Task.js";
import { Project } from "../models/Project.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceMember } from "../middleware/workspace-access.js";

export const analyticsRouter = Router({ mergeParams: true });
analyticsRouter.use(requireAuth, requireWorkspaceMember());

analyticsRouter.get("/", async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId!;
    const [projectCount, memberCount, statusCounts, recentActivity, dueSoon, totalTasks, completedTasks] = await Promise.all([
      Project.countDocuments({ workspaceId, status: "active" }),
      WorkspaceMember.countDocuments({ workspaceId, status: "active" }),
      Task.aggregate([
        { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      ActivityLog.find({ workspaceId }).sort({ createdAt: -1 }).limit(8)
        .populate("actorId", "name").lean(),
      Task.countDocuments({ workspaceId, dueDate: { $gte: new Date(), $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) }, status: { $ne: "Done" } }),
      Task.countDocuments({ workspaceId }),
      Task.countDocuments({ workspaceId, status: "Done" })
    ]);

    res.json({
      metrics: {
        projects: projectCount,
        members: memberCount,
        tasks: totalTasks,
        completedTasks,
        dueIn24Hours: dueSoon,
        completionRate: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)
      },
      tasksByStatus: statusCounts,
      recentActivity
    });
  } catch (error) { next(error); }
});
