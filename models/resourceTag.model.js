import mongoose from "mongoose";

// Defines fields metadata for each resource type
const FieldSchema = new mongoose.Schema(
    {
        fieldName: { type: String, required: true },
        dataType: { type: String, required: true }, // string, number, date, boolean, etc.
        description: { type: String },
        required: { type: Boolean, default: false }
    },
    { _id: false }
);

// Actual field values for this resource
const ValueSchema = new mongoose.Schema(
    {
        fieldName: { type: String, required: true },
        value: mongoose.Schema.Types.Mixed
    },
    { _id: false }
);

// Relationships with other resources
const RelationshipSchema = new mongoose.Schema(
    {
        type: { type: String, required: true }, // e.g., 'author', 'parent'
        refType: { type: String, required: true }, // e.g., 'ResourceTag'
        refId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "relationships.refType",
            required: true
        }
    },
    { _id: false }
);

const resourceTagSchema = new mongoose.Schema(
    {
        resourceType: { type: String, required: true }, // e.g., 'article', 'person'
        name: { type: String, required: true },         // Human-readable name

        fields: [FieldSchema],                          // Metadata for values
        values: [ValueSchema],                          // Actual content

        relationships: [RelationshipSchema],            // Relations to other resources

        resourceParent: { type: String, default: null } // Optional parent link
    },
    { timestamps: true }
);

export const ResourceTag =
    mongoose.models.ResourceTag || mongoose.model("ResourceTag", resourceTagSchema);
