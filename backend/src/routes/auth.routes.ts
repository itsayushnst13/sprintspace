import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { User } from "../models/User.js";
import { Workspace } from "../models/Workspace.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/error-handler.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(72)
});
const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(72)
});

function issueAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: userId, expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] });
}

function setRefreshCookie(res: import("express").Response, token: string): void {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  });
}

authRouter.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) throw new ApiError(409, "An account with this email already exists", "EMAIL_EXISTS");

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({ name: input.name, email, passwordHash });

    const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
    const workspace = await Workspace.create({
      name: `${input.name}'s workspace`,
      slug: `${baseSlug}-${user.id.slice(-6)}`,
      createdBy: user._id
    });
    await WorkspaceMember.create({ workspaceId: workspace._id, userId: user._id, role: "Admin", status: "active" });

    const refresh = jwt.sign({ type: "refresh" }, env.JWT_REFRESH_SECRET, {
      subject: user.id,
      expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`
    });
    // A hashed refresh-session store and rotation endpoint are added in the session phase.
    setRefreshCookie(res, refresh);
    res.status(201).json({
      accessToken: issueAccessToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug }
    });
  } catch (error) { next(error); }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new ApiError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
    }
    const refresh = jwt.sign({ type: "refresh" }, env.JWT_REFRESH_SECRET, {
      subject: user.id,
      expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`
    });
    setRefreshCookie(res, refresh);
    res.json({
      accessToken: issueAccessToken(user.id),
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) { next(error); }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("refreshToken", { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: "strict", path: "/api/v1/auth" });
  res.status(204).end();
});
