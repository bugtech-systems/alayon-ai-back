// models/Session.js
import mongoose from "mongoose";

const FieldStateSchema = new mongoose.Schema({
    fieldName: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    confirmed: { type: Boolean, default: false },
    lastPrompted: { type: Date }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
    role: { type: String, required: true, enum: ["user", "ai", "system"] },
    content: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    userId: { type: String, required: false },
    currentResource: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ResourceTag",
        required: false
    },
    fieldStates: [FieldStateSchema],
    messages: [MessageSchema],
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
        type: String,
        enum: ["initializing", "collecting_fields", "processing", "completed", "abandoned"],
        default: "initializing"
    },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }
}, { timestamps: true });

// Indexes
sessionSchema.index({ sessionId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session || mongoose.model("Session", sessionSchema);