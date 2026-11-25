import { Schema, model } from "mongoose";

const activityLogSchema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  entityType: { type: String, enum: ["project", "task", "comment", "member"], required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, required: true, maxlength: 80 },
  summary: { type: String, required: true, maxlength: 240 },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

activityLogSchema.index({ workspaceId: 1, createdAt: -1 });
export const ActivityLog = model("ActivityLog", activityLogSchema);
