import mongoose from "mongoose";

const ValueSchema = new mongoose.Schema(
    {
        fieldName: { type: String, required: true },
        value: mongoose.Schema.Types.Mixed
    },
    { _id: false }
);

const touchpointSchema = new mongoose.Schema(
    {
        action: { type: String, required: true }, // created, updated, deleted
        timestamp: { type: Date, default: Date.now },
        values: [ValueSchema],
        notes: { type: String },

        resourceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ResourceTag",
            required: true
        }
    },
    { timestamps: true }
);

export const Touchpoint =
    mongoose.models.Touchpoint || mongoose.model("Touchpoint", touchpointSchema);
