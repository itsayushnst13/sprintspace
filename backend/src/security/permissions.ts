import type { WorkspaceRole } from "../models/WorkspaceMember.js";

export const canManageProjects = (role: WorkspaceRole): boolean =>
  role === "Admin" || role === "Manager";

export const canArchiveProjects = (role: WorkspaceRole): boolean =>
  role === "Admin";

export const canDeleteTasks = (role: WorkspaceRole): boolean =>
  role === "Admin" || role === "Manager";
