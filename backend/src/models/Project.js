import { Schema, model } from "mongoose";

const projectSchema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: "", maxlength: 2000 },
  color: { type: String, default: "violet" },
  status: { type: String, enum: ["active", "archived"], default: "active" },
  dueDate: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

projectSchema.index({ workspaceId: 1, status: 1 });
export const Project = model("Project", projectSchema);
