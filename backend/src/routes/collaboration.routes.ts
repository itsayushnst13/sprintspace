import { Router } from "express";
import { z } from "zod";
import { Comment } from "../models/Comment.js";
import { Task } from "../models/Task.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Notification } from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceMember } from "../middleware/workspace-access.js";
import { ApiError } from "../middleware/error-handler.js";
import { emitUserEvent, emitWorkspaceEvent } from "../realtime/socket.js";

export const commentsRouter = Router({ mergeParams: true });
commentsRouter.use(requireAuth, requireWorkspaceMember());

commentsRouter.get("/", async (req, res, next) => {
  try {
    const taskId = (req.params as Record<string, string>)["taskId"];
    const task = await Task.exists({ _id: taskId, workspaceId: req.workspaceId });
    if (!task) throw new ApiError(404, "Task not found");
    const comments = await Comment.find({ taskId, workspaceId: req.workspaceId })
      .populate("authorId", "name avatarUrl").sort({ createdAt: 1 }).lean();
    res.json({ comments });
  } catch (error) { next(error); }
});

commentsRouter.post("/", async (req, res, next) => {
  try {
    const taskId = (req.params as Record<string, string>)["taskId"];
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const task = await Task.findOne({ _id: taskId, workspaceId: req.workspaceId });
    if (!task) throw new ApiError(404, "Task not found");
    const comment = await Comment.create({
      workspaceId: req.workspaceId, taskId: task._id, authorId: req.userId, body
    });
    await ActivityLog.create({
      workspaceId: req.workspaceId, actorId: req.userId, entityType: "comment",
      entityId: comment._id, action: "comment.created", summary: "Added a comment to a task",
      metadata: { taskId: task.id, taskTitle: task.title }
    });
    if (task.assigneeId && task.assigneeId.toString() !== req.userId) {
      const notification = await Notification.create({
        workspaceId: req.workspaceId, recipientId: task.assigneeId, actorId: req.userId,
        type: "task_commented", title: "New task comment", body: `A teammate commented on "${task.title}"`,
        entityType: "task", entityId: task._id
      });
      emitUserEvent(notification.recipientId.toString(), "notification:created", { notification });
    }
    const populated = await Comment.findById(comment._id).populate("authorId", "name avatarUrl").lean();
    emitWorkspaceEvent(req.workspaceId!, "comment:created", { comment: populated, taskId: task.id });
    res.status(201).json({ comment: populated });
  } catch (error) { next(error); }
});

commentsRouter.delete("/:commentId", async (req, res, next) => {
  try {
    const commentId = (req.params as Record<string, string>)["commentId"];
    const comment = await Comment.findOne({ _id: commentId, workspaceId: req.workspaceId });
    if (!comment) throw new ApiError(404, "Comment not found");
    if (comment.authorId.toString() !== req.userId && req.workspaceRole !== "Admin") {
      throw new ApiError(403, "You can only delete your own comments");
    }
    await comment.deleteOne();
    emitWorkspaceEvent(req.workspaceId!, "comment:deleted", { commentId: comment.id, taskId: comment.taskId.toString() });
    res.status(204).end();
  } catch (error) { next(error); }
});

export const activityRouter = Router({ mergeParams: true });
activityRouter.use(requireAuth, requireWorkspaceMember());
activityRouter.get("/", async (req, res, next) => {
  try {
    const activity = await ActivityLog.find({ workspaceId: req.workspaceId })
      .populate("actorId", "name avatarUrl").sort({ createdAt: -1 }).limit(50).lean();
    res.json({ activity });
  } catch (error) { next(error); }
});

export const notificationsRouter = Router({ mergeParams: true });
notificationsRouter.use(requireAuth, requireWorkspaceMember());
notificationsRouter.get("/", async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      workspaceId: req.workspaceId, recipientId: req.userId
    }).sort({ createdAt: -1 }).limit(50).lean();
    const unreadCount = await Notification.countDocuments({
      workspaceId: req.workspaceId, recipientId: req.userId, readAt: null
    });
    res.json({ notifications, unreadCount });
  } catch (error) { next(error); }
});
notificationsRouter.patch("/:notificationId/read", async (req, res, next) => {
  try {
    const notificationId = (req.params as Record<string, string>)["notificationId"];
    const notification = await Notification.findOneAndUpdate({
      _id: notificationId, workspaceId: req.workspaceId,
      recipientId: req.userId, readAt: null
    }, { $set: { readAt: new Date() } }, { new: true });
    if (!notification) throw new ApiError(404, "Unread notification not found");
    res.json({ notification });
  } catch (error) { next(error); }
});
