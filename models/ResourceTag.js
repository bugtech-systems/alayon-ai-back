// 📁 models/ResourceTag.js
import mongoose from "mongoose";

const FieldSchema = new mongoose.Schema({
    fieldName: { type: String, required: true },
    dataType: { type: String, required: true },
    description: { type: String },
    required: { type: Boolean, default: false }
}, { _id: false });

const ValueSchema = new mongoose.Schema({
    fieldName: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed
}, { _id: false });

const RelationshipSchema = new mongoose.Schema({
    type: { type: String, required: true },
    refType: { type: String, required: true, enum: ['ResourceTag'] },
    refId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'relationships.refType',
        required: true
    }
}, { _id: false });

const resourceTagSchema = new mongoose.Schema({
    resourceType: { type: String, required: true },
    name: { type: String, required: true },
    fields: [FieldSchema],
    values: [ValueSchema],
    relationships: [RelationshipSchema],
    resourceParent: { type: String, default: null }
}, { timestamps: true });

export const ResourceTag = mongoose.models.ResourceTag || mongoose.model("ResourceTag", resourceTagSchema);

