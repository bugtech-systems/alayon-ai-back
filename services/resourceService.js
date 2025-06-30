import { ResourceTag } from '../models/resourceTag.model.js'; // Adjust path as needed
// services/resourceService.js
import mongoose from 'mongoose';
import { resourceConfig } from './ollamaService.js';

export async function getFilteredResources(resourceType, filters = {}) {
    // Base query - resources of this type excluding configs
    const query = {
        $and: [
            { name: { $regex: new RegExp(resourceType, 'i') } },
            { type: { $ne: 'config' } }
        ],
        isDeleted: false
    };

    // Get configuration for this resource type
    const conf = await ResourceTag.findOne({
        name: resourceType,
        type: 'config', isDeleted: false

    }).lean();

    // Apply filters only if they exist in config
    const configFields = conf?.fields || [];
    const validFilters = Object.entries(filters).filter(([key]) =>
        configFields.some(f => f.fieldName.toLowerCase() === key.toLowerCase())
    );

    // Add filter conditions
    validFilters.forEach(([key, value]) => {
        if (value != null && value !== '') {
            query.$and.push({
                values: {
                    $elemMatch: {
                        fieldName: { $regex: new RegExp(`^${key}$`, 'i') },
                        value: typeof value === 'string'
                            ? { $regex: new RegExp(value, 'i') }
                            : value
                    }
                }
            });
        }
    });

    try {
        const matchedResources = await ResourceTag.find(query).lean();

        // Transform results to key-value format
        return matchedResources.map(doc => ({
            _id: doc._id,
            name: doc.name,
            ...Object.fromEntries(
                doc.values.map(({ fieldName, value }) => [fieldName, value])
            )
        }));
    } catch (err) {
        console.error('[getFilteredResources] Error:', err);
        throw err;
    }
}



// === Fetchers ===

export const getResourceTypes = async (excludeOrganizations = false) => {
    let types = await ResourceTag.distinct('name', { isDeleted: false });
    return excludeOrganizations ? types.filter(t => t.toLowerCase() !== 'organizations') : types;
};



export const getOrganizations = async () => {
    const orgs = await ResourceTag.find({ name: { $regex: /^organizations$/i }, type: { $ne: 'config' }, isDeleted: false }).lean();

    return orgs.map(org => {
        const valuesObj = {};
        if (Array.isArray(org.values)) {
            org.values.forEach(({ fieldName, value }) => {
                valuesObj[fieldName] = value;
            });
        }
        return valuesObj.name || 'Unnamed';
    });
};

export const getResourcesByType = async (resourceType) => {
    let resources = await ResourceTag.find({ type: resourceType, isDeleted: false }).lean();

    return resources.map(org => {
        const valuesObj = {};
        if (Array.isArray(org.values)) {
            org.values.forEach(({ fieldName, value }) => {
                valuesObj[fieldName] = value;
            });
        }

        return {
            _id: org._id,
            resourceName: org.name,
            resourceType: org.type,
            name: valuesObj.name || 'Unnamed',
            values: valuesObj,
            relationships: org.relationships || [],
            resourceParent: org.resourceParent || null,
            createdAt: org.createdAt,
            updatedAt: org.updatedAt
        };
    });
};

export const getFieldsByResourceType = async (resourceType) => {
    const tag = await ResourceTag.findOne({ type: 'config', name: resourceType, isDeleted: false }).lean();
    return tag?.fields || [];
};

export const findResourceByName = async (name) => {
    return await ResourceTag.findOne({
        type: 'config',
        name: { $regex: new RegExp(name, 'i') },
        isDeleted: false
    }).lean();
};

export const getResourceOptions = async (name) => {
    const resources = await ResourceTag.find({
        type: 'resource',
        name: { $regex: new RegExp(name, 'i') },
        isDeleted: false
    }).lean();

    const options = [];

    for (const resource of resources) {
        const matchedFields = resource.values?.filter(
            field => field.fieldName === 'name'
        ) || [];

        for (const field of matchedFields) {
            options.push(field.value);
        }
    }

    return options;
};

// === Validators ===

export const validateFields = async (resourceType, values) => {
    const definedFields = await getFieldsByResourceType(resourceType);
    const validKeys = definedFields.map(f => f.fieldName);
    const filtered = {};

    for (const key of Object.keys(values)) {
        if (validKeys.includes(key)) {
            filtered[key] = values[key];
        }
    }

    return {
        values: Object.entries(filtered).map(([fieldName, value]) => ({ fieldName, value })),
        missingFields: definedFields.filter(f => !(f.fieldName in values)),
    };
};

// === Relationships ===

