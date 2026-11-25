import { Schema, model } from "mongoose";

const notificationSchema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  type: { type: String, enum: ["task_assigned", "task_commented", "project_updated", "mention"], required: true },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 300 },
  entityType: { type: String, enum: ["project", "task", "comment"], required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  readAt: { type: Date, default: null }
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, workspaceId: 1, readAt: 1, createdAt: -1 });
export const Notification = model("Notification", notificationSchema);
