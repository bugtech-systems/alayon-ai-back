// 📁 models/ResourceTag.js
import mongoose from "mongoose";

const FieldSchema = new mongoose.Schema({
    fieldName: { type: String },
    dataType: { type: String },
    description: { type: String },
    optionsResourceType: { type: String },
    examples: [String],
    validation: String,
    required: { type: Boolean, default: false }
}, { _id: false });

const ValueSchema = new mongoose.Schema({
    fieldName: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    resource: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ResourceTag",
        required: false
    }
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
    type: { type: String, required: true, enum: ['resource', 'config', 'connections'], default: 'resource' },
    name: { type: String, required: true },
    fields: [FieldSchema],
    values: [ValueSchema],
    relationships: [RelationshipSchema],
    resourceParent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ResourceTag",
        required: false
    },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

resourceTagSchema.index({ type: 1, name: 1 });


export const ResourceTag = mongoose.models.ResourceTag || mongoose.model("ResourceTag", resourceTagSchema);

