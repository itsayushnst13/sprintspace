export type TaskStatus = "In progress" | "In review" | "Todo" | "Done";
export type Priority = "High" | "Medium" | "Low";

export const projects = [
  { id: "p1", name: "Website redesign", team: "Design team", color: "violet", progress: 76, due: "Nov 28", tasks: "19/25" },
  { id: "p2", name: "Mobile app v2.0", team: "Product team", color: "blue", progress: 48, due: "Dec 04", tasks: "12/25" },
  { id: "p3", name: "Q4 growth campaign", team: "Marketing", color: "orange", progress: 31, due: "Dec 12", tasks: "8/26" }
];

export const tasks: Array<{
  id: string; title: string; project: string; assignee: string;
  initials: string; tone: string; priority: Priority; status: TaskStatus; due: string;
}> = [
  { id: "SS-142", title: "Finalize homepage wireframes", project: "Website redesign", assignee: "Olivia Rhye", initials: "OR", tone: "peach", priority: "High", status: "In progress", due: "Today" },
  { id: "SS-139", title: "Review onboarding flow", project: "Mobile app v2.0", assignee: "Phoenix Baker", initials: "PB", tone: "lilac", priority: "Medium", status: "In review", due: "Today" },
  { id: "SS-136", title: "Prepare campaign assets", project: "Q4 growth campaign", assignee: "Lana Steiner", initials: "LS", tone: "mint", priority: "Low", status: "Todo", due: "Tomorrow" },
  { id: "SS-131", title: "Update design system tokens", project: "Website redesign", assignee: "Demi Wilkinson", initials: "DW", tone: "sky", priority: "Medium", status: "Done", due: "Nov 26" }
];

export const weeklyActivity = [
  { day: "Mon", completed: 18, created: 12 },
  { day: "Tue", completed: 24, created: 16 },
  { day: "Wed", completed: 16, created: 19 },
  { day: "Thu", completed: 29, created: 13 },
  { day: "Fri", completed: 22, created: 17 },
  { day: "Sat", completed: 12, created: 8 },
  { day: "Sun", completed: 8, created: 5 }
];
