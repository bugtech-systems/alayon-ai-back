import { ResourceTag } from '../models/resourceTag.model.js'; // Adjust path as needed
// services/resourceService.js
import mongoose from 'mongoose';

export async function getFilteredResources(resourceType, filters = {}) {
    const query = {
        $and: [
            {
                name: { $regex: new RegExp(resourceType, 'i') } // partial, case-insensitive
            },
            {
                type: { $ne: 'config' } // exclude 'config'
            }
        ]
    };

    let conf = await ResourceTag.findOne({ name: resourceType, type: 'config' });

    console.log(conf, 'CONF')
    // Add filter for each key-value pair
    for (const [key, value] of Object.entries(filters)) {
        let fExist = false;
        if (conf && conf.fields) {
            fExist = conf.fields.find(a => a.fieldName == key);
        }
        if (value && fExist) {
            query.$and.push({
                values: {
                    $elemMatch: {
                        fieldName: new RegExp(`^${key}$`, 'i'), // case-insensitive field name match
                        value: { $regex: new RegExp(value, 'i') } // exact match, case-insensitive
                    }
                }
            });
        }
    }

    try {
        const matchedResources = await ResourceTag.find(query).lean();


        console.log(matchedResources, 'MMMM')
        const filtered = matchedResources.map(doc => {
            const resourceObj = {};
            resourceObj['name'] = doc.name;
            // Map all values to key-value object
            doc.values.forEach(({ fieldName, value }) => {
                resourceObj[fieldName] = value;
            });

            return resourceObj;
        });

        return filtered;
    } catch (err) {
        console.error('[getFilteredResources] Error:', err);
        throw err;
    }
}



// === Fetchers ===

export const getResourceTypes = async ({ excludeOrganizations = false }) => {
    let types = await ResourceTag.distinct('name');
    return excludeOrganizations ? types.filter(t => t.toLowerCase() !== 'organizations') : types;
};

export const getOrganizations = async () => {
    const orgs = await ResourceTag.find({ name: { $regex: /^organizations$/i }, type: { $ne: 'config' } }).lean();

    return orgs.map(org => {
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

export const getResourcesByType = async (resourceType) => {
    let resources = await ResourceTag.find({ type: resourceType }).lean();

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
    const tag = await ResourceTag.findOne({ resourceType }).lean();
    return tag?.fields || [];
};

export const findResourceByName = async (resourceType, name) => {
    return await ResourceTag.findOne({
        resourceType,
        name: { $regex: new RegExp(name, 'i') }
    }).lean();
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

export const createResource = async (resourceType, values, options = {}) => {
    const { values: validatedValues, missingFields } = await validateFields(resourceType, values);
    const relationships = formatRelationships(options.relationships || []);

    const newResource = new ResourceTag({
        resourceType,
        values: validatedValues,
        relationships,
        resourceParent: options.resourceParent || null,
        ...options.meta // any extra fields like name, tags, etc.
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
    const record = await ResourceTag.findOne({ resourceType }).lean();
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