export const formatRelationships = (relationships = []) => {
    return relationships
        .filter(r => r.type && r.refType && mongoose.Types.ObjectId.isValid(r.refId))
        .map(r => ({
            type: r.type,
            refType: r.refType,
            refId: new mongoose.Types.ObjectId(r.refId)
        }));
};

// === Mutators ===

export const createResource = async (name, values, options = {}) => {
    const { values: validatedValues, missingFields } = await validateFields(resourceType, values);
    const relationships = formatRelationships(options.relationships || []);

    // Define what makes a resource "duplicate" (customize these fields as needed)
    const duplicateCriteria = {
        name,
        values: validatedValues,
    };

    // Check for existing resource first
    const existingResource = await ResourceTag.findOne(duplicateCriteria);

    if (existingResource) {
        // Option 1: Return existing resource (no duplication)
        // return existingResource;

        // Option 2: Update existing resource with new relationships/meta
        const updates = {};

        if (relationships.length > 0) {
            updates.$addToSet = {
                relationships: { $each: relationships }
            };
        }


        if (Object.keys(updates).length > 0) {
            return await ResourceTag.findByIdAndUpdate(
                existingResource._id,
                updates,
                { new: true }
            );
        }

        return existingResource;
    }

    // Create new resource if no duplicate exists
    const newResource = new ResourceTag({
        name,
        values: validatedValues,
        relationships,
        resourceParent: options.resourceParent || null,
        ...(options.meta && { meta: options.meta })
    });

    return await newResource.save();
};

export const updateResourceById = async (resourceId, updates) => {
    if (!mongoose.Types.ObjectId.isValid(resourceId)) throw new Error('Invalid resource ID');

    const updateDoc = {};
    if (updates.values) {
        const { values } = await validateFields(updates.resourceType, updates.values);
        updateDoc.values = values;
    }

    if (updates.relationships) {
        updateDoc.relationships = formatRelationships(updates.relationships);
    }

    return await ResourceTag.findByIdAndUpdate(resourceId, updateDoc, { new: true });
};

export const deleteResourceById = async (resourceId) => {
    if (!mongoose.Types.ObjectId.isValid(resourceId)) throw new Error('Invalid resource ID');
    return await ResourceTag.findByIdAndDelete(resourceId);
};



/**
 * Returns a distinct list of resourceType names (excluding 'organizations').
 */
export const getResourceTypesByName = async () => {
    const types = await ResourceTag.distinct('resourceType');
    return types.filter(t => t.toLowerCase() !== 'organizations');
};

/**
 * Returns an array of field names defined for a given resourceType.
 */
export const getFieldsForResource = async (resourceType) => {
    const record = await ResourceTag.findOne({ type: 'config', name: resourceType }).lean();
    if (!record || !Array.isArray(record.fields)) return [];
    return record.fields.map(f => f.fieldName);
};


export const getResourceFields = async (resourceType) => {
    const res = await ResourceTag.findOne({ resourceType }).lean();
    return res?.fields || [];
};


export const runQuery = async (session) => {
    const { action, resource, query_object } = session;

    switch (action) {
        case "create":
            return await ResourceTag.create({
                resourceType: resource,
                values: Object.entries(query_object).map(([fieldName, value]) => ({ fieldName, value })),
            });
        case "get":
            return await ResourceTag.find({
                resourceType: resource,
                values: {
                    $elemMatch: { $or: Object.entries(query_object).map(([k, v]) => ({ fieldName: k, value: v })) }
                }
            }).lean();
        case "update":
            return await ResourceTag.updateMany(
                { resourceType: resource },
                {
                    $set: {
                        values: Object.entries(query_object).map(([fieldName, value]) => ({ fieldName, value }))
                    }
                }
            );
        case "delete":
            return await ResourceTag.deleteMany({ resourceType: resource });
        default:
            return null;
    }
};


export const resourceTagService = {
    async createWithConfig(data) {
        const values = resourceConfig.fields
            .filter(field => data[field.fieldName] !== undefined)
            .map(field => ({
                fieldName: field.fieldName,
                value: data[field.fieldName]
            }));

        const resource = {
            type: data.type || 'resource',
            name: data.name,
            values,
            isDeleted: false
        };

        return await ResourceTag.create(resource);
    },

    async findByConfig(filter) {
        const query = {
            isDeleted: false
        };

        if (filter.type) query.type = { $in: filter.types || resourceConfig.types };
        if (filter.name) query.name = { $in: filter.names || resourceConfig.names };

        if (filter.values) {
            query.$and = filter.values.map(valueFilter => ({
                values: { $elemMatch: valueFilter }
            }));
        }

        return await ResourceTag.find(query);
    }
};