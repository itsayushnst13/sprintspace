import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { workspaceRouter } from "./workspace.routes.js";
import { projectRouter } from "./project.routes.js";
import { taskRouter } from "./task.routes.js";
import { analyticsRouter } from "./analytics.routes.js";
import { activityRouter, commentsRouter, notificationsRouter } from "./collaboration.routes.js";

export const apiRouter = Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/workspaces", workspaceRouter);
apiRouter.use("/workspaces/:workspaceId/projects", projectRouter);
apiRouter.use("/workspaces/:workspaceId/tasks", taskRouter);
apiRouter.use("/workspaces/:workspaceId/analytics", analyticsRouter);
apiRouter.use("/workspaces/:workspaceId/activity", activityRouter);
apiRouter.use("/workspaces/:workspaceId/notifications", notificationsRouter);
apiRouter.use("/workspaces/:workspaceId/tasks/:taskId/comments", commentsRouter);
