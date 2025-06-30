// controllers/resourceController.js
import { resourceParent } from '../middlewares/resourceParent.js';
import { ResourceTag } from '../models/resourceTag.js';
import mongoose from 'mongoose';

export const getResourceWithRelationships = async (req, res) => {
    try {
        const { id } = req.params;
        const query = { _id: id, isDeleted: false };

        // Add resourceParent filter if exists in request
        if (req.resourceParent) {
            query.resourceParent = req.resourceParent._id;
        }
        console.log(req.resourceParent, 'PARENT')
        // Fetch main resource with parent constraint
        const doc = await ResourceTag.findOne(query).lean();
        if (!doc) return res.status(404).json({ message: 'Resource not found' });

        const output = {
            _id: doc._id,
            name: doc.name,
            type: doc.type,
            resourceParent: doc.resourceParent,
        };

        // Map fields by name for easy lookup
        const fieldMap = {};
        for (const f of doc.fields || []) {
            fieldMap[f.fieldName] = f;
        }

        // Populate values: normal and reference types
        for (const val of doc.values || []) {
            const field = fieldMap[val.fieldName];
            if (field?.dataType === 'reference') {
                const refQuery = { _id: val.value };
                // Apply parent constraint to referenced resources if exists
                if (req.resourceParent) {
                    refQuery.resourceParent = req.resourceParent._id;
                }

                if (Array.isArray(val.value)) {
                    const refs = await ResourceTag.find({
                        _id: { $in: val.value },
                        ...(req.resourceParent && { resourceParent: req.resourceParent._id }),
                        isDeleted: false
                    }).lean();
                    output[val.fieldName] = refs.map(r => ({
                        _id: r._id,
                        name: r.name,
                        type: r.type,
                    }));
                } else {
                    const ref = await ResourceTag.findOne(refQuery).lean();
                    output[val.fieldName] = ref
                        ? {
                            _id: ref._id,
                            name: ref.name,
                            type: ref.type,
                        }
                        : null;
                }
            } else {
                output[val.fieldName] = val.value;
            }
        }

        // Helper to deduplicate array of objects by _id string
        const dedupeById = (arr) => {
            const seen = new Set();
            return arr.filter(item => {
                const idStr = item._id.toString();
                if (seen.has(idStr)) return false;
                seen.add(idStr);
                return true;
            });
        };

        // Populate regular relationships grouped by type
        const relGroups = {};
        for (const rel of doc.relationships || []) {
            const relQuery = { _id: rel.refId, isDeleted: false };
            // Apply parent constraint to relationships if exists
            if (req.resourceParent) {
                relQuery.resourceParent = req.resourceParent._id;
            }

            const relatedDoc = await ResourceTag.findOne(relQuery).lean();
            if (!relatedDoc) continue;

            const summary = {
                _id: relatedDoc._id,
                name: relatedDoc.name,
                type: relatedDoc.type,
            };

            if (!relGroups[rel.type]) {
                relGroups[rel.type] = [];
            }
            relGroups[rel.type].push(summary);
        }

        // Deduplicate and flatten relGroups into output
        for (const [key, val] of Object.entries(relGroups)) {
            const unique = dedupeById(val);
            output[key] = unique.length === 1 ? unique[0] : unique;
        }

        // Populate "Connection" resources that connect from this resource
        const connectionQuery = {
            type: 'connections',
            'relationships.refId': doc._id,
        };

        // Apply parent constraint to connections if exists
        if (req.resourceParent) {
            connectionQuery.resourceParent = req.resourceParent._id;
        }

        const connections = await ResourceTag.find(connectionQuery).lean();
        console.log(connections, 'conns', doc)
        for (const conn of connections) {
            const otherRels = conn.relationships.filter(r =>
                r.refId.toString() !== doc._id.toString()
            );

            for (const rel of otherRels) {
                const connectedQuery = { _id: rel.refId };
                // Apply parent constraint to connected resources if exists
                if (req.resourceParent) {
                    connectedQuery.resourceParent = req.resourceParent._id;
                }

                const connectedResource = await ResourceTag.findOne(connectedQuery).lean();
                if (!connectedResource) continue;

                const key = rel.type; // relationship type as key

                const summary = {
                    _id: connectedResource._id,
                    name: connectedResource.name,
                    type: connectedResource.type,
                };

                if (output[key]) {
                    if (Array.isArray(output[key])) {
                        output[key].push(summary);
                        output[key] = dedupeById(output[key]);
                    } else {
                        output[key] = dedupeById([output[key], summary]);
                    }
                } else {
                    output[key] = summary;
                }
            }
        }

        return res.json(output);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
};

export const createResource = async (req, res) => {
    try {
        // Include resourceParent from middleware if exists
        const resourceData = {
            ...req.body,
            ...(req.resourceParent && { resourceParent: req.resourceParent._id })
        };

        const newResource = new ResourceTag(resourceData);
        const saved = await newResource.save();

        res.status(201).json({
            ...saved.toObject(),
            parentContext: req.resourceParent ? req.resourceParent._id : null
        });
    } catch (err) {
        res.status(400).json({
            message: 'Error creating resource',
            error: err.message
        });
    }
};

export const updateResource = async (req, res) => {
    try {
        const { id } = req.params;
        const query = { _id: id };

        // Add resourceParent constraint if exists
        if (req.resourceParent) {
            query.resourceParent = req.resourceParent._id;
        }

        const updated = await ResourceTag.findOneAndUpdate(
            query,
            req.body,
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({
                message: 'Resource not found or not in parent scope'
            });
        }

        res.json({
            ...updated.toObject(),
            parentContext: req.resourceParent ? req.resourceParent._id : null
        });
    } catch (err) {
        res.status(400).json({
            message: 'Error updating resource',
            error: err.message
        });
    }
};

export const deleteResource = async (req, res) => {
    try {
        const { id } = req.params;
        const query = { _id: id };

        // Add resourceParent constraint if exists
        if (req.resourceParent) {
            query.resourceParent = req.resourceParent._id;
        }

        const resource = await ResourceTag.findOne(query);
        if (!resource) {
            return res.status(404).json({
                message: 'Resource not found or not in parent scope'
            });
        }

        // Remove relationships pointing to this resource
        await ResourceTag.updateMany(
            { 'relationships.refId': resource._id },
            { $pull: { relationships: { refId: resource._id } } }
        );

        await ResourceTag.deleteOne({ _id: resource._id });

        res.json({
            message: 'Deleted successfully',
            parentContext: req.resourceParent ? req.resourceParent._id : null
        });
    } catch (err) {
        res.status(400).json({
            message: 'Error deleting resource',
            error: err.message
        });
    }
};

export const listResources = async (req, res) => {
    try {
        const query = {};

        // Add resourceParent filter if exists in request
        if (req.resourceParent) {
            query.resourceParent = req.resourceParent._id;
        }

        const list = await ResourceTag.find(query)
            .select('_id name resourceType resourceParent')
            .lean();

        res.json({
            resources: list,
            parentContext: req.resourceParent ? req.resourceParent._id : null
        });
    } catch (err) {
        res.status(500).json({
            message: 'Failed to list resources',
            error: err.message
        });
    }
};