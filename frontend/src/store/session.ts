import { create } from "zustand";
import { setAccessToken } from "../lib/api";

type User = { id: string; name: string; email: string };
type Workspace = { id: string; name: string; slug: string; role?: string };

type SessionState = {
  user: User | null;
  workspace: Workspace | null;
  authenticated: boolean;
  establish: (accessToken: string, user: User, workspace?: Workspace) => void;
  clear: () => void;
};

export const useSession = create<SessionState>((set) => ({
  user: null,
  workspace: null,
  authenticated: false,
  establish: (accessToken, user, workspace) => {
    setAccessToken(accessToken);
    set({ user, workspace: workspace ?? null, authenticated: true });
  },
  clear: () => {
    setAccessToken(null);
    set({ user: null, workspace: null, authenticated: false });
  }
}));
