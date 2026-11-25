import mongoose from "mongoose";
import { Redis } from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 500, 3000))
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error.message);
});

export async function connectDatabase(){
  await mongoose.connect(env.MONGODB_URI);
  await redis.connect();
}
