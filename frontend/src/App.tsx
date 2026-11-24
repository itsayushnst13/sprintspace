import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  Activity, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Bell, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Command, FolderKanban, LayoutDashboard, ListTodo, LogOut, Menu,
  MoreHorizontal, Plus, Search, Settings2, Sparkles, Target, Users, X, Zap
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { weeklyActivity, type TaskStatus } from "./data/demo";
import { useSession } from "./store/session";
import { AuthScreen } from "./components/AuthScreen";
import { apiRequest, getAccessToken } from "./lib/api";

type NavItem = { label: string; icon: typeof LayoutDashboard };
const primaryNav: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "My tasks", icon: ListTodo },
  { label: "Projects", icon: FolderKanban }, { label: "Calendar", icon: CalendarDays },
  { label: "Team", icon: Users }
];

type AnalyticsResponse = { metrics: { projects: number; members: number; tasks: number; completedTasks: number; dueIn24Hours: number; completionRate: number }; tasksByStatus: Array<{ _id: string; count: number }> };
type ProjectRecord = { _id: string; name: string; color?: string; dueDate?: string | null };
type TaskRecord = { _id: string; title: string; projectId: string; status: TaskStatus; priority: "High" | "Medium" | "Low"; assigneeId?: string | null; dueDate?: string | null };
type CommentRecord = { _id: string; body: string; createdAt: string; authorId: { name: string } | string };

function App() {
  const session = useSession();
  const queryClient = useQueryClient();
  const bootStarted = useRef(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const workspaceId = session.workspace?.id;

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    if (session.authenticated) { session.markReady(); return; }
    apiRequest<{ accessToken: string; user: { id: string; name: string; email: string }; workspace?: { id: string; name: string; slug: string; role?: string } }>("/auth/refresh", { method: "POST" })
      .then((result) => session.establish(result.accessToken, result.user, result.workspace))
      .catch(() => undefined)
      .finally(() => session.markReady());
  }, []);

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
  const commentsQuery = useQuery({
    queryKey: ["task-comments", workspaceId, selectedTaskId],
    queryFn: () => apiRequest<{ comments: CommentRecord[] }>(`/workspaces/${workspaceId}/tasks/${selectedTaskId}/comments`),
    enabled: session.authenticated && Boolean(workspaceId) && Boolean(selectedTaskId)
  });
  const notificationsQuery = useQuery({
    queryKey: ["workspace-notifications", workspaceId],
    queryFn: () => apiRequest<{ notifications: Array<{ _id: string; title: string; body: string; readAt?: string | null; createdAt: string }>; unreadCount: number }>(`/workspaces/${workspaceId}/notifications`),
    enabled: session.authenticated && Boolean(workspaceId)
  });


  useEffect(() => {
    if (!session.authenticated || !workspaceId || !getAccessToken()) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5001", {
      auth: { token: getAccessToken() }, transports: ["websocket", "polling"]
    });
    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("workspace:join", workspaceId);
    });
    socket.on("disconnect", () => setSocketConnected(false));
    const refreshWorkspaceData = () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-analytics", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-projects", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-tasks", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-notifications", workspaceId] });
    };
    socket.on("task:created", refreshWorkspaceData);
    socket.on("task:updated", refreshWorkspaceData);
    socket.on("task:deleted", refreshWorkspaceData);
    socket.on("project:created", refreshWorkspaceData);
    socket.on("project:updated", refreshWorkspaceData);
    socket.on("comment:created", refreshWorkspaceData);
    socket.on("notification:created", refreshWorkspaceData);
    return () => { socket.disconnect(); setSocketConnected(false); };
  }, [session.authenticated, workspaceId, queryClient]);
  const [activeNav, setActiveNav] = useState("Overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [taskStatus, setTaskStatus] = useState("All tasks");
  const [checkedTasks, setCheckedTasks] = useState<string[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const metrics = analyticsQuery.data?.metrics;
  const chartData = analyticsQuery.data?.tasksByStatus.map((item) => ({ day: item._id, completed: item.count, created: 0 })) ?? weeklyActivity;
  const projectRows = (projectsQuery.data?.projects ?? []).map((project) => {
    const projectTasks = tasksQuery.data?.tasks.filter((task) => task.projectId === project._id) ?? [];
    const done = projectTasks.filter((task) => task.status === "Done").length;
    return { id: project._id, name: project.name, team: "Workspace project", color: project.color ?? "violet", progress: projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0, due: project.dueDate ? new Date(project.dueDate).toLocaleDateString() : "No due date", tasks: `${done}/${projectTasks.length}` };
  });
  const taskRows = (tasksQuery.data?.tasks ?? []).map((task) => ({
    id: task._id.slice(-6).toUpperCase(), taskId: task._id, title: task.title,
    project: projectRows.find((project) => project.id === task.projectId)?.name ?? "Workspace task",
    assignee: task.assigneeId ? task.assigneeId.slice(-6) : "Unassigned",
    initials: task.assigneeId ? "TM" : "—", tone: "sky", priority: task.priority,
    status: task.status, due: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No due date"
  }));
  const visibleTasks = useMemo(() => taskRows.filter((task) => taskStatus === "All tasks" || task.status === taskStatus).slice(0, showAll ? taskRows.length : 5), [taskRows, taskStatus, showAll]);

  if (!session.ready) return <div className="auth-loading"><div className="brand-mark"><Command size={19}/></div><span>Restoring your workspace…</span></div>;
  if (!session.authenticated) return <AuthScreen />;

  const completeTask = (id: string) => setCheckedTasks((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const submitComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTaskId || !commentDraft.trim()) return;
    await apiRequest(`/workspaces/${workspaceId}/tasks/${selectedTaskId}/comments`, { method: "POST", body: JSON.stringify({ body: commentDraft.trim() }) });
    setCommentDraft("");
    await commentsQuery.refetch();
  };
  const logout = async () => {
    await apiRequest<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
    session.clear();
  };
  const initials = session.user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") ?? "U";

  return <div className="app-shell">
    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand-lockup"><div className="brand-mark"><Command size={19} strokeWidth={2.5} /></div><span>Sprint<span className="brand-light">Space</span></span><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button></div>
      <button className="workspace-switch"><div className="workspace-avatar">N</div><div className="workspace-meta"><strong>{session.workspace?.name ?? "My workspace"}</strong><span>{session.workspace?.role ?? "Workspace member"}</span></div><ChevronDown size={16} className="subtle-icon" /></button>
      <div className="nav-section"><p className="nav-label">WORKSPACE</p><nav>{primaryNav.map(({label,icon:Icon}) => <button key={label} className={`nav-item ${activeNav===label?"active":""}`} onClick={()=>{setActiveNav(label);setMobileNav(false);}}><Icon size={18} strokeWidth={1.8}/><span>{label}</span>{label==="My tasks"&&<span className="nav-count">8</span>}</button>)}</nav></div>
      <div className="nav-section projects-nav"><div className="nav-label-row"><p className="nav-label">YOUR PROJECTS</p><button className="tiny-icon" aria-label="Add project"><Plus size={15}/></button></div><button className="project-nav-item"><span className="project-dot dot-violet"/>Website redesign</button><button className="project-nav-item"><span className="project-dot dot-blue"/>Mobile app v2.0</button><button className="project-nav-item"><span className="project-dot dot-orange"/>Q4 growth campaign</button><button className="project-nav-item muted-link"><Plus size={14}/>Add project</button></div>
      <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={16}/></div><strong>Make teamwork flow</strong><p>Unlock more projects and advanced insights.</p><button onClick={()=>setActiveNav("Settings")}>Explore plans <ArrowRight size={14}/></button></div><button className="nav-item bottom-link" onClick={()=>setActiveNav("Settings")}><Settings2 size={18}/>Settings</button><button className="nav-item bottom-link"><CircleHelp size={18}/>Help & support</button><div className="profile-row"><div className="avatar avatar-profile">{initials}</div><div className="profile-meta"><strong>{session.user?.name}</strong><span>{session.user?.email}</span></div><button className="more-button" onClick={logout} aria-label="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/><strong>{activeNav}</strong>{socketConnected && <span className="socket-indicator">● Live</span>}</div></div><div className="topbar-actions"><button className="search-trigger" onClick={()=>setSearchOpen(!searchOpen)}><Search size={16}/><span>Search anything...</span><kbd>⌘ K</kbd></button><div className="popover-wrap"><button className="icon-button notification-button" onClick={()=>setNotificationsOpen(!notificationsOpen)} aria-label="Notifications"><Bell size={18}/><i/></button>{notificationsOpen&&<div className="popover notification-popover"><strong>Notifications ({notificationsQuery.data?.unreadCount ?? 0} unread)</strong>{(notificationsQuery.data?.notifications ?? []).length===0?<p>No new notifications.</p>:(notificationsQuery.data?.notifications ?? []).map((notification)=><button key={notification._id} className={`notification-item ${notification.readAt ? "read" : ""}`} onClick={async()=>{await apiRequest(`/workspaces/${workspaceId}/notifications/${notification._id}/read`,{method:"PATCH"});await notificationsQuery.refetch();}}><b>{notification.title}</b><span>{notification.body}</span></button>)}</div>}}</div><div className="avatar avatar-small avatar-profile">{initials}</div></div></header>
      {searchOpen&&<div className="search-panel"><Search size={18}/><input autoFocus placeholder="Search projects, tasks, people..."/><button onClick={()=>setSearchOpen(false)}><X size={16}/></button></div>}
      <div className="content-wrap">
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> YOUR WORKSPACE</div><h1>Good morning, {session.user?.name.split(" ")[0]??"there"} <span className="wave">✦</span></h1><p>Here's what's happening across your workspace today.</p></div><button className="primary-button" onClick={()=>setActiveNav("Projects")}><Plus size={17}/> Create new project</button></section>
        <section className="stats-grid"><StatCard title="Total projects" value={metrics?.projects.toString() ?? "—"} change="Live workspace data" icon={<FolderKanban size={18}/>} tone="violet"/><StatCard title="Tasks completed" value={metrics?.completedTasks.toString() ?? "—"} change={`${metrics?.tasks ?? 0} total tasks`} icon={<CheckCircle2 size={18}/>} tone="green"/><StatCard title="Team members" value={metrics?.members.toString() ?? "—"} change="Active memberships" icon={<Users size={18}/>} tone="blue"/><StatCard title="Completion rate" value={`${metrics?.completionRate ?? 0}%`} change={`${metrics?.dueIn24Hours ?? 0} due in 24 hours`} icon={<Target size={18}/>} tone="orange"/></section>
        <section className="overview-grid"><div className="surface activity-card"><div className="section-heading"><div><h2>Task status snapshot</h2><p>Live task counts from this workspace</p></div><button className="select-button">This week <ChevronDown size={14}/></button></div><div className="chart-legend"><span><i className="legend-dot completed-dot"/>Completed</span><span><i className="legend-dot created-dot"/>Created</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:5,left:-20,bottom:0}}><defs><linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7868ed" stopOpacity={.18}/><stop offset="95%" stopColor="#7868ed" stopOpacity={0}/></linearGradient><linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#51b9a1" stopOpacity={.13}/><stop offset="95%" stopColor="#51b9a1" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#eff0f5" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:"#9296a8",fontSize:11}} dy={10}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#9296a8",fontSize:11}}/><Tooltip contentStyle={{border:"1px solid #ececf2",borderRadius:12,boxShadow:"0 8px 25px #20243a12",fontSize:12}}/><Area type="monotone" dataKey="completed" stroke="#7868ed" strokeWidth={2.5} fill="url(#completedFill)"/></AreaChart></ResponsiveContainer></div></div>
          <div className="surface focus-card"><div className="section-heading"><div><h2>Team focus</h2><p>Your workspace at a glance</p></div><button className="more-button"><MoreHorizontal size={19}/></button></div><div className="focus-score"><div><span>Productivity score</span><strong>86<span>/100</span></strong></div><div className="score-ring"><div><strong>86</strong><small>Great</small></div></div></div><div className="score-track"><span/></div><div className="focus-divider"/><div className="focus-row"><div className="focus-icon violet-soft"><Zap size={16}/></div><div><strong>24 tasks</strong><span>Completed this week</span></div><em className="positive"><ArrowUpRight size={13}/> 18%</em></div><div className="focus-row"><div className="focus-icon green-soft"><Clock3 size={16}/></div><div><strong>6 tasks</strong><span>Due in the next 24 hours</span></div><em className="neutral-em">On track</em></div></div>
        </section>
        <section className="surface projects-card"><div className="section-heading"><div><h2>Projects in progress</h2><p>Keep an eye on what your team is building</p></div><button className="text-button" onClick={()=>setActiveNav("Projects")}>View all projects <ArrowRight size={15}/></button></div><div className="projects-grid">{projectRows.map((project)=><div className="project-card" key={project.id}><div className="project-card-top"><div className={`project-icon ${project.color}`}><FolderKanban size={18}/></div><button className="more-button"><MoreHorizontal size={18}/></button></div><h3>{project.name}</h3><p className="project-team">{project.team}</p><div className="progress-heading"><span>Progress</span><strong>{project.progress}%</strong></div><div className="progress-track"><span className={project.color} style={{width:`${project.progress}%`}}/></div><div className="project-footer"><span><Check size={13}/> {project.tasks} tasks</span><span><CalendarDays size={13}/> {project.due}</span></div></div>)}</div></section>
        <section className="surface tasks-card"><div className="section-heading task-heading"><div><h2>Recent tasks</h2><p>Stay on top of the latest team updates</p></div><div className="task-actions"><select className="select-button" value={taskStatus} onChange={(event)=>setTaskStatus(event.target.value)}><option>All tasks</option><option>In progress</option><option>In review</option><option>Todo</option><option>Done</option></select><button className="text-button" onClick={()=>setShowAll(!showAll)}>{showAll?"Show less":"View all"} <ArrowRight size={15}/></button></div></div><div className="task-table"><div className="task-table-head"><span>TASK</span><span>ASSIGNEE</span><span>PRIORITY</span><span>STATUS</span><span>DUE DATE</span></div>{visibleTasks.map((task)=><div className="task-table-row" key={task.id}><div className="task-title-cell"><button className={`task-check ${checkedTasks.includes(task.id)?"checked":""}`} onClick={()=>completeTask(task.id)} aria-label={`Mark ${task.id} complete`}>{checkedTasks.includes(task.id)&&<Check size={12}/>}</button><div><button className="task-open" onClick={() => setSelectedTaskId(task.taskId)}>{task.title}</button><span>{task.id} · {task.project}</span></div></div><div className="assignee-cell"><div className={`avatar avatar-tiny ${task.tone}`}>{task.initials}</div><span>{task.assignee}</span></div><div><PriorityPill priority={task.priority}/></div><div><StatusPill status={task.status}/></div><div className="due-cell">{task.due==="Today"?<span className="due-today">{task.due}</span>:task.due}</div></div>)}{visibleTasks.length===0&&<div className="empty-state">No tasks in this status.</div>}</div><div className="table-foot"><span>Showing {visibleTasks.length} of {taskRows.length} tasks</span><div><button className="pagination-button" disabled><ChevronLeft size={15}/></button><button className="pagination-button"><ChevronRight size={15}/></button></div></div></section>
        <footer className="page-footer"><span>© 2026 SprintSpace, Inc.</span><span>Made for teams that build great things <span className="footer-star">✦</span></span></footer>
      </div>
    </main>
    {selectedTaskId && <div className="modal-scrim" onClick={() => setSelectedTaskId(null)}><section className="comment-modal" onClick={(event) => event.stopPropagation()}><div className="comment-modal-head"><div><span>TASK DISCUSSION</span><h2>{taskRows.find((task) => task.taskId === selectedTaskId)?.title ?? "Task comments"}</h2></div><button className="icon-button" onClick={() => setSelectedTaskId(null)} aria-label="Close comments"><X size={18}/></button></div><div className="comment-list">{(commentsQuery.data?.comments ?? []).map((comment) => <article className="comment-item" key={comment._id}><div className="comment-avatar">{typeof comment.authorId === "object" ? comment.authorId.name.slice(0,1).toUpperCase() : "T"}</div><div><strong>{typeof comment.authorId === "object" ? comment.authorId.name : "Teammate"}</strong><time>{new Date(comment.createdAt).toLocaleString()}</time><p>{comment.body}</p></div></article>)}{commentsQuery.isLoading && <p className="comment-empty">Loading discussion…</p>}{!commentsQuery.isLoading && (commentsQuery.data?.comments.length ?? 0)===0 && <p className="comment-empty">No comments yet. Start the conversation.</p>}</div><form className="comment-form" onSubmit={submitComment}><textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Write a comment…" maxLength={4000}/><button className="primary-button" disabled={!commentDraft.trim()}>Send comment <ArrowRight size={14}/></button></form></section></div>}
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
