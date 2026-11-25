import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "./error-handler.js";

export const requireAuth = (req, _res, next) => {
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
