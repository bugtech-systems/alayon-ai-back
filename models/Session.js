import mongoose from "mongoose";

const SessionStateSchema = new mongoose.Schema({
    organization: String,
    resourceName: String,
    resourceType: String,
    action: String,
    requiredFields: String,
    collectedData: mongoose.Schema.Types.Mixed,
    confirmed: Boolean
}, { _id: false });

const touchpointSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        default: 'session'
    },
    action: {
        type: String,
        enum: ['created', 'updated', 'deleted', 'retrieved'],
        default: 'created'
    },
    organization: String,
    resourceName: String,
    timestamp: { type: Date, default: Date.now },
    data: mongoose.Schema.Types.Mixed,
    followUp: String,
    userInput: String,
    sessionId: String
}, { timestamps: true });

// TTL index for automatic cleanup
touchpointSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 }); // 30 minutes

export const Session = mongoose.models.Session ||
    mongoose.model("Session", touchpointSchema);