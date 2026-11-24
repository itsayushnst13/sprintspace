import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { redis } from "./config/database.js";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");
if (env.TRUST_PROXY) app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));
const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "AUTH_RATE_LIMITED", message: "Too many authentication attempts. Try again in 15 minutes." } }
});
app.use("/api/v1/auth/login", authAttemptLimiter);
app.use("/api/v1/auth/register", authAttemptLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sprintspace-api" });
});

app.get("/ready", async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) throw new Error("MongoDB is not connected");
    await redis.ping();
    res.json({ status: "ready", dependencies: { mongodb: "ok", redis: "ok" } });
  } catch {
    res.status(503).json({ status: "not_ready", dependencies: {
      mongodb: mongoose.connection.readyState === 1 ? "ok" : "unavailable",
      redis: "unavailable"
    } });
  }
});

app.get("/api/v1", (_req, res) => {
  res.json({ name: "SprintSpace API", version: "v1" });
});

app.use("/api/v1", apiRouter);
app.use(notFound);
app.use(errorHandler);
