import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Invitation } from "../models/Invitation.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceMember } from "../middleware/workspace-access.js";
import { ApiError } from "../middleware/error-handler.js";
import { hashRefreshToken } from "../security/refresh-token.js";
import { emitWorkspaceEvent, revokeWorkspaceMemberSockets } from "../realtime/socket.js";
import { invalidateWorkspaceAnalytics } from "../cache/workspace-cache.js";
import { ActivityLog } from "../models/ActivityLog.js";

export const teamRouter = Router({ mergeParams: true });
teamRouter.use(requireAuth, requireWorkspaceMember());

teamRouter.get("/members", async (req, res, next) => {
  try {
    const members = await WorkspaceMember.find({ workspaceId: req.workspaceId, status: "active" })
      .populate("userId", "name email avatarUrl").sort({ createdAt: 1 }).lean();
    res.json({ members });
  } catch (error) { next(error); }
});

teamRouter.get("/invitations", async (req, res, next) => {
  try {
    if (req.workspaceRole !== "Admin" && req.workspaceRole !== "Manager") {
      throw new ApiError(403, "Only workspace managers can view pending invitations");
    }
    const invitations = await Invitation.find({
      workspaceId: req.workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() }
    }).select("email role invitedBy expiresAt createdAt").populate("invitedBy", "name email").sort({ createdAt: -1 }).lean();
    res.json({ invitations });
  } catch (error) { next(error); }
});

teamRouter.post("/invitations", async (req, res, next) => {
  try {
    const input = z.object({
      email: z.string().trim().email().max(254),
      role: z.enum(["Manager", "Member"]).default("Member")
    }).parse(req.body);
    const role = req.workspaceRole;
    if (role !== "Admin" && (role !== "Manager" || input.role !== "Member")) {
      throw new ApiError(403, "Only admins can invite managers; managers can invite members", "FORBIDDEN");
    }
    const email = input.email.toLowerCase();
    const existingUser = await User.findOne({ email }).select("_id");
    if (existingUser) {
      const membership = await WorkspaceMember.exists({
        workspaceId: req.workspaceId, userId: existingUser._id, status: "active"
      });
      if (membership) throw new ApiError(409, "This person is already a workspace member", "ALREADY_MEMBER");
    }

    await Invitation.updateMany({
      workspaceId: req.workspaceId, email, acceptedAt: null, revokedAt: null
    }, { $set: { revokedAt: new Date() } });

    const token = randomBytes(40).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await Invitation.create({
      workspaceId: req.workspaceId, email, role: input.role,
      tokenHash: hashRefreshToken(token), invitedBy: req.userId, expiresAt
    });
    await ActivityLog.create({
      workspaceId: req.workspaceId, actorId: req.userId, entityType: "member",
      entityId: invitation._id, action: "member.invited", summary: `Invited ${email} as ${input.role}`
    });
    await invalidateWorkspaceAnalytics(req.workspaceId!);
    emitWorkspaceEvent(req.workspaceId!, "team:invited", {
      invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt }
    });
    res.status(201).json({
      invitation: { id: invitation.id, email, role: input.role, expiresAt },
      inviteToken: token,
      note: "Share this one-time invitation token securely with the invitee. Email delivery is not configured."
    });
  } catch (error) { next(error); }
});

teamRouter.delete("/invitations/:invitationId", async (req, res, next) => {
  try {
    if (req.workspaceRole !== "Admin" && req.workspaceRole !== "Manager") {
      throw new ApiError(403, "Only workspace managers can revoke invitations");
    }
    const invitationId = (req.params as Record<string, string>)["invitationId"];
    const invitation = await Invitation.findOneAndUpdate({
      _id: invitationId, workspaceId: req.workspaceId, acceptedAt: null, revokedAt: null
    }, { $set: { revokedAt: new Date() } }, { new: true });
    if (!invitation) throw new ApiError(404, "Invitation not found");
    res.status(204).end();
  } catch (error) { next(error); }
});

