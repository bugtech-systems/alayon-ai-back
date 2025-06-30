// 📁 controllers/resourceTagController.js
import { ResourceTag } from '../models/resourceTag.model.js';
import mongoose from 'mongoose';

// Helper function to build MongoDB query from filters
const buildQuery = (filters = {}) => {
    const query = {};

    for (const [key, value] of Object.entries(filters)) {
        const [field, predicate] = key.split('_');

        switch (predicate) {
            case 'eq':
                query[field] = value;
                break;
            case 'not_eq':
                query[field] = { $ne: value };
                break;
            case 'matches':
            case 'cont':
                query[field] = { $regex: value, $options: 'i' };
                break;
            case 'does_not_match':
            case 'not_cont':
                query[field] = { $not: { $regex: value, $options: 'i' } };
                break;
            case 'lt':
                query[field] = { $lt: value };
                break;
            case 'lteq':
                query[field] = { $lte: value };
                break;
            case 'gt':
                query[field] = { $gt: value };
                break;
            case 'gteq':
                query[field] = { $gte: value };
                break;
            case 'present':
                query[field] = { $exists: true, $ne: '' };
                break;
            case 'blank':
                query[field] = { $in: [null, ''] };
                break;
            case 'null':
                query[field] = null;
                break;
            case 'not_null':
                query[field] = { $ne: null };
                break;
            case 'in':
            case 'matches_any':
            case 'cont_any':
                query[field] = { $in: Array.isArray(value) ? value : [value] };
                break;
            case 'not_in':
            case 'does_not_match_any':
            case 'not_cont_any':
                query[field] = { $nin: Array.isArray(value) ? value : [value] };
                break;
            case 'matches_all':
            case 'cont_all':
                query[field] = { $all: Array.isArray(value) ? value : [value] };
                break;
            case 'start':
                query[field] = { $regex: `^${value}`, $options: 'i' };
                break;
            case 'not_start':
                query[field] = { $not: { $regex: `^${value}`, $options: 'i' } };
                break;
            case 'end':
                query[field] = { $regex: `${value}$`, $options: 'i' };
                break;
            case 'not_end':
                query[field] = { $not: { $regex: `${value}$`, $options: 'i' } };
                break;
            case 'true':
                query[field] = true;
                break;
            case 'false':
                query[field] = false;
                break;
            // Handle nested fields in values array
            default:
                if (field.startsWith('values.')) {
                    const valueField = field.replace('values.', '');
                    query['values'] = query['values'] || { $elemMatch: {} };
                    query['values'].$elemMatch[valueField] = buildValueQuery(valueField, value, predicate);
                } else {
                    query[field] = value; // Default equality
                }
        }
    }

    return query;
};

const buildValueQuery = (field, value, predicate) => {
    switch (predicate) {
        case 'eq':
            return value;
        case 'not_eq':
            return { $ne: value };
        case 'matches':
        case 'cont':
            return { $regex: value, $options: 'i' };
        // Add other cases as needed for nested fields
        default:
            return value;
    }
};

// Helper to build sort object from query string
const buildSort = (sortQuery = '') => {
    const sort = {};
    if (!sortQuery) return sort;

    sortQuery.split(',').forEach(field => {
        if (field.startsWith('-')) {
            sort[field.substring(1)] = -1;
        } else {
            sort[field] = 1;
        }
    });

    return sort;
};

// Create a new ResourceTag
// Helper function to format resource response
const formatResourceResponse = (resource) => {
    console.log(resource.relationships, 'RRSS')
    return {
        id: resource._id,
        type: resource.type.toLowerCase(),
        name: resource.name,
        attributes: Object.fromEntries(resource?.values.map(item =>
            [item.fieldName, item.value])),
        relationships: {
            ...(resource.resourceParent ? {
                parent: formatResourceResponse(resource.resourceParent)
            } : {}),
            ...(resource?.relationships ? Object.fromEntries(resource?.relationships?.map(rel => [
                rel.type, formatResourceResponse(rel.refId)
            ])) : {})
        }
    };
};

