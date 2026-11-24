import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "./error-handler.js";

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, "Authentication required", "UNAUTHENTICATED"));

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof payload === "string" || !payload.sub) throw new Error("Invalid token subject");
    req.userId = payload.sub;
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired access token", "INVALID_TOKEN"));
  }
};
