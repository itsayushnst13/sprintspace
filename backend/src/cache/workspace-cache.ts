import { redis } from "../config/database.js";

export async function invalidateWorkspaceAnalytics(workspaceId: string): Promise<void> {
  try {
    await redis.del(`workspace:${workspaceId}:analytics`);
  } catch (error) {
    console.warn("Workspace analytics cache invalidation failed:", error);
  }
}