// Create a new ResourceTag
export const createResourceTag = async (req, res) => {
    try {
        const { type = 'resource', name, attributes, relationships } = req.body;
        const parentId = req.parentId || null
        // Convert attributes to values array for querying
        const valuesQuery = Object.entries(attributes || {}).map(([fieldName, value]) => ({
            'values.fieldName': fieldName,
            'values.value': value
        }));

        // Check if resource with same type, name and attributes already exists
        const existingResource = await ResourceTag.findOne({
            $and: [
                { type },
                { name },
                ...valuesQuery
            ]
        });

        if (existingResource) {
            return res.status(409).json({
                errors: [{
                    status: '409',
                    title: 'Conflict',
                    detail: 'Resource with same type, name and attributes already exists'
                }]
            });
        }

        // Convert attributes to values array for creation
        const values = Object.entries(attributes || {}).map(([fieldName, value]) => ({
            fieldName,
            value
        }));

        // Process relationships
        const relationshipEntries = [];

        if (parentId) {
            relationshipEntries.push({
                type: 'organization',
                refType: 'ResourceTag',
                refId: parentId
            });
        }

        if (relationships) {
            for (const [relationshipType, relationshipData] of Object.entries(relationships)) {
                if (relationshipData.data) {
                    // Handle single relationship
                    if (relationshipData.data.id && relationshipData.data.type) {
                        relationshipEntries.push({
                            type: relationshipType,
                            refType: 'ResourceTag',
                            refId: relationshipData.data.id
                        });
                    }
                    // Handle array of relationships
                    else if (Array.isArray(relationshipData.data)) {
                        relationshipData.data.forEach(rel => {
                            if (rel.id && rel.type) {
                                relationshipEntries.push({
                                    type: relationshipType,
                                    refType: 'ResourceTag',
                                    refId: rel.id
                                });
                            }
                        });
                    }
                }
            }
        }

        // Create the resource
        const resourceTag = new ResourceTag({
            type: type || 'resource',
            name,
            fields: [],
            values,
            relationships: relationshipEntries,
            resourceParent: parentId || null
        });

        await resourceTag.save();
        const populatedResource = await ResourceTag.findById(resourceTag._id)
            .populate('resourceParent')
            .populate('relationships.refId');

        res.status(201).json({
            data: formatResourceResponse(populatedResource)
        });
    } catch (error) {
        res.status(400).json({
            errors: [{
                status: '400',
                title: 'Bad Request',
                detail: error.message
            }]
        });
    }
};

// Get all ResourceTags with filtering, sorting, and pagination
export const getResourceTags = async (req, res) => {
    try {
        let { type } = req.params;

        // Build query from filters
        const query = buildQuery(req.query.filter);

        query.type = { $ne: 'config' }
        if (type != 'resources') {
            query.name = { $regex: new RegExp(`^${type}$`, "i") };
        }

        // Build sort
        const sort = buildSort(req.query.sort);

        // Pagination
        const page = parseInt(req.query.page?.number) || 1;
        const limit = parseInt(req.query.page?.size) || 25;
        const skip = (page - 1) * limit;

        console.log(query, 'QUERY')


        // Execute query
        const [resourceTags, total] = await Promise.all([
            ResourceTag.find({
                ...query, isDeleted: false
            })
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate('resourceParent')
                .populate('relationships.refId'),
            ResourceTag.countDocuments(query)
        ]);


        console.log(resourceTags, 'ssrrrtt', total)

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        res.json({
            data: resourceTags.map(formatResourceResponse),
            meta: {
                total,
                totalPages,
                page,
                pageSize: limit
            }
        });
    } catch (error) {
        console.log(error, 'sseerr')
        res.status(500).json({
            errors: [{
                status: '500',
                title: 'Server Error',
                detail: error.message
            }]
        });
    }
};

// Query ResourceTags with complex filters in request body
export const queryResourceTags = async (req, res) => {
    try {
        // Build query from filters in request body
        const query = buildQuery(req.body.filter);

        // Build sort from query params (can be combined with body filters)
        const sort = buildSort(req.query.sort);

        // Pagination
        const page = parseInt(req.query.page?.number) || 1;
        const limit = parseInt(req.query.page?.size) || 25;
        const skip = (page - 1) * limit;

        // Execute query
        const [resourceTags, total] = await Promise.all([
            ResourceTag.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate('resourceParent')
                .populate('relationships.refId'),
            ResourceTag.countDocuments(query)
        ]);

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);

        res.json({
            data: resourceTags.map(formatResourceResponse),
            meta: {
                total,
                totalPages,
                page,
                pageSize: limit
            }
        });
    } catch (error) {
        res.status(500).json({
            errors: [{
                status: '500',
                title: 'Server Error',
                detail: error.message
            }]
        });
    }
};

