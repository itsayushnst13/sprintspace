import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  Activity, Archive, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Bell, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Command, FolderKanban, FolderOpen, LayoutDashboard, ListTodo, LogOut,
  Plus, Search, Settings2, Target, Users, X, Zap
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type TaskStatus } from "./data/demo";
import { useSession } from "./store/session";
import { AuthScreen } from "./components/AuthScreen";
import { apiRequest, getAccessToken } from "./lib/api";

type NavItem = { label: string; icon: typeof LayoutDashboard };
const boardStatuses: TaskStatus[] = ["Todo", "In progress", "In review", "Done"];
const primaryNav: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "My tasks", icon: ListTodo },
  { label: "Projects", icon: FolderKanban }, { label: "Calendar", icon: CalendarDays },
  { label: "Board", icon: ListTodo }, { label: "Team", icon: Users }, { label: "Activity", icon: Activity }
];

type AnalyticsResponse = { metrics: { projects: number; members: number; tasks: number; completedTasks: number; dueIn24Hours: number; completionRate: number }; tasksByStatus: Array<{ _id: string; count: number }> };
type ProjectRecord = { _id: string; name: string; description?: string; color?: string; dueDate?: string | null; createdBy?: { _id: string; name: string; email: string } | string };
type TaskRecord = { _id: string; title: string; projectId: string; status: TaskStatus; priority: "High" | "Medium" | "Low"; assigneeId?: string | null; createdBy?: string; dueDate?: string | null };
type CommentRecord = { _id: string; body: string; createdAt: string; authorId: { name: string } | string };
type TeamMember = { _id: string; role: "Admin" | "Manager" | "Developer" | "Member"; userId: { _id: string; name: string; email: string } | string; createdAt: string };
type InvitationRecord = { _id: string; email: string; role: "Manager" | "Developer" | "Member"; expiresAt: string };
type ActivityRecord = { _id: string; summary: string; action: string; createdAt: string; actorId: { name: string } | string; entityType?: "project" | "task" | "comment" | "member"; entityId?: string; metadata?: Record<string, unknown> };

function activityEntityLabel(entityType?: ActivityRecord["entityType"]) {
  switch (entityType) {
    case "project": return "Project";
    case "task": return "Task";
    case "comment": return "Comment";
    case "member": return "Team";
    default: return "Workspace";
  }
}

function activityActionIcon(action: string) {
  if (action.includes("assigned") || action.includes("invited") || action.includes("joined") || action.includes("member")) {
    return <Users size={19} strokeWidth={2}/>;
  }
  if (action.includes("deleted") || action.includes("archived")) {
    return <Archive size={19} strokeWidth={2}/>;
  }
  if (action.includes("created")) {
    return <Plus size={20} strokeWidth={2.2}/>;
  }
  if (action.includes("updated")) {
    return <CheckCircle2 size={19} strokeWidth={2}/>;
  }
  return <Activity size={19} strokeWidth={2}/>;
}

function formatActivityTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit"
  }).format(date);
}

function App() {
  const session = useSession();
  const queryClient = useQueryClient();
  const bootStarted = useRef(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const workspaceId = session.workspace?.id;
  const canManageWorkspace = session.workspace?.role === "Admin" || session.workspace?.role === "Manager";

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    if (session.authenticated) { session.markReady(); return; }
    apiRequest<{ accessToken: string; user: { id: string; name: string; email: string }; workspace?: { id: string; name: string; slug: string; role?: string }; workspaces?: Array<{ id: string; name: string; slug: string; role: string }> }>("/auth/refresh", { method: "POST" })
      .then(async (result) => {
        const savedWorkspaceId = localStorage.getItem("sprintspace.workspaceId");
        const workspaces = result.workspaces ?? (await apiRequest<{ workspaces: Array<{ id: string; name: string; slug: string; role: string }> }>("/workspaces")).workspaces;
        const selected = workspaces.find((workspace) => workspace.id === savedWorkspaceId) ?? result.workspace ?? workspaces[0];
        session.establish(result.accessToken, result.user, selected);
      })
      .catch(() => undefined)
      .finally(() => session.markReady());
  }, []);

  useEffect(() => {
    const handleSearchShortcuts = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") { setSearchOpen(false); setSearchTerm(""); setNotificationsOpen(false); setProfileOpen(false); setMobileNav(false); }
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) setSearchOpen(false);
      if (profileWrapRef.current && !profileWrapRef.current.contains(target)) setProfileOpen(false);
    };
    window.addEventListener("keydown", handleSearchShortcuts);
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      window.removeEventListener("keydown", handleSearchShortcuts);
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, []);
  const workspacesQuery = useQuery({
    queryKey: ["user-workspaces"],
    queryFn: () => apiRequest<{ workspaces: Array<{ id: string; name: string; slug: string; role: string }> }>("/workspaces"),
    enabled: session.authenticated
  });
  const analyticsQuery = useQuery({
    queryKey: ["workspace-analytics", workspaceId],
    queryFn: () => apiRequest<AnalyticsResponse>(`/workspaces/${workspaceId}/analytics`),
    enabled: session.authenticated && Boolean(workspaceId)
  });

  const projectsQuery = useQuery({
    queryKey: ["workspace-projects", workspaceId],
    queryFn: () => apiRequest<{ projects: ProjectRecord[] }>(`/workspaces/${workspaceId}/projects`),
    enabled: session.authenticated && Boolean(workspaceId)
  });
  const tasksQuery = useQuery({
    queryKey: ["workspace-tasks", workspaceId],
    queryFn: () => apiRequest<{ tasks: TaskRecord[] }>(`/workspaces/${workspaceId}/tasks`),
    enabled: session.authenticated && Boolean(workspaceId)
  });
  const myTasksQuery = useQuery({
    queryKey: ["workspace-tasks", workspaceId, "mine"],
    queryFn: () => apiRequest<{ tasks: TaskRecord[] }>(`/workspaces/${workspaceId}/tasks?mine=true`),
    enabled: session.authenticated && Boolean(workspaceId)
  });
  const commentsQuery = useQuery({
    queryKey: ["task-comments", workspaceId, selectedTaskId],
    queryFn: () => apiRequest<{ comments: CommentRecord[] }>(`/workspaces/${workspaceId}/tasks/${selectedTaskId}/comments`),
    enabled: session.authenticated && Boolean(workspaceId) && Boolean(selectedTaskId)
  });
  const activityQuery = useQuery({
    queryKey: ["workspace-activity", workspaceId],
    queryFn: () => apiRequest<{ activity: ActivityRecord[] }>(`/workspaces/${workspaceId}/activity`),
    enabled: session.authenticated && Boolean(workspaceId) && activeNav === "Activity"
  });
  const teamQuery = useQuery({
    queryKey: ["workspace-team", workspaceId],
    queryFn: () => apiRequest<{ members: TeamMember[] }>(`/workspaces/${workspaceId}/team/members`),
    enabled: session.authenticated && Boolean(workspaceId)
  });
  const invitationsQuery = useQuery({
    queryKey: ["workspace-invitations", workspaceId],
    queryFn: () => apiRequest<{ invitations: InvitationRecord[] }>(`/workspaces/${workspaceId}/team/invitations`),
    enabled: session.authenticated && Boolean(workspaceId) && (session.workspace?.role === "Admin" || session.workspace?.role === "Manager")
  });
  const notificationsQuery = useQuery({
    queryKey: ["workspace-notifications", workspaceId],
    queryFn: () => apiRequest<{ notifications: Array<{ _id: string; title: string; body: string; readAt?: string | null; createdAt: string; entityType?: "task" | "project" | "comment"; entityId?: string }>; unreadCount: number }>(`/workspaces/${workspaceId}/notifications`),
    enabled: session.authenticated && Boolean(workspaceId)
  });


  useEffect(() => {
    if (!session.authenticated || !workspaceId || !getAccessToken()) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5001", {
      auth: (callback) => callback({ token: getAccessToken() }), transports: ["websocket", "polling"]
    });
    socket.on("connect", () => {
      socket.emit("workspace:join", workspaceId);
    });
    const refreshWorkspaceData = () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-analytics", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-projects", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-tasks", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-notifications", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["task-comments", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-team", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-activity", workspaceId] });
    };
    socket.on("task:created", refreshWorkspaceData);
    socket.on("task:updated", refreshWorkspaceData);
    socket.on("task:deleted", refreshWorkspaceData);
    socket.on("project:created", refreshWorkspaceData);
    socket.on("project:updated", refreshWorkspaceData);
    socket.on("comment:created", refreshWorkspaceData);
    socket.on("notification:created", refreshWorkspaceData);
    socket.on("team:invited", refreshWorkspaceData);
    socket.on("team:updated", refreshWorkspaceData);
    socket.on("team:removed", refreshWorkspaceData);
    socket.on("team:joined", refreshWorkspaceData);
    socket.on("workspace:access-revoked", async () => {
      const current = useSession.getState();
      try {
        const available = await apiRequest<{ workspaces: Array<{ id: string; name: string; slug: string; role: string }> }>("/workspaces");
        const fallback = available.workspaces[0];
        if (fallback && current.user && getAccessToken()) current.establish(getAccessToken()!, current.user, fallback);
        else {
          await apiRequest<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
          current.clear();
        }
      } catch {
        current.clear();
      }
    });
    return () => { socket.disconnect(); };
  }, [session.authenticated, workspaceId, queryClient]);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("sprintspace.sidebarCollapsed") === "true");
  const toggleSidebar = () => setSidebarCollapsed((collapsed) => {
    const next = !collapsed;
    window.localStorage.setItem("sprintspace.sidebarCollapsed", String(next));
    return next;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [taskStatus, setTaskStatus] = useState("All tasks");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("All priorities");
  const [taskProjectFilter, setTaskProjectFilter] = useState("All projects");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [expandedCalendarDate, setExpandedCalendarDate] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<"project" | "task" | "workspace" | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectDueDate, setNewProjectDueDate] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newProjectForTaskName, setNewProjectForTaskName] = useState("");
  const [createTaskError, setCreateTaskError] = useState("");
  const [createTaskSaving, setCreateTaskSaving] = useState(false);
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"Manager" | "Developer">("Developer");
  const [inviteToken, setInviteToken] = useState("");
  const [acceptInviteToken, setAcceptInviteToken] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState("");
  const [editTaskStatus, setEditTaskStatus] = useState<TaskStatus>("Todo");
  const [editTaskPriority, setEditTaskPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [editTaskDueDate, setEditTaskDueDate] = useState("");
  const [editTaskAssignee, setEditTaskAssignee] = useState("");
  const [saveTaskError, setSaveTaskError] = useState("");
  const [saveTaskSaving, setSaveTaskSaving] = useState(false);

  const taskDueDateKey = (value: string) => value.slice(0, 10);
  const formatTaskDueDate = (value: string) => {
    const [year, month, day] = taskDueDateKey(value).split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString();
  };
  const metrics = analyticsQuery.data?.metrics;
  const chartData = analyticsQuery.data?.tasksByStatus.map((item) => ({ day: item._id, completed: item.count, created: 0 })) ?? [];
  const projectRows = (projectsQuery.data?.projects ?? []).map((project) => {
    const projectTasks = tasksQuery.data?.tasks.filter((task) => task.projectId === project._id) ?? [];
    const done = projectTasks.filter((task) => task.status === "Done").length;
    const creatorMember = (teamQuery.data?.members ?? []).find((member) => {
      const memberUserId = typeof member.userId === "object" ? member.userId._id : member.userId;
      return memberUserId === project.createdBy;
    });
    const creatorUser = creatorMember && typeof creatorMember.userId === "object" ? creatorMember.userId : null;
    const creatorName = typeof project.createdBy === "object"
      ? project.createdBy.name
      : creatorUser?.name ?? "Workspace member";
    return {
      id: project._id, name: project.name, description: project.description ?? "", createdByName: creatorName,
      color: project.color ?? "violet", progress: projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0,
      due: project.dueDate ? formatTaskDueDate(project.dueDate) : "No deadline",
      dueDate: project.dueDate ?? null, tasks: `${done}/${projectTasks.length}`,
      totalTasks: projectTasks.length, completedTasks: done
    };
  });
  const taskRows = (tasksQuery.data?.tasks ?? []).map((task) => {
    const assignedMember = (teamQuery.data?.members ?? []).find((member) => {
      const memberUserId = typeof member.userId === "object" ? member.userId._id : member.userId;
      return memberUserId === task.assigneeId;
    });
    const assignedUser = assignedMember && typeof assignedMember.userId === "object" ? assignedMember.userId : null;
    const creatorMember = (teamQuery.data?.members ?? []).find((member) => {
      const memberUserId = typeof member.userId === "object" ? member.userId._id : member.userId;
      return memberUserId === task.createdBy;
    });
    const creatorUser = creatorMember && typeof creatorMember.userId === "object" ? creatorMember.userId : null;
    const canUpdateStatus = canManageWorkspace || task.createdBy === session.user?.id || task.assigneeId === session.user?.id;
    return {
      id: task._id.slice(-6).toUpperCase(), taskId: task._id, title: task.title, projectId: task.projectId,
      assigneeId: task.assigneeId ?? null, createdBy: task.createdBy, createdByName: creatorUser?.name ?? "Workspace member", dueDate: task.dueDate ?? null,
      project: projectRows.find((project) => project.id === task.projectId)?.name ?? "Workspace task",
      assignee: assignedUser?.name ?? "Unassigned", assigneeEmail: assignedUser?.email ?? "",
      initials: assignedUser?.name ? assignedUser.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() : "—",
      canUpdateStatus, tone: "sky", priority: task.priority,
      status: task.status, due: task.dueDate ? formatTaskDueDate(task.dueDate) : "No due date"
    };
  });
  const visibleTasks = useMemo(() => taskRows.filter((task) =>
    (taskStatus === "All tasks" || task.status === taskStatus) &&
    (taskPriorityFilter === "All priorities" || task.priority === taskPriorityFilter) &&
    (taskProjectFilter === "All projects" || taskRows.find((row) => row.taskId === task.taskId)?.project === taskProjectFilter)
  ).slice(0, showAll ? taskRows.length : 5), [taskRows, taskStatus, taskPriorityFilter, taskProjectFilter, showAll]);
  const myTaskIds = new Set((myTasksQuery.data?.tasks ?? []).map((task) => task._id));
  const myTaskRows = taskRows.filter((task) => myTaskIds.has(task.taskId));
  const calendarRows = taskRows.filter((task) => task.dueDate).sort((a, b) => taskDueDateKey(a.dueDate!).localeCompare(taskDueDateKey(b.dueDate!)));
  const unscheduledTasks = taskRows.filter((task) => !task.dueDate);
  const calendarMonthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}`;
  const calendarMonthTaskCount = calendarRows.filter((task) => taskDueDateKey(task.dueDate!).startsWith(calendarMonthKey)).length;
  const selectedTask = tasksQuery.data?.tasks.find((task) => task._id === selectedTaskId);
  const selectedProject = projectRows.find((project) => project.id === selectedProjectId);
  const calendarGridStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1 - ((calendarMonth.getDay() + 6) % 7));
  const calendarDays = Array.from({ length: 42 }, (_, index) => new Date(calendarGridStart.getFullYear(), calendarGridStart.getMonth(), calendarGridStart.getDate() + index));
  const calendarDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  if (!session.ready) return <div className="auth-loading"><div className="brand-mark"><Command size={19}/></div><span>Restoring your workspace…</span></div>;
  if (!session.authenticated) return <AuthScreen />;

  const switchWorkspace = (workspace: { id: string; name: string; slug: string; role: string }) => {
    if (!session.user || !getAccessToken()) return;
    session.establish(getAccessToken()!, session.user, workspace);
    setWorkspaceMenuOpen(false);
    setActiveNav("Overview");
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setMobileNav(false);
    setSearchOpen(false);
  };
  const moveTask = async (taskId: string, status: TaskStatus) => {
    await apiRequest(`/workspaces/${workspaceId}/tasks/${taskId}`, {
      method: "PATCH", body: JSON.stringify({ status })
    });
    await Promise.all([tasksQuery.refetch(), analyticsQuery.refetch()]);
  };
  const completeTask = async (id: string) => {
    const task = taskRows.find((item) => item.id === id);
    if (!task || !task.canUpdateStatus) return;
    await apiRequest(`/workspaces/${workspaceId}/tasks/${task.taskId}`, {
      method: "PATCH", body: JSON.stringify({ status: task.status === "Done" ? "Todo" : "Done" })
    });
    await Promise.all([tasksQuery.refetch(), analyticsQuery.refetch()]);
  };
  const acceptInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteFeedback("");
    const accepted = await apiRequest<{ workspaceId: string; role: string }>("/invitations/accept", {
      method: "POST", body: JSON.stringify({ token: acceptInviteToken.trim() })
    });
    const result = await apiRequest<{ workspaces: Array<{ id: string; name: string; slug: string; role: string }> }>("/workspaces");
    queryClient.setQueryData(["user-workspaces"], result);
    const workspace = result.workspaces.find((item) => item.id === accepted.workspaceId);
    if (workspace && session.user && getAccessToken()) {
      session.establish(getAccessToken()!, session.user, workspace);
      setActiveNav("Overview");
      setInviteFeedback("Invitation accepted. Workspace switched successfully.");
      setAcceptInviteToken("");
    } else {
      setInviteFeedback("Invitation accepted. Refresh the workspace list to open it.");
    }
  };
  const sendInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    const result = await apiRequest<{ inviteToken: string }>(`/workspaces/${workspaceId}/team/invitations`, {
      method: "POST", body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole })
    });
    setInviteToken(result.inviteToken);
    setInviteEmail("");
    await invitationsQuery.refetch();
  };
  const openTask = (taskId: string) => {
    const task = tasksQuery.data?.tasks.find((item) => item._id === taskId);
    if (!task) return;
    setSelectedProjectId(null);
    setSelectedTaskId(taskId);
    setEditTaskStatus(task.status);
    setEditTaskPriority(task.priority);
    setEditTaskDueDate(task.dueDate ? taskDueDateKey(task.dueDate) : "");
    setEditTaskAssignee(task.assigneeId ?? "");
    setSaveTaskError("");
  };
  const openProject = (projectId: string) => {
    setSelectedTaskId(null);
    setSelectedProjectId(projectId);
  };
  const createTaskForProject = (projectId: string) => {
    setNewTaskProjectId(projectId);
    setNewTaskTitle("");
    setNewTaskPriority("Medium");
    setNewTaskDueDate("");
    setNewTaskAssignee(canManageWorkspace ? "" : (session.user?.id ?? ""));
    setCreateTaskError("");
    setNewProjectForTaskName("");
    setSelectedProjectId(null);
    setCreateModal("task");
  };
  const openActivityItem = (item: ActivityRecord) => {
    if (item.entityType === "task" && item.entityId) openTask(item.entityId);
    else if (item.entityType === "project" && item.entityId) openProject(item.entityId);
    else if (item.entityType === "comment" && typeof item.metadata?.taskId === "string") openTask(item.metadata.taskId);
    else if (item.entityType === "member") setActiveNav("Team");
  };
  const archiveProject = async (projectId: string) => {
    if (!window.confirm("Archive this project? Its tasks will remain in workspace history.")) return;
    await apiRequest(`/workspaces/${workspaceId}/projects/${projectId}`, { method: "DELETE" });
    await Promise.all([projectsQuery.refetch(), analyticsQuery.refetch()]);
  };
  const createWorkspace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newWorkspaceName.trim()) return;
    const result = await apiRequest<{ workspace: { id: string; name: string; slug: string; role: string } }>("/workspaces", {
      method: "POST", body: JSON.stringify({ name: newWorkspaceName.trim() })
    });
    setNewWorkspaceName("");
    setCreateModal(null);
    if (session.user && getAccessToken()) session.establish(getAccessToken()!, session.user, result.workspace);
    await workspacesQuery.refetch();
  };
  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newProjectName.trim()) return;
    await apiRequest(`/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ name: newProjectName.trim(), description: newProjectDescription.trim(), dueDate: newProjectDueDate || null })
    });
    setNewProjectName("");
    setNewProjectDescription("");
    setNewProjectDueDate("");
    setCreateModal(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace-projects", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-analytics", workspaceId] })
    ]);
  };
  const openCreateTask = () => {
    setNewTaskProjectId(projectRows[0]?.id ?? "");
    setNewTaskTitle("");
    setNewTaskPriority("Medium");
    setNewTaskDueDate("");
    setNewTaskAssignee(canManageWorkspace ? "" : (session.user?.id ?? ""));
    setCreateTaskError("");
    setNewProjectForTaskName("");
    setCreateModal("task");
  };
  const createProjectForTask = async () => {
    if (!newProjectForTaskName.trim()) return;
    setCreateTaskError("");
    try {
      const result = await apiRequest<{ project: ProjectRecord }>(`/workspaces/${workspaceId}/projects`, {
        method: "POST", body: JSON.stringify({ name: newProjectForTaskName.trim() })
      });
      setNewTaskProjectId(result.project._id);
      setNewProjectForTaskName("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-projects", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-analytics", workspaceId] })
      ]);
    } catch (error) {
      setCreateTaskError(error instanceof Error ? error.message : "Could not create the project. Please try again.");
    }
  };
  const createTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    if (!newTaskProjectId) {
      setCreateTaskError("Choose a project before creating this task.");
      return;
    }
    if (!newTaskAssignee) {
      setCreateTaskError("Choose a developer to own this task.");
      return;
    }
    setCreateTaskError("");
    setCreateTaskSaving(true);
    try {
      await apiRequest(`/workspaces/${workspaceId}/tasks`, { method: "POST", body: JSON.stringify({ projectId: newTaskProjectId, title: newTaskTitle.trim(), priority: newTaskPriority, assigneeId: newTaskAssignee || null, dueDate: newTaskDueDate || null }) });
      setNewTaskTitle("");
      setNewTaskAssignee("");
      setNewTaskDueDate("");
      setCreateModal(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-tasks", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-analytics", workspaceId] })
      ]);
    } catch (error) {
      setCreateTaskError(error instanceof Error ? error.message : "Could not create the task. Please try again.");
    } finally {
      setCreateTaskSaving(false);
    }
  };
  const deleteTask = async () => {
    if (!selectedTaskId || !window.confirm("Delete this task and its comments? This cannot be undone.")) return;
    await apiRequest<void>(`/workspaces/${workspaceId}/tasks/${selectedTaskId}`, { method: "DELETE" });
    setSelectedTaskId(null);
    await Promise.all([tasksQuery.refetch(), analyticsQuery.refetch(), activityQuery.refetch()]);
  };
  const saveTaskDetails = async () => {
    if (!selectedTaskId) return;
    const canEditDetails = canManageWorkspace || selectedTask?.createdBy === session.user?.id;
    if (canManageWorkspace && !editTaskAssignee) {
      setSaveTaskError("Choose a Developer. Tasks cannot be left unassigned.");
      return;
    }
    const payload = canEditDetails
      ? { status: editTaskStatus, priority: editTaskPriority, dueDate: editTaskDueDate || null, assigneeId: editTaskAssignee }
      : { status: editTaskStatus };
    setSaveTaskError("");
    setSaveTaskSaving(true);
    try {
      await apiRequest(`/workspaces/${workspaceId}/tasks/${selectedTaskId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      await Promise.all([tasksQuery.refetch(), myTasksQuery.refetch(), analyticsQuery.refetch(), activityQuery.refetch()]);
    } catch (error) {
      setSaveTaskError(error instanceof Error ? error.message : "Could not save task details.");
    } finally {
      setSaveTaskSaving(false);
    }
  };
  const submitComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTaskId || !commentDraft.trim()) return;
    await apiRequest(`/workspaces/${workspaceId}/tasks/${selectedTaskId}/comments`, { method: "POST", body: JSON.stringify({ body: commentDraft.trim() }) });
    setCommentDraft("");
    await commentsQuery.refetch();
  };
  const logout = async () => {
    await apiRequest<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    session.clear();
  };
  const initials = session.user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") ?? "U";

  return <div className="app-shell">
    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <div className="brand-lockup"><div className="brand-mark"><Command size={19} strokeWidth={2.5} /></div><span>Sprint<span className="brand-light">Space</span></span><button className="sidebar-collapse-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}><ChevronLeft size={18}/></button><button type="button" className="icon-button sidebar-close" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setMobileNav(false); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMobileNav(false); setWorkspaceMenuOpen(false); }} aria-label="Close navigation menu" title="Close menu"><X size={20} /></button></div>
      <div className="workspace-switch-wrap"><button className="workspace-switch" onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}><div className="workspace-avatar">{(session.workspace?.name ?? "W").slice(0,1).toUpperCase()}</div><div className="workspace-meta"><strong>{session.workspace?.name ?? "My workspace"}</strong><span>{session.workspace?.role === "Member" ? "Developer" : session.workspace?.role ?? "Workspace member"}</span></div><ChevronDown size={16} className="subtle-icon" /></button>{workspaceMenuOpen && <div className="workspace-menu">{(workspacesQuery.data?.workspaces ?? []).map((workspace) => <button key={workspace.id} className={workspace.id === workspaceId ? "selected" : ""} onClick={() => switchWorkspace(workspace)}><strong>{workspace.name}</strong><span>{workspace.role === "Member" ? "Developer" : workspace.role}</span></button>)}<button className="workspace-create" onClick={() => { setWorkspaceMenuOpen(false); setCreateModal("workspace"); }}><Plus size={13}/> Create workspace</button></div>}</div>
      <div className="sidebar-scroll-region">
      <div className="nav-section"><p className="nav-label">WORKSPACE</p><nav>{primaryNav.map(({label,icon:Icon}) => <button key={label} title={label} aria-label={label} className={`nav-item ${activeNav===label?"active":""}`} onClick={()=>{setActiveNav(label);setMobileNav(false);}}><Icon size={19} strokeWidth={1.8}/><span>{label}</span>{label==="My tasks"&&myTaskRows.length>0&&<span className="nav-count">{myTaskRows.length}</span>}</button>)}</nav></div>
      <div className="nav-section projects-nav"><div className="nav-label-row"><p className="nav-label">YOUR PROJECTS</p>{canManageWorkspace && <button className="tiny-icon" aria-label="Add project" onClick={() => setCreateModal("project")}><Plus size={15}/></button>}</div>{projectRows.map((project) => <button className="project-nav-item" key={project.id} title={project.name} onClick={() => openProject(project.id)}><span className={`project-dot dot-${project.color}`}/><span>{project.name}</span></button>)}{canManageWorkspace && <button className="project-nav-item muted-link" title="Add project" aria-label="Add project" onClick={() => setCreateModal("project")}><Plus size={15}/><span>Add project</span></button>}</div>
      </div>
      <div className="sidebar-bottom"><div className="sidebar-shortcuts"><strong>Workspace shortcuts</strong><button onClick={() => setActiveNav("Team")}><Users size={14}/> Manage team</button><button onClick={() => setActiveNav("Projects")}><FolderKanban size={14}/> Open projects</button></div><button className="nav-item bottom-link" title="Settings" onClick={()=>setActiveNav("Settings")}><Settings2 size={19}/><span>Settings</span></button><button className="nav-item bottom-link" title="Help & support" onClick={() => window.open("https://github.com/itsayushnst13/sprintspace#readme", "_blank", "noopener,noreferrer")}><CircleHelp size={19}/><span>Help & support</span></button><div className="profile-row"><div className="avatar avatar-profile">{initials}</div><div className="profile-meta"><strong>{session.user?.name}</strong><span>{session.user?.email}</span></div><button className="more-button" onClick={logout} aria-label="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="topbar-left"><div className="breadcrumb"><button type="button" className="breadcrumb-workspace-trigger" onClick={() => { setActiveNav("Overview"); setSelectedProjectId(null); setSelectedTaskId(null); setMobileNav(false); }} aria-label="Go to workspace overview" title="Go to workspace overview">Workspace</button><ChevronRight size={18}/><button type="button" className="breadcrumb-current-trigger" onClick={() => { setActiveNav(activeNav); setSelectedProjectId(null); setSelectedTaskId(null); setMobileNav(false); }} aria-label={`Go to ${activeNav}`} title={`Go to ${activeNav}`}>{activeNav}</button></div></div><div className="topbar-actions"><div className="search-wrap" ref={searchWrapRef}><button className={`search-trigger ${searchOpen ? "search-trigger-open" : ""}`} onClick={() => setSearchOpen((open) => !open)} aria-expanded={searchOpen} aria-controls="global-search-panel"><Search size={20} strokeWidth={2}/><span>Search anything...</span><kbd>⌘ K</kbd></button>{searchOpen && <div className="search-panel" id="global-search-panel" role="search"><div className="search-input-row"><Search size={20}/><input autoFocus value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search projects and tasks..."/><button aria-label="Close search" onClick={() => { setSearchOpen(false); setSearchTerm(""); }}><X size={19}/></button></div>{searchTerm.trim() && <div className="search-results">{projectRows.filter((project) => project.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0,4).map((project) => <button key={project.id} onClick={() => {openProject(project.id);setActiveNav("Projects");setSearchOpen(false);setSearchTerm("");}}><FolderKanban size={18}/><span>{project.name}</span><small>Project</small></button>)}{taskRows.filter((task) => task.title.toLowerCase().includes(searchTerm.toLowerCase())).slice(0,5).map((task) => <button key={task.taskId} onClick={() => {openTask(task.taskId);setSearchOpen(false);setSearchTerm("");}}><ListTodo size={18}/><span>{task.title}</span><small>Task</small></button>)}{projectRows.every((project) => !project.name.toLowerCase().includes(searchTerm.toLowerCase())) && taskRows.every((task) => !task.title.toLowerCase().includes(searchTerm.toLowerCase())) && <p>No matching projects or tasks.</p>}</div>}</div>}</div><div className="popover-wrap"><button className="icon-button notification-button" onClick={()=>setNotificationsOpen(!notificationsOpen)} aria-label="Notifications"><Bell size={23} strokeWidth={1.9}/>{(notificationsQuery.data?.unreadCount ?? 0) > 0 && <span className="notification-count">{notificationsQuery.data?.unreadCount}</span>}</button>{notificationsOpen&&<div className="popover notification-popover"><strong>Notifications ({notificationsQuery.data?.unreadCount ?? 0} unread)</strong>{(notificationsQuery.data?.notifications ?? []).length===0?<p>No new notifications.</p>:(notificationsQuery.data?.notifications ?? []).map((notification)=><button key={notification._id} className={`notification-item ${notification.readAt ? "read" : ""}`} onClick={async()=>{if(!notification.readAt){await apiRequest(`/workspaces/${workspaceId}/notifications/${notification._id}/read`,{method:"PATCH"});await notificationsQuery.refetch();}if(notification.entityType==="task"&&notification.entityId){const refreshed=await tasksQuery.refetch();const task=refreshed.data?.tasks.find((item)=>item._id===notification.entityId);if(task){setSelectedTaskId(task._id);setEditTaskStatus(task.status);setEditTaskPriority(task.priority);setEditTaskDueDate(task.dueDate?taskDueDateKey(task.dueDate):"");setEditTaskAssignee(task.assigneeId??"");setSaveTaskError("");}}}}><b>{notification.title}</b><span>{notification.body}</span></button>)}</div>}</div><div className="popover-wrap profile-wrap" ref={profileWrapRef}>  <button type="button" className="profile-trigger" onClick={() => setProfileOpen((open) => !open)} aria-label="Open your user details" aria-haspopup="dialog" aria-expanded={profileOpen}>    <span className="avatar avatar-small avatar-profile">{initials}</span>  </button>  {profileOpen && <div className="popover profile-popover" role="dialog" aria-label="Your user details">    <div className="profile-popover-heading"><span className="avatar avatar-profile profile-popover-avatar">{initials}</span><div><strong>{session.user?.name ?? "User"}</strong><span>{session.user?.email ?? ""}</span></div></div>    <div className="profile-detail-list">      <div><span>Current workspace</span><strong>{session.workspace?.name ?? "No workspace selected"}</strong></div>      <div><span>Your role</span><strong>{session.workspace?.role === "Member" ? "Developer" : session.workspace?.role ?? "Workspace member"}</strong></div>    </div>    <button type="button" className="profile-popover-action" onClick={() => { setActiveNav("Settings"); setProfileOpen(false); }}><Settings2 size={17}/> Account settings</button>    <button type="button" className="profile-popover-action profile-signout" onClick={() => { setProfileOpen(false); void logout(); }}><LogOut size={17}/> Sign out</button>  </div>}</div></div></header>
      
      <div className="content-wrap">{activeNav === "Team" ? <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> WORKSPACE PEOPLE</div><h1>Your team <span className="wave">✦</span></h1><p>Manage workspace members and invite teammates to collaborate.</p></div></section>
        <section className="surface team-panel"><div className="section-heading"><div><h2>Members</h2><p>{teamQuery.data?.members.length ?? 0} active workspace members</p></div></div>
          {teamQuery.isLoading ? <p className="team-empty">Loading members…</p> : <div className="team-list">{(teamQuery.data?.members ?? []).map((member) => { const user = typeof member.userId === "object" ? member.userId : null; return <div className="team-row" key={member._id}><div className="avatar avatar-profile">{user?.name?.split(" ").map((part) => part[0]).slice(0,2).join("") ?? "U"}</div><div className="team-identity"><strong>{user?.name ?? "Workspace member"}</strong><span>{user?.email ?? ""}</span></div><span className={`role-pill role-${member.role === "Member" ? "developer" : member.role.toLowerCase()}`}>{member.role === "Member" ? "Developer" : member.role}</span>{session.workspace?.role === "Admin" && member.role !== "Admin" && <select className="member-role-select" value={member.role} aria-label={`Change role for ${user?.name ?? "member"}`} onChange={async (event) => { await apiRequest(`/workspaces/${workspaceId}/team/members/${member._id}/role`, { method: "PATCH", body: JSON.stringify({ role: event.target.value }) }); await teamQuery.refetch(); }}><option value="Developer">Developer</option><option value="Member">Legacy Member</option><option value="Manager">Manager</option></select>}{(session.workspace?.role === "Admin" || (session.workspace?.role === "Manager" && (member.role === "Member" || member.role === "Developer")) || user?._id === session.user?.id) && member.role !== "Admin" && <button className="text-button member-remove" onClick={async () => { if (!window.confirm(`Remove ${user?.name ?? "this member"} from the workspace?`)) return; await apiRequest(`/workspaces/${workspaceId}/team/members/${member._id}`, { method: "DELETE" }); await teamQuery.refetch(); }}>Remove</button>}</div>; })}</div>}
        </section>
        <section className="surface team-panel"><div className="section-heading"><div><h2>Have an invitation?</h2><p>Paste the one-time invitation token you received to join another workspace.</p></div></div><form className="invite-form" onSubmit={acceptInvite}><input value={acceptInviteToken} onChange={(event) => setAcceptInviteToken(event.target.value)} placeholder="Paste invitation token" required/><button className="primary-button" disabled={!acceptInviteToken.trim()}>Accept invite <ArrowRight size={15}/></button></form>{inviteFeedback && <p className="team-feedback">{inviteFeedback}</p>}</section>
        {canManageWorkspace && <section className="surface team-panel"><div className="section-heading"><div><h2>Invite a teammate</h2><p>Invitations expire after 7 days. Email delivery is not configured yet.</p></div></div><form className="invite-form" onSubmit={sendInvite}><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@company.com" required/><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "Manager" | "Developer")}><option value="Developer">Developer</option>{session.workspace?.role === "Admin" && <option value="Manager">Manager</option>}</select><button className="primary-button" disabled={!inviteEmail.trim()}><Plus size={15}/> Create invite</button></form>{inviteToken && <div className="invite-token"><strong>One-time invite token</strong><code>{inviteToken}</code><button className="text-button" onClick={() => void navigator.clipboard.writeText(inviteToken)}>Copy token</button><p>Share this token securely. The invitee must sign in with the invited email and accept it through the invitation API.</p></div>}<div className="pending-invites"><h3>Pending invitations</h3>{(invitationsQuery.data?.invitations ?? []).length === 0 ? <p className="team-empty">No pending invitations.</p> : invitationsQuery.data?.invitations.map((invitation) => <div className="team-row" key={invitation._id}><div className="team-identity"><strong>{invitation.email}</strong><span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></div><span className={`role-pill role-${invitation.role === "Member" ? "developer" : invitation.role.toLowerCase()}`}>{invitation.role === "Member" ? "Developer" : invitation.role}</span><button className="text-button member-remove" onClick={async () => { await apiRequest(`/workspaces/${workspaceId}/team/invitations/${invitation._id}`, { method: "DELETE" }); await invitationsQuery.refetch(); }}>Revoke</button></div>)}</div></section>}
      </> : activeNav === "Board" ? <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> TASK WORKFLOW</div><h1>Kanban board <span className="wave">✦</span></h1><p>Move work forward by dragging tasks between stages.</p></div><button className="primary-button" onClick={openCreateTask}><Plus size={16}/> New task</button></section>
        <section className="kanban-board">{boardStatuses.map((status) => { const cards = taskRows.filter((task) => task.status === status); return <div className="kanban-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain"); const task = taskRows.find((item) => item.taskId === taskId); if (task?.canUpdateStatus) void moveTask(taskId, status); }}><div className="kanban-column-head"><span className={`kanban-status-dot ${status.toLowerCase().replace(" ","-")}`}/><strong>{status}</strong><span>{cards.length}</span></div>{cards.map((task) => <article className="kanban-task-card" key={task.taskId} draggable={task.canUpdateStatus} onDragStart={(event) => { if (task.canUpdateStatus) event.dataTransfer.setData("text/plain", task.taskId); }}><button className="task-open" onClick={() => openTask(task.taskId)}>{task.title}</button><span>{task.project}</span><small>{task.assignee === "Unassigned" ? "Unassigned" : `Assigned to ${task.assignee}`}</small><div><PriorityPill priority={task.priority}/><small>{task.due}</small></div></article>)}{cards.length === 0 && <p className="kanban-empty">Drop a task here</p>}</div>; })}</section>
      </> : activeNav === "Projects" ? <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> PROJECT PORTFOLIO</div><h1>Projects <span className="wave">✦</span></h1><p>Track every initiative across your workspace.</p></div>{canManageWorkspace && <button className="primary-button" onClick={() => setCreateModal("project")}><Plus size={16}/> New project</button>}</section>
        <section className="projects-grid project-page-grid">{projectRows.map((project) => <article className="surface project-card" key={project.id}>
          <div className="project-card-top"><div className={`project-icon ${project.color}`}><FolderKanban size={18}/></div><span className="role-pill">{project.progress}% complete</span></div>
          <h3>{project.name}</h3><p className="project-team">{project.description || `Created by ${project.createdByName}`}</p>
          <div className="progress-track"><span className={project.color} style={{ width: `${project.progress}%` }}/></div>
          <div className="project-footer"><span><Check size={13}/> {project.completedTasks}/{project.totalTasks} done</span><span><CalendarDays size={13}/> {project.due}</span></div>
          <div className="project-card-actions"><button className="project-open-action" onClick={() => openProject(project.id)}><FolderOpen size={15}/> Open project</button>{session.workspace?.role === "Admin" && <button className="project-archive-action" aria-label={`Archive ${project.name}`} title="Archive project" onClick={() => void archiveProject(project.id)}><Archive size={15}/></button>}</div>
        </article>)}{projectRows.length === 0 && <div className="empty-state">No projects yet. Create your first project.</div>}</section>
      </> : activeNav === "My tasks" ? <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> PERSONAL WORKLOAD</div><h1>My tasks <span className="wave">✦</span></h1><p>Tasks assigned to you or created by you.</p></div><button className="primary-button" onClick={openCreateTask}><Plus size={16}/> New task</button></section>
        <section className="surface team-panel"><div className="section-heading"><div><h2>Your workload</h2><p>{myTaskRows.length} tasks assigned or created by you</p></div></div><div className="personal-task-list">{myTaskRows.map((task) => <div className="personal-task-row" key={task.taskId}><button className={`task-check ${task.status === "Done" ? "checked" : ""}`} disabled={!task.canUpdateStatus} title={!task.canUpdateStatus ? "Only the assignee, task creator, or a workspace manager can change status" : undefined} onClick={() => void completeTask(task.id)}>{task.status === "Done" && <Check size={12}/>}</button><div><strong>{task.title}</strong><span>{task.project} · {task.priority} priority · {task.assignee === "Unassigned" ? "Unassigned" : `Assigned to ${task.assignee}`}</span></div><StatusPill status={task.status}/><span className="personal-task-due">{task.due}</span></div>)}{myTaskRows.length === 0 && <p className="team-empty">No tasks assigned to you or created by you yet.</p>}</div></section>
      </> : activeNav === "Calendar" ? <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> DELIVERY TIMELINE</div><h1>Calendar <span className="wave">✦</span></h1><p>Tasks with a due date appear on the calendar. Tasks without one are listed below so you can schedule them.</p></div></section>
        <section className="surface calendar-panel"><div className="calendar-toolbar"><div><h2>{calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><p>{calendarMonthTaskCount} deadlines this month</p></div><div className="calendar-controls"><button onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)); setExpandedCalendarDate(null); }} aria-label="Previous month"><ChevronLeft size={16}/></button><button onClick={() => { setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setExpandedCalendarDate(null); }}>Today</button><button onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)); setExpandedCalendarDate(null); }} aria-label="Next month"><ChevronRight size={16}/></button></div></div><div className="calendar-grid"><div className="calendar-weekday">Mon</div><div className="calendar-weekday">Tue</div><div className="calendar-weekday">Wed</div><div className="calendar-weekday">Thu</div><div className="calendar-weekday">Fri</div><div className="calendar-weekday">Sat</div><div className="calendar-weekday">Sun</div>{calendarDays.map((day) => { const key = calendarDateKey(day); const dayTasks = calendarRows.filter((task) => task.dueDate && taskDueDateKey(task.dueDate) === key); const inMonth = day.getMonth() === calendarMonth.getMonth(); const isToday = key === calendarDateKey(new Date()); const isExpanded = expandedCalendarDate === key; const visibleDayTasks = isExpanded ? dayTasks : dayTasks.slice(0, 3); return <div className={`calendar-day ${inMonth ? "" : "outside-month"} ${isToday ? "today" : ""}`} key={key}><span className="calendar-day-number">{day.getDate()}</span>{visibleDayTasks.map((task) => <button className={`calendar-task-chip priority-${task.priority.toLowerCase()}`} key={task.taskId} title={task.title} onClick={() => openTask(task.taskId)}>{task.title}</button>)}{dayTasks.length > 3 && <button className="calendar-more calendar-more-toggle" aria-expanded={isExpanded} onClick={() => setExpandedCalendarDate(isExpanded ? null : key)}>{isExpanded ? "Show less" : `+${dayTasks.length - 3} more`}</button>}</div>; })}</div>{calendarMonthTaskCount === 0 && <p className="calendar-empty-note">{calendarRows.length > 0 ? "No task deadlines fall in this month. Use the month arrows to see other scheduled work." : taskRows.length > 0 ? "No deadlines have been set yet. Add a due date to a task below to place it on the calendar." : "No tasks yet. Create a task in a project, then set its due date to see it here."}</p>}{unscheduledTasks.length > 0 && <section className="calendar-unscheduled"><div className="calendar-unscheduled-head"><div><h3>Needs a deadline</h3><p>{unscheduledTasks.length} tasks are not scheduled yet</p></div></div><div className="calendar-unscheduled-list">{unscheduledTasks.map((task) => <button className="calendar-unscheduled-task" key={task.taskId} onClick={() => openTask(task.taskId)}><span><strong>{task.title}</strong><small>{task.project} · {task.assignee === "Unassigned" ? "Unassigned" : `Assigned to ${task.assignee}`}</small></span><span className="calendar-set-date">Set deadline <ArrowRight size={13}/></span></button>)}</div></section>}<div className="calendar-legend"><span><i className="legend-dot priority-high"/>High priority</span><span><i className="legend-dot priority-medium"/>Medium priority</span><span><i className="legend-dot priority-low"/>Low priority</span></div></section>
      </> : activeNav === "Activity" ? <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> WORKSPACE HISTORY</div><h1>Activity feed <span className="wave">✦</span></h1><p>Recent changes and collaboration across your workspace.</p></div></section>
        <section className="surface team-panel"><div className="section-heading"><div><h2>Recent activity</h2><p>Latest 50 workspace events</p></div></div>{activityQuery.isLoading ? <p className="team-empty">Loading activity…</p> : (activityQuery.data?.activity ?? []).length === 0 ? <p className="team-empty">No activity yet. Create a project or task to get started.</p> : <div className="activity-feed">{activityQuery.data?.activity.map((item) => {
          const actorName = typeof item.actorId === "object" ? item.actorId.name : "A teammate";
          const entityLabel = activityEntityLabel(item.entityType);
          return <button type="button" className={`activity-feed-row activity-feed-button activity-event-${item.action.split(".").pop() ?? "event"}`} key={item._id} onClick={() => openActivityItem(item)} aria-label={`Open ${entityLabel.toLowerCase()} activity: ${item.summary}`}>
            <span className="activity-feed-icon">{activityActionIcon(item.action)}</span>
            <span className="activity-feed-content">
              <span className="activity-feed-header"><strong className="activity-feed-actor">{actorName}</strong><time>{formatActivityTimestamp(item.createdAt)}</time></span>
              <span className="activity-feed-summary">{item.summary}</span>
              <span className="activity-feed-context"><span className={`activity-entity-tag activity-entity-${item.entityType ?? "workspace"}`}>{entityLabel}</span><span>Open details</span></span>
            </span>
            <ArrowUpRight className="activity-open-icon" size={18}/>
          </button>;
        })}</div>}</section>
      </> : activeNav === "Settings" ? <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> ACCOUNT & WORKSPACE</div><h1>Settings <span className="wave">✦</span></h1><p>Review your signed-in account and the workspace role currently active.</p></div></section>
        <section className="surface team-panel settings-panel">
          <div className="section-heading"><div><h2>Your account</h2><p>Personal sign-in details</p></div></div>
          <div className="settings-detail-row"><span>Name</span><strong>{session.user?.name}</strong></div>
          <div className="settings-detail-row"><span>Email</span><strong>{session.user?.email}</strong></div>
          <div className="section-heading settings-workspace-heading"><div><h2>Current workspace</h2><p>Permissions apply to this workspace only</p></div></div>
          <div className="settings-detail-row"><span>Workspace</span><strong>{session.workspace?.name}</strong></div>
          <div className="settings-detail-row"><span>Your role</span><strong>{session.workspace?.role === "Member" ? "Developer" : session.workspace?.role}</strong></div>
          <div className="settings-actions"><button className="primary-button" onClick={() => setActiveNav("Team")}><Users size={15}/> Manage team</button><button className="secondary-button" onClick={() => setWorkspaceMenuOpen(true)}>Switch workspace</button></div>
        </section>
      </> : <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> YOUR WORKSPACE</div><h1>Good morning, {session.user?.name.split(" ")[0]??"there"} <span className="wave">✦</span></h1><p>Here's what's happening across your workspace today.</p></div>{canManageWorkspace && <button className="primary-button" onClick={()=>setCreateModal("project")}><Plus size={17}/> Create new project</button>}</section>
        <section className="stats-grid"><StatCard title="Total projects" value={metrics?.projects.toString() ?? "—"} change="Live workspace data" icon={<FolderKanban size={18}/>} tone="violet"/><StatCard title="Tasks completed" value={metrics?.completedTasks.toString() ?? "—"} change={`${metrics?.tasks ?? 0} total tasks`} icon={<CheckCircle2 size={18}/>} tone="green"/><StatCard title="Team members" value={metrics?.members.toString() ?? "—"} change="Active memberships" icon={<Users size={18}/>} tone="blue"/><StatCard title="Completion rate" value={`${metrics?.completionRate ?? 0}%`} change={`${metrics?.dueIn24Hours ?? 0} due in 24 hours`} icon={<Target size={18}/>} tone="orange"/></section>
        <section className="overview-grid"><div className="surface activity-card"><div className="section-heading"><div><h2>Task status snapshot</h2><p>Live task counts from this workspace</p></div><span className="chart-range-label">All workspace tasks</span></div><div className="chart-legend"><span><i className="legend-dot completed-dot"/>Tasks by status</span></div><div className="chart-wrap">{chartData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:5,left:-20,bottom:0}}><defs><linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7868ed" stopOpacity={.18}/><stop offset="95%" stopColor="#7868ed" stopOpacity={0}/></linearGradient><linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#51b9a1" stopOpacity={.13}/><stop offset="95%" stopColor="#51b9a1" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#eff0f5" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:"#9296a8",fontSize:11}} dy={10}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#9296a8",fontSize:11}}/><Tooltip contentStyle={{border:"1px solid #ececf2",borderRadius:12,boxShadow:"0 8px 25px #20243a12",fontSize:12}}/><Area type="monotone" dataKey="completed" stroke="#7868ed" strokeWidth={2.5} fill="url(#completedFill)"/></AreaChart></ResponsiveContainer> : <div className="chart-empty">No task activity yet. Create a project and assign its first task.</div>}</div></div>
          <div className="surface focus-card"><div className="section-heading"><div><h2>Team focus</h2><p>Your workspace at a glance</p></div><button className="more-button" title="Manage team" aria-label="Manage team" onClick={() => setActiveNav("Team")}><Users size={18}/></button></div><div className="focus-score"><div><span>Completion rate</span><strong>{metrics?.completionRate ?? 0}<span>/100</span></strong></div><div className="score-ring"><div><strong>{metrics?.completionRate ?? 0}</strong><small>{(metrics?.completionRate ?? 0) >= 75 ? "Great" : "In progress"}</small></div></div></div><div className="score-track"><span style={{width:`${metrics?.completionRate ?? 0}%`}}/></div><div className="focus-divider"/><div className="focus-row"><div className="focus-icon violet-soft"><Zap size={16}/></div><div><strong>{metrics?.completedTasks ?? 0} tasks</strong><span>Completed in workspace</span></div><em className="neutral-em">Workspace total</em></div><div className="focus-row"><div className="focus-icon green-soft"><Clock3 size={16}/></div><div><strong>{metrics?.dueIn24Hours ?? 0} tasks</strong><span>Due in the next 24 hours</span></div><em className="neutral-em">Next 24h</em></div></div>
        </section>
        <section className="surface projects-card"><div className="section-heading"><div><h2>Projects in progress</h2><p>Keep an eye on what your team is building</p></div><button className="text-button" onClick={()=>setActiveNav("Projects")}>View all projects <ArrowRight size={15}/></button></div><div className="projects-grid">{projectRows.map((project)=><div className="project-card" key={project.id}><div className="project-card-top"><div className={`project-icon ${project.color}`}><FolderKanban size={18}/></div><button className="more-button" title={`Open ${project.name}`} aria-label={`Open ${project.name}`} onClick={() => openProject(project.id)}><FolderOpen size={17}/></button></div><h3>{project.name}</h3><p className="project-team">{project.createdByName}</p><div className="progress-heading"><span>Progress</span><strong>{project.progress}%</strong></div><div className="progress-track"><span className={project.color} style={{width:`${project.progress}%`}}/></div><div className="project-footer"><span><Check size={13}/> {project.tasks} tasks</span><span><CalendarDays size={13}/> {project.due}</span></div></div>)}</div></section>
        <section className="surface tasks-card"><div className="section-heading task-heading"><div><h2>Recent tasks</h2><p>Stay on top of the latest team updates</p></div><div className="task-actions"><button className="text-button" onClick={openCreateTask}>+ New task</button><select className="select-button" value={taskStatus} onChange={(event)=>setTaskStatus(event.target.value)}><option>All tasks</option><option>In progress</option><option>In review</option><option>Todo</option><option>Done</option></select><select className="select-button" value={taskPriorityFilter} onChange={(event)=>setTaskPriorityFilter(event.target.value)}><option>All priorities</option><option>High</option><option>Medium</option><option>Low</option></select><select className="select-button" value={taskProjectFilter} onChange={(event)=>setTaskProjectFilter(event.target.value)}><option>All projects</option>{projectRows.map((project) => <option key={project.id}>{project.name}</option>)}</select><button className="text-button" onClick={()=>setShowAll(!showAll)}>{showAll?"Show less":"View all"} <ArrowRight size={15}/></button></div></div><div className="task-table"><div className="task-table-head"><span>TASK</span><span>ASSIGNEE</span><span>PRIORITY</span><span>STATUS</span><span>DUE DATE</span></div>{visibleTasks.map((task)=><div className="task-table-row" key={task.id}><div className="task-title-cell"><button className={`task-check ${task.status === "Done" ? "checked" : ""}`} disabled={!task.canUpdateStatus} title={!task.canUpdateStatus ? "Only the assignee, task creator, or a workspace manager can change status" : undefined} onClick={()=>completeTask(task.id)} aria-label={`Mark ${task.id} complete`}>{task.status === "Done"&&<Check size={12}/>}</button><div><button className="task-open" onClick={() => openTask(task.taskId)}>{task.title}</button><span>{task.id} · {task.project}</span></div></div><div className="assignee-cell" title={task.assigneeEmail ? `${task.assignee} · ${task.assigneeEmail}` : task.assignee}><div className={`avatar avatar-tiny ${task.tone}`}>{task.initials}</div><span>{task.assignee}</span></div><div><PriorityPill priority={task.priority}/></div><div><StatusPill status={task.status}/></div><div className="due-cell">{task.due==="Today"?<span className="due-today">{task.due}</span>:task.due}</div></div>)}{visibleTasks.length===0&&<div className="empty-state">No tasks in this status.</div>}</div><div className="table-foot"><span>Showing {visibleTasks.length} of {taskRows.length} tasks</span></div></section>
        <footer className="page-footer"><span>© 2026 SprintSpace, Inc.</span><span>Made for teams that build great things <span className="footer-star">✦</span></span></footer>
      </>}
      </div>
    </main>
    {createModal && <div className="modal-scrim" onClick={() => setCreateModal(null)}><section className="create-modal" onClick={(event) => event.stopPropagation()}><div className="comment-modal-head"><div><span>WORKSPACE</span><h2>{createModal === "project" ? "Create a project" : createModal === "task" ? "Create a task" : "Create a workspace"}</h2></div><button className="icon-button" onClick={() => setCreateModal(null)} aria-label="Close dialog"><X size={18}/></button></div>{createModal === "project" ? <form className="create-form" onSubmit={createProject}>
        <label>Project name<input autoFocus value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="e.g. Razorpay integration" minLength={2} maxLength={120} required/></label>
        <label>Description (optional)<textarea value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder="What is this project meant to deliver?" maxLength={2000} rows={3}/></label>
        <label>Project deadline (optional)<input type="date" value={newProjectDueDate} onChange={(event) => setNewProjectDueDate(event.target.value)}/></label>
        <button className="primary-button" disabled={!newProjectName.trim()}>Create project <ArrowRight size={14}/></button>
      </form> : createModal === "task" ? <form className="create-form" onSubmit={createTask}><label>Task title<input autoFocus value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="What needs to get done?" minLength={2} maxLength={180} required/></label>{projectRows.length === 0 ? <div className="task-project-setup">{(session.workspace?.role === "Developer" || session.workspace?.role === "Member") ? <p>This workspace has no active projects. Ask a workspace Admin or Manager to create a project before adding tasks.</p> : <><p>This workspace has no projects yet. Create your first project here, then your task will stay in this form.</p><label>First project name<input value={newProjectForTaskName} onChange={(event) => setNewProjectForTaskName(event.target.value)} placeholder="e.g. Payments or Website" minLength={2} maxLength={120}/></label><button type="button" className="secondary-button" onClick={() => void createProjectForTask()} disabled={newProjectForTaskName.trim().length < 2}>Create project</button></>}</div> : <label>Project<select value={newTaskProjectId} onChange={(event) => setNewTaskProjectId(event.target.value)} required><option value="">Choose a project</option>{projectRows.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}<label>Priority<select value={newTaskPriority} onChange={(event) => setNewTaskPriority(event.target.value as "Low" | "Medium" | "High")}><option>Low</option><option>Medium</option><option>High</option></select></label>{canManageWorkspace ? <label>Assign to developer<select value={newTaskAssignee} onChange={(event) => setNewTaskAssignee(event.target.value)} required><option value="">Choose a developer</option>{(teamQuery.data?.members ?? []).filter((member) => member.role === "Developer" || member.role === "Member").map((member) => { const user = typeof member.userId === "object" ? member.userId : null; return user ? <option key={member._id} value={user._id}>{user.name}</option> : null; })}</select>{teamQuery.isLoading ? <small className="field-hint">Loading developers…</small> : !(teamQuery.data?.members ?? []).some((member) => member.role === "Developer" || member.role === "Member") && <small className="field-hint">No developers yet. Invite one from Team before creating a task.</small>}</label> : <div className="task-self-assignment">Assigned to <strong>{session.user?.name}</strong></div>}<label>Due date (optional)<input type="date" value={newTaskDueDate} onChange={(event) => setNewTaskDueDate(event.target.value)}/></label>{createTaskError && <p className="form-error" role="alert">{createTaskError}</p>}<button className="primary-button" disabled={!newTaskTitle.trim() || !newTaskProjectId || !newTaskAssignee || createTaskSaving}>{createTaskSaving ? "Creating task…" : "Create task"} <ArrowRight size={14}/></button></form> : <form className="create-form" onSubmit={createWorkspace}><label>Workspace name<input autoFocus value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} placeholder="e.g. Product team" minLength={2} maxLength={80} required/></label><button className="primary-button" disabled={!newWorkspaceName.trim()}>Create workspace <ArrowRight size={14}/></button></form>}</section></div>}
    {selectedProject && <div className="modal-scrim" onClick={() => setSelectedProjectId(null)}><section className="project-detail-modal" onClick={(event) => event.stopPropagation()}>
      <div className="comment-modal-head"><div><span>PROJECT DETAILS</span><h2>{selectedProject.name}</h2></div><button className="icon-button" onClick={() => setSelectedProjectId(null)} aria-label="Close project details"><X size={18}/></button></div>
      <div className="project-detail-content">
        <p className="project-detail-description">{selectedProject.description || "No project description yet. Create a clear goal so everyone knows what this project should deliver."}</p>
        <div className="project-detail-meta"><span><Users size={15}/> Created by <strong>{selectedProject.createdByName}</strong></span><span><CalendarDays size={15}/> Deadline <strong>{selectedProject.due}</strong></span></div>
        <div className="project-detail-progress"><div><strong>{selectedProject.progress}% complete</strong><span>{selectedProject.completedTasks} of {selectedProject.totalTasks} tasks done</span></div><div className="progress-track"><span className={selectedProject.color} style={{width:`${selectedProject.progress}%`}}/></div></div>
        <div className="project-detail-task-head"><div><h3>Project tasks</h3><p>Who owns each task and its current status</p></div><button className="primary-button" onClick={() => createTaskForProject(selectedProject.id)}><Plus size={15}/> Add task</button></div>
        <div className="project-detail-task-list">{taskRows.filter((task) => task.projectId === selectedProject.id).map((task) => <button className="project-detail-task-row" key={task.taskId} onClick={() => openTask(task.taskId)}>
          <div className="project-detail-task-main"><strong>{task.title}</strong><span>Assigned to {task.assignee} · Created by {task.createdByName}</span></div>
          <PriorityPill priority={task.priority}/><StatusPill status={task.status}/><small>{task.due}</small><ArrowUpRight size={15}/>
        </button>)}{selectedProject.totalTasks === 0 && <p className="project-detail-empty">No tasks in this project yet. Add the first task and assign it to a developer.</p>}</div>
      </div>
      <div className="project-detail-footer"><span>{selectedProject.tasks} total tasks</span>{session.workspace?.role === "Admin" && <button className="danger-button" onClick={() => { setSelectedProjectId(null); void archiveProject(selectedProject.id); }}><Archive size={14}/> Archive project</button>}</div>
    </section></div>}
    {selectedTaskId && <div className="modal-scrim" onClick={() => setSelectedTaskId(null)}><section className="comment-modal" onClick={(event) => event.stopPropagation()}><div className="comment-modal-head"><div><span>TASK DISCUSSION</span><h2>{taskRows.find((task) => task.taskId === selectedTaskId)?.title ?? "Task comments"}</h2></div><button className="icon-button" onClick={() => setSelectedTaskId(null)} aria-label="Close comments"><X size={18}/></button></div>{(canManageWorkspace || selectedTask?.createdBy === session.user?.id || selectedTask?.assigneeId === session.user?.id) && <div className="task-edit-fields"><label>Status<select value={editTaskStatus} onChange={(event) => setEditTaskStatus(event.target.value as TaskStatus)}><option>Todo</option><option>In progress</option><option>In review</option><option>Done</option></select></label>{(canManageWorkspace || selectedTask?.createdBy === session.user?.id) && <><label>Priority<select value={editTaskPriority} onChange={(event) => setEditTaskPriority(event.target.value as "Low" | "Medium" | "High")}><option>Low</option><option>Medium</option><option>High</option></select></label>{canManageWorkspace && <label>Assignee<select value={editTaskAssignee} onChange={(event) => setEditTaskAssignee(event.target.value)}><option value="" disabled>Choose a developer</option>{(teamQuery.data?.members ?? []).filter((member) => member.role === "Developer" || member.role === "Member").map((member) => { const user = typeof member.userId === "object" ? member.userId : null; return user ? <option key={member._id} value={user._id}>{user.name}</option> : null; })}</select></label>}<label>Due date<input type="date" value={editTaskDueDate} onChange={(event) => setEditTaskDueDate(event.target.value)}/></label></> }{saveTaskError && <p className="form-error" role="alert">{saveTaskError}</p>}<button className="primary-button" disabled={saveTaskSaving} onClick={() => void saveTaskDetails()}>{saveTaskSaving ? "Saving..." : "Save task details"}</button>{(session.workspace?.role === "Admin" || session.workspace?.role === "Manager") && <button className="danger-button" onClick={() => void deleteTask()}>Delete task</button>}</div>}<div className="comment-list">{(commentsQuery.data?.comments ?? []).map((comment) => <article className="comment-item" key={comment._id}><div className="comment-avatar">{typeof comment.authorId === "object" ? comment.authorId.name.slice(0,1).toUpperCase() : "T"}</div><div><strong>{typeof comment.authorId === "object" ? comment.authorId.name : "Teammate"}</strong><time>{new Date(comment.createdAt).toLocaleString()}</time><p>{comment.body}</p></div></article>)}{commentsQuery.isLoading && <p className="comment-empty">Loading discussion…</p>}{!commentsQuery.isLoading && (commentsQuery.data?.comments.length ?? 0)===0 && <p className="comment-empty">No comments yet. Start the conversation.</p>}</div><form className="comment-form" onSubmit={submitComment}><textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Write a comment…" maxLength={4000}/><button className="primary-button" disabled={!commentDraft.trim()}>Send comment <ArrowRight size={14}/></button></form></section></div>}
  </div>;
}

function StatCard({title,value,change,icon,tone}:{title:string;value:string;change:string;icon:React.ReactNode;tone:string}) {
  return <div className="surface stat-card"><div className="stat-top"><span>{title}</span><div className={`stat-icon ${tone}`}>{icon}</div></div><strong className="stat-value">{value}</strong><div className="stat-change"><span className="trend-icon"><ArrowUpRight size={13}/></span>{change}</div></div>;
}
function PriorityPill({priority}:{priority:"High"|"Medium"|"Low"}) {
  const Icon=priority==="High"?ArrowUp:priority==="Low"?ArrowDown:Activity;
  return <span className={`priority-pill priority-${priority.toLowerCase()}`}><Icon size={12}/>{priority}</span>;
}
function StatusPill({status}:{status:TaskStatus}) {
  return <span className={`status-pill status-${status.toLowerCase().replace(" ","-")}`}><i/>{status}</span>;
}
export default App;
