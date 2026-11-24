import { Schema, model } from "mongoose";

const refreshSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedByTokenHash: { type: String, default: null }
}, { timestamps: true });

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshSession = model("RefreshSession", refreshSessionSchema);
