import { Schema, model } from "mongoose";

const taskSchema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, default: "", maxlength: 5000 },
  status: { type: String, enum: ["Todo", "In progress", "In review", "Done"], default: "Todo" },
  priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
  assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  dueDate: { type: Date, default: null }
}, { timestamps: true });

taskSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
export const Task = model("Task", taskSchema);
