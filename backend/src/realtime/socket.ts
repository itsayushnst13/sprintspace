import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";

let io: Server | null = null;

export function attachSocketServer(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    transports: ["websocket", "polling"]
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
      if (typeof payload === "string" || !payload.sub) return next(new Error("Invalid access token"));
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("workspace:join", async (workspaceId: string, acknowledge?: (result: { ok: boolean; message?: string }) => void) => {
      if (typeof workspaceId !== "string" || !/^[a-f\d]{24}$/i.test(workspaceId)) {
        acknowledge?.({ ok: false, message: "Invalid workspace" });
        return;
      }
      const membership = await WorkspaceMember.exists({
        workspaceId, userId: socket.data.userId, status: "active"
      });
      if (!membership) {
        acknowledge?.({ ok: false, message: "Workspace membership required" });
        return;
      }
      await socket.join(`workspace:${workspaceId}`);
      acknowledge?.({ ok: true });
    });
  });

  return io;
}

export function emitWorkspaceEvent(workspaceId: string, event: string, payload: unknown): void {
  io?.to(`workspace:${workspaceId}`).emit(event, payload);
}
