import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { workspaceRouter } from "./workspace.routes.js";
import { projectRouter } from "./project.routes.js";
import { taskRouter } from "./task.routes.js";

export const apiRouter = Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/workspaces", workspaceRouter);
apiRouter.use("/workspaces/:workspaceId/projects", projectRouter);
apiRouter.use("/workspaces/:workspaceId/tasks", taskRouter);
