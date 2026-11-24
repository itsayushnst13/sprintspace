import mongoose from "mongoose";
import { Redis } from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  retryStrategy: (attempt: number) => (attempt > 5 ? null : Math.min(attempt * 500, 3000))
});

redis.on("error", (error: Error) => {
  console.error("Redis connection error:", error.message);
});

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  await redis.connect();
}
