import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { ApiError } from "./error-handler.js";

export function requireWorkspaceMember(roles) {
  return async (req, _res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      if (!req.userId || !workspaceId) throw new ApiError(400, "Workspace context is required");
      const membership = await WorkspaceMember.findOne({
        workspaceId, userId: req.userId, status: "active"
      }).lean();

      if (!membership) throw new ApiError(404, "Workspace not found", "WORKSPACE_NOT_FOUND");
      const role = membership.role;
      if (roles && !roles.includes(role)) throw new ApiError(403, "You do not have permission for this action", "FORBIDDEN");

      req.workspaceId = workspaceId;
      req.workspaceRole = role;
      next();
    } catch (error) {
      next(error);
    }
  };
}
