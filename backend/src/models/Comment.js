import { Schema, model } from "mongoose";

const commentSchema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  editedAt: { type: Date, default: null }
}, { timestamps: true });

commentSchema.index({ workspaceId: 1, taskId: 1, createdAt: 1 });
export const Comment = model("Comment", commentSchema);
