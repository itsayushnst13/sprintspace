import { createServer } from "node:http";
import { app } from "./app.js";
import { connectDatabase, redis } from "./config/database.js";
import { env } from "./config/env.js";
import { attachSocketServer } from "./realtime/socket.js";

async function start(): Promise<void> {
  await connectDatabase();
  const server = createServer(app);
  attachSocketServer(server);
  server.listen(env.PORT, () => {
    console.info(`SprintSpace API and realtime server listening on port ${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`${signal} received; closing server`);
    server.close(async () => {
      await redis.quit().catch(() => undefined);
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

start().catch((error: unknown) => {
  console.error("API startup failed:", error);
  process.exit(1);
});
