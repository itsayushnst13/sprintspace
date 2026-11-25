import { Schema, model } from "mongoose";

const membershipSchema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, enum: ["Admin", "Manager", "Developer", "Member"], default: "Member", required: true },
  status: { type: String, enum: ["active", "invited", "suspended"], default: "active" }
}, { timestamps: true });

membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
export const WorkspaceMember = model("WorkspaceMember", membershipSchema);
