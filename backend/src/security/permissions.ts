import type { WorkspaceRole } from "../models/WorkspaceMember.js";

export const canManageProjects = (role: WorkspaceRole): boolean =>
  role === "Admin" || role === "Manager";

export const canArchiveProjects = (role: WorkspaceRole): boolean =>
  role === "Admin";

export const canDeleteTasks = (role: WorkspaceRole): boolean =>
  role === "Admin" || role === "Manager";

export type TaskEditField = "title" | "description" | "status" | "priority" | "assigneeId" | "dueDate";

export function canEditTask(
  role: WorkspaceRole,
  isCreator: boolean,
  isAssignee: boolean,
  fields: TaskEditField[]
): boolean {
  if (role === "Admin" || role === "Manager" || isCreator) return true;
  return isAssignee && fields.length > 0 && fields.every((field) => field === "status");
}
