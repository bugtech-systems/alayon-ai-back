import express from 'express';
import resourceService from '../services/ResourceApiService.js';
import { db } from '../models/index.js';

const router = express.Router();

router.post('/', async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { name, attributes } = req.body;

        if (!name) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Resource name is required' });
        }

        if (!attributes || typeof attributes !== 'object') {
            await transaction.rollback();
            return res.status(400).json({ error: 'Attributes object is required' });
        }

        const resource = await resourceService.createResource(
            { name, attributes },
            transaction
        );

        await transaction.commit();
        return res.status(201).json(resource);
    } catch (error) {
        await transaction.rollback();

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Attribute validation failed',
                validationErrors: error.details
            });
        }

        if (error.name === 'DuplicateError') {
            return res.status(409).json({
                error: 'Duplicate values in unique fields',
                duplicates: error.details
            });
        }

        console.error('Resource creation error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            ...(process.env.NODE_ENV === 'development' && {
                details: error.message,
                stack: error.stack
            })
        });
    }
});

router.get('/type/:typeId', async (req, res, next) => {
    try {
        const resources = await resourceService.getResourcesByType(req.params.typeId);
        res.json(resources);
    } catch (error) {
        next(error);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const resource = await resourceService.getResourceById(req.params.id);
        if (!resource) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        res.json(resource);
    } catch (error) {
        next(error);
    }
});

router.put('/:id', async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { name, attributes } = req.body;
        const resource = await resourceService.updateResource(
            req.params.id,
            { name, attributes },
            transaction
        );

        await transaction.commit();
        res.json(resource);
    } catch (error) {
        await transaction.rollback();

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Attribute validation failed',
                validationErrors: error.details
            });
        }

        if (error.name === 'ConflictError') {
            return res.status(409).json({
                error: error.message,
                details: error.details
            });
        }

        if (error.message === 'Resource not found') {
            return res.status(404).json({ error: error.message });
        }

        console.error('Update error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            ...(process.env.NODE_ENV === 'development' && {
                details: error.message,
                stack: error.stack
            })
        });
    }
});

router.delete('/:id', async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { resource, is_deleted } = await resourceService.toggleDeleteResource(
            req.params.id,
            transaction
        );

        await transaction.commit();
        return res.json({
            message: `Resource ${is_deleted ? 'deleted' : 'restored'} successfully`,
            is_deleted,
            resource: {
                id: resource.id,
                name: resource.name
            }
        });
    } catch (error) {
        await transaction.rollback();

        if (error.message === 'Resource not found') {
            return res.status(404).json({ error: error.message });
        }

        console.error('Delete error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            ...(process.env.NODE_ENV === 'development' && {
                details: error.message,
                stack: error.stack
            })
        });
    }
});

export default router;