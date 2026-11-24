import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createOpaqueRefreshToken, hashRefreshToken } from "../security/refresh-token.js";
import { z } from "zod";
import { User } from "../models/User.js";
import { Workspace } from "../models/Workspace.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { RefreshSession } from "../models/RefreshSession.js";
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

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production" || env.COOKIE_SECURE,
  sameSite: "strict" as const,
  path: "/api/v1/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
});

function issueAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"]
  });
}

async function createRefreshSession(userId: string): Promise<string> {
  const token = createOpaqueRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await RefreshSession.create({ userId, tokenHash: hashRefreshToken(token), expiresAt });
  return token;
}

function setRefreshCookie(res: import("express").Response, token: string): void {
  res.cookie("refreshToken", token, cookieOptions());
}

function assertTrustedOrigin(req: import("express").Request): void {
  if (req.get("origin") !== env.CLIENT_URL) {
    throw new ApiError(403, "Request origin is not allowed", "UNTRUSTED_ORIGIN");
  }
}

async function sessionPayload(userId: string) {
  const user = await User.findById(userId).select("name email").lean();
  if (!user) throw new ApiError(401, "Account no longer exists", "ACCOUNT_NOT_FOUND");
  const membership = await WorkspaceMember.findOne({ userId, status: "active" })
    .populate("workspaceId", "name slug").lean();
  const workspace = membership?.workspaceId as unknown as { _id: { toString(): string }; name: string; slug: string } | undefined;
  return {
    user: { id: user._id.toString(), name: user.name, email: user.email },
    workspace: workspace ? {
      id: workspace._id.toString(), name: workspace.name, slug: workspace.slug, role: membership?.role
    } : undefined
  };
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

    const refresh = await createRefreshSession(user.id);
    setRefreshCookie(res, refresh);
    res.status(201).json({
      accessToken: issueAccessToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, role: "Admin" }
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
    const refresh = await createRefreshSession(user.id);
    setRefreshCookie(res, refresh);
    res.json({ accessToken: issueAccessToken(user.id), ...(await sessionPayload(user.id)) });
  } catch (error) { next(error); }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    assertTrustedOrigin(req);
    const oldToken = req.cookies?.refreshToken as string | undefined;
    if (!oldToken || oldToken.length > 256) throw new ApiError(401, "Refresh session is missing", "REFRESH_REQUIRED");

    const oldHash = hashRefreshToken(oldToken);
    const existing = await RefreshSession.findOne({ tokenHash: oldHash }).select("+tokenHash");
    if (!existing || existing.expiresAt <= new Date()) {
      res.clearCookie("refreshToken", cookieOptions());
      throw new ApiError(401, "Refresh session is invalid or expired", "INVALID_REFRESH");
    }

    if (existing.revokedAt) {
      await RefreshSession.updateMany({ userId: existing.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
      res.clearCookie("refreshToken", cookieOptions());
      throw new ApiError(401, "Refresh token reuse detected; sign in again", "REFRESH_REUSE");
    }

    const nextToken = randomBytes(48).toString("base64url");
    const nextHash = hashRefreshToken(nextToken);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const claimed = await RefreshSession.findOneAndUpdate(
      { _id: existing._id, revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { revokedAt: new Date(), replacedByTokenHash: nextHash } },
      { new: true }
    );
    if (!claimed) {
      await RefreshSession.updateMany({ userId: existing.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
      res.clearCookie("refreshToken", cookieOptions());
      throw new ApiError(401, "Refresh token reuse detected; sign in again", "REFRESH_REUSE");
    }

    await RefreshSession.create({ userId: existing.userId, tokenHash: nextHash, expiresAt });
    setRefreshCookie(res, nextToken);
    res.json({ accessToken: issueAccessToken(existing.userId.toString()), ...(await sessionPayload(existing.userId.toString())) });
  } catch (error) { next(error); }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    assertTrustedOrigin(req);
    const token = req.cookies?.refreshToken as string | undefined;
    if (token && token.length <= 256) {
      await RefreshSession.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
    res.clearCookie("refreshToken", cookieOptions());
    res.status(204).end();
  } catch (error) { next(error); }
});
