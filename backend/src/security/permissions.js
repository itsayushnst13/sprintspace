export const canManageProjects = (role) =>
  role === "Admin" || role === "Manager";

export const canArchiveProjects = (role) =>
  role === "Admin";

export const canDeleteTasks = (role) =>
  role === "Admin" || role === "Manager";

export function canEditTask(
  role,
  isCreator,
  isAssignee,
  fields
) {
  if (role === "Admin" || role === "Manager" || isCreator) return true;
  return isAssignee && fields.length > 0 && fields.every((field) => field === "status");
}
