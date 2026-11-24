import { redis } from "../config/database.js";

export async function invalidateWorkspaceAnalytics(workspaceId: string): Promise<void> {
  await redis.del(`workspace:${workspaceId}:analytics`);
}
