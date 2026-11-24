import { create } from "zustand";
import { setAccessToken } from "../lib/api";

type User = { id: string; name: string; email: string };
type Workspace = { id: string; name: string; slug: string; role?: string };

type SessionState = {
  user: User | null;
  workspace: Workspace | null;
  authenticated: boolean;
  ready: boolean;
  establish: (accessToken: string, user: User, workspace?: Workspace) => void;
  markReady: () => void;
  clear: () => void;
};

export const useSession = create<SessionState>((set) => ({
  user: null,
  workspace: null,
  authenticated: false,
  ready: false,
  establish: (accessToken, user, workspace) => {
    setAccessToken(accessToken);
    if (workspace) localStorage.setItem("sprintspace.workspaceId", workspace.id);
    set({ user, workspace: workspace ?? null, authenticated: true, ready: true });
  },
  markReady: () => set({ ready: true }),
  clear: () => {
    setAccessToken(null);
    localStorage.removeItem("sprintspace.workspaceId");
    set({ user: null, workspace: null, authenticated: false, ready: true });
  }
}));