teamRouter.patch("/members/:memberId/role", async (req, res, next) => {
  try {
    if (req.workspaceRole !== "Admin") throw new ApiError(403, "Only workspace admins can change member roles");
    const { role } = z.object({ role: z.enum(["Manager", "Member"]) }).parse(req.body);
    const memberId = (req.params as Record<string, string>)["memberId"];
    const target = await WorkspaceMember.findOne({ _id: memberId, workspaceId: req.workspaceId, status: "active" });
    if (!target) throw new ApiError(404, "Workspace member not found");
    if (target.role === "Admin") throw new ApiError(400, "Transfer workspace ownership before changing the admin role");
    target.role = role;
    await target.save();
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "member", entityId: target._id, action: "member.role_updated", summary: `Changed a workspace member role to ${role}` });
    await invalidateWorkspaceAnalytics(req.workspaceId!);
    emitWorkspaceEvent(req.workspaceId!, "team:updated", { memberId: target.id, role });
    res.json({ member: target });
  } catch (error) { next(error); }
});

teamRouter.delete("/members/:memberId", async (req, res, next) => {
  try {
    const memberId = (req.params as Record<string, string>)["memberId"];
    const target = await WorkspaceMember.findOne({ _id: memberId, workspaceId: req.workspaceId, status: "active" });
    if (!target) throw new ApiError(404, "Workspace member not found");
    const isSelf = target.userId.toString() === req.userId;
    const canRemove = req.workspaceRole === "Admin" ||
      (req.workspaceRole === "Manager" && target.role === "Member") || isSelf;
    if (!canRemove) throw new ApiError(403, "You do not have permission to remove this member");
    if (target.role === "Admin") {
      const admins = await WorkspaceMember.countDocuments({ workspaceId: req.workspaceId, role: "Admin", status: "active" });
      if (admins <= 1) throw new ApiError(400, "The last workspace admin cannot leave before promoting another admin");
      if (!isSelf) throw new ApiError(403, "Admins can only remove another admin after ownership is transferred");
    }
    target.status = "suspended";
    await target.save();
    await revokeWorkspaceMemberSockets(req.workspaceId!, target.userId.toString());
    await ActivityLog.create({ workspaceId: req.workspaceId, actorId: req.userId, entityType: "member", entityId: target._id, action: "member.removed", summary: "Removed a member from the workspace" });
    await invalidateWorkspaceAnalytics(req.workspaceId!);
    emitWorkspaceEvent(req.workspaceId!, "team:removed", { memberId: target.id });
    res.status(204).end();
  } catch (error) { next(error); }
});

export const invitationAcceptanceRouter = Router();
invitationAcceptanceRouter.post("/accept", requireAuth, async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(20).max(128) }).parse(req.body);
    const user = await User.findById(req.userId).select("email");
    if (!user) throw new ApiError(401, "Account no longer exists");
    const tokenHash = hashRefreshToken(token);
    const invitation = await Invitation.findOne({ tokenHash }).select("+tokenHash");
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      throw new ApiError(400, "Invitation is invalid, expired, or already used", "INVALID_INVITATION");
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ApiError(403, "Sign in with the email address this invitation was sent to", "INVITATION_EMAIL_MISMATCH");
    }

    const claimed = await Invitation.findOneAndUpdate({
      _id: invitation._id, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() }
    }, { $set: { acceptedAt: new Date() } }, { new: true });
    if (!claimed) throw new ApiError(409, "Invitation has already been accepted", "INVITATION_ALREADY_USED");

    const member = await WorkspaceMember.findOneAndUpdate(
      { workspaceId: invitation.workspaceId, userId: req.userId },
      { $set: { role: invitation.role, status: "active" }, $setOnInsert: { workspaceId: invitation.workspaceId, userId: req.userId } },
      { upsert: true, new: true, runValidators: true }
    );
    await ActivityLog.create({ workspaceId: invitation.workspaceId, actorId: req.userId, entityType: "member", entityId: member._id, action: "member.joined", summary: "A teammate joined the workspace" });
    await invalidateWorkspaceAnalytics(invitation.workspaceId.toString());
    emitWorkspaceEvent(invitation.workspaceId.toString(), "team:joined", { memberId: member.id, userId: req.userId });
    res.json({ accepted: true, workspaceId: invitation.workspaceId.toString(), role: invitation.role });
  } catch (error) { next(error); }
});