// Get a single ResourceTag by ID
export const getResourceTag = async (req, res) => {
    try {




        const resourceTag = await ResourceTag.findById(req.params.id)
            .populate('resourceParent')
            .populate('relationships.refId');

        if (!resourceTag) {
            return res.status(404).json({
                errors: [{
                    status: '404',
                    title: 'Not Found',
                    detail: 'ResourceTag not found'
                }]
            });
        }

        res.json({
            data: formatResourceResponse(resourceTag)
        });
    } catch (error) {
        res.status(500).json({
            errors: [{
                status: '500',
                title: 'Server Error',
                detail: error.message
            }]
        });
    }
};

// Update a ResourceTag
export const updateResourceTag = async (req, res) => {
    try {
        let { attributes } = req.body;

        const values = Object.entries(attributes || {}).map(([fieldName, value]) => ({
            fieldName,
            value
        }));

        const resourceTag = await ResourceTag.findByIdAndUpdate(
            req.params.id,
            { ...req.body, values },
            { new: true, runValidators: true }
        )
            .populate('resourceParent')
            .populate('relationships.refId');

        if (!resourceTag) {
            return res.status(404).json({
                errors: [{
                    status: '404',
                    title: 'Not Found',
                    detail: 'ResourceTag not found'
                }]
            });
        }

        res.json({
            data: formatResourceResponse(resourceTag)
        });
    } catch (error) {
        res.status(400).json({
            errors: [{
                status: '400',
                title: 'Bad Request',
                detail: error.message
            }]
        });
    }
};

// Delete a ResourceTag
export const deleteResourceTag = async (req, res) => {
    try {
        const resourceTag = await ResourceTag.findByIdAndDelete(req.params.id);

        if (!resourceTag) {
            return res.status(404).json({
                errors: [{
                    status: '404',
                    title: 'Not Found',
                    detail: 'ResourceTag not found'
                }]
            });
        }

        res.json({
            data: {
                id: resourceTag._id,
                type: resourceTag.type.toLowerCase(),
                name: resourceTag.name
            },
            meta: {
                message: 'ResourceTag deleted successfully'
            }
        });
    } catch (error) {
        res.status(500).json({
            errors: [{
                status: '500',
                title: 'Server Error',
                detail: error.message
            }]
        });
    }
};

// Get fields for a specific ResourceTag (kept for backward compatibility)
export const getResourceTagFields = async (req, res) => {
    try {
        const resourceTag = await ResourceTag.findById(req.params.id);

        if (!resourceTag) {
            return res.status(404).json({
                errors: [{
                    status: '404',
                    title: 'Not Found',
                    detail: 'ResourceTag not found'
                }]
            });
        }

        res.json({
            data: {
                id: resourceTag._id,
                type: resourceTag.type.toLowerCase(),
                name: resourceTag.name,
                attributes: {
                    fields: resourceTag.fields
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            errors: [{
                status: '500',
                title: 'Server Error',
                detail: error.message
            }]
        });
    }
};

// Get values for a specific ResourceTag (kept for backward compatibility)
export const getResourceTagValues = async (req, res) => {
    try {
        const resourceTag = await ResourceTag.findById(req.params.id);

        if (!resourceTag) {
            return res.status(404).json({
                errors: [{
                    status: '404',
                    title: 'Not Found',
                    detail: 'ResourceTag not found'
                }]
            });
        }

        res.json({
            data: {
                id: resourceTag._id,
                type: resourceTag.type.toLowerCase(),
                name: resourceTag.name,
                attributes: Object.fromEntries(resourceTag.values.map(item =>
                    [item.fieldName, item.value]))
            }
        });
    } catch (error) {
        res.status(500).json({
            errors: [{
                status: '500',
                title: 'Server Error',
                detail: error.message
            }]
        });
    }
};

// Get relationships for a specific ResourceTag
export const getResourceTagRelationships = async (req, res) => {
    try {
        const resourceTag = await ResourceTag.findById(req.params.id)
            .populate('relationships.refId');

        if (!resourceTag) {
            return res.status(404).json({
                errors: [{
                    status: '404',
                    title: 'Not Found',
                    detail: 'ResourceTag not found'
                }]
            });
        }

        res.json({
            data: {
                id: resourceTag._id,
                type: resourceTag.type.toLowerCase(),
                name: resourceTag.name,
                relationships: Object.fromEntries(resourceTag.relationships.map(rel => [
                    rel.type,
                    {
                        data: {
                            id: rel.refId._id ? rel.refId._id : rel.refId,
                            type: 'resource-tag',
                            meta: { relationshipType: rel.type }
                        }
                    }
                ]))
            }
        });
    } catch (error) {
        res.status(500).json({
            errors: [{
                status: '500',
                title: 'Server Error',
                detail: error.message
            }]
        });
    }
};