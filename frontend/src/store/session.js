import { create } from "zustand";
import { setAccessToken } from "../lib/api";

export const useSession = create((set) => ({
  user: null,
  workspace: null,
  authenticated: false,
  ready: false,
  establish: (accessToken, user, workspace) => {
    setAccessToken(accessToken);
    if (workspace) localStorage.setItem("sprintspace.workspaceId", workspace.id);
    else localStorage.removeItem("sprintspace.workspaceId");
    set({ user, workspace: workspace ?? null, authenticated: true, ready: true });
  },
  markReady: () => set({ ready: true }),
  clear: () => {
    setAccessToken(null);
    // Keep the last workspace choice so the next sign-in can restore the same role/context.
    set({ user: null, workspace: null, authenticated: false, ready: true });
  }
}));
