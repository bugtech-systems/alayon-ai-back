import { ResourceTag } from '../models/ResourceTag.js';
import mongoose from 'mongoose';

export const createResource = async (req, res) => {
    try {
        const resource = new ResourceTag(req.body);
        await resource.save();
        res.status(201).json(resource);
    } catch (err) {
        res.status(400).json({ message: 'Failed to create resource', error: err.message });
    }
};

export const getResourcesByType = async (req, res) => {
    try {
        const { resourceType } = req.params;
        const resources = await ResourceTag.find({ resourceType }).lean();
        res.json(resources);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch resources', error: err.message });
    }
};

export const getResourceWithRelationships = async (req, res) => {
    try {
        const { id } = req.params;

        const resource = await ResourceTag.findById(id).lean();
        if (!resource) return res.status(404).json({ message: 'Resource not found' });

        // Populate forward relationships
        const populatedForward = await Promise.all(
            (resource.relationships || []).map(async (rel) => {
                const related = await ResourceTag.findById(rel.refId).lean();
                return {
                    ...rel,
                    relatedResource: related || null
                };
            })
        );

        resource.relationships = populatedForward;

        // Populate reverse relationships (other resources pointing to this one)
        const reverseLinked = await ResourceTag.find({
            'relationships.refId': new mongoose.Types.ObjectId(id)
        }).lean();

        // Group reverse relationships by type
        const referencedBy = reverseLinked.map(doc => {
            const matchedRelationships = (doc.relationships || []).filter(r => r.refId.toString() === id);
            return {
                _id: doc._id,
                name: doc.name,
                resourceType: doc.resourceType,
                matchedRelationships
            };
        });

        res.json({
            resource,
            referencedBy
        });

    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch resource detail', error: err.message });
    }
};

export const updateResource = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await ResourceTag.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated) return res.status(404).json({ message: 'Resource not found' });
        res.json(updated);
    } catch (err) {
        res.status(400).json({ message: 'Failed to update resource', error: err.message });
    }
};

export const deleteResource = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await ResourceTag.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ message: 'Resource not found' });
        res.json({ message: 'Resource deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete resource', error: err.message });
    }
};
