import express from 'express';
import { db } from '../models/index.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Relationships
 *   description: Resource relationship management
 */

/**
 * @swagger
 * /api/v1/relationships:
 *   post:
 *     summary: Create a relationship between resources
 *     tags: [Relationships]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Relationship'
 *     responses:
 *       201:
 *         description: Created relationship
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { source_resource_id, target_resource_id, relationship_type } = req.body;

        // Validate input
        if (!source_resource_id || !target_resource_id || !relationship_type) {
            throw new Error('Source resource ID, target resource ID, and relationship type are required');
        }

        if (source_resource_id === target_resource_id) {
            throw new Error('Cannot create relationship to the same resource');
        }

        // Verify resources exist
        const [sourceResource, targetResource] = await Promise.all([
            db.ResourceTag.findByPk(source_resource_id, { transaction }),
            db.ResourceTag.findByPk(target_resource_id, { transaction })
        ]);

        if (!sourceResource || !targetResource) {
            throw new Error('One or both resources not found');
        }

        const relationship = await db.ResourceRelationship.create({
            source_resource_id,
            target_resource_id,
            relationship_type,
            is_active: true
        }, { transaction });

        await transaction.commit();

        const createdRelationship = await db.ResourceRelationship.findByPk(relationship.id, {
            include: ['source_resource', 'target_resource'],
            transaction
        });

        res.status(201).json(createdRelationship);
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
});

/**
 * @swagger
 * /api/v1/relationships/{resourceId}:
 *   get:
 *     summary: Get relationships for a resource
 *     tags: [Relationships]
 *     parameters:
 *       - in: path
 *         name: resourceId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of relationships
 */
router.get('/:resourceId', async (req, res, next) => {
    try {
        const relationships = await db.ResourceRelationship.findAll({
            where: {
                [db.Sequelize.Op.or]: [
                    { source_resource_id: req.params.resourceId },
                    { target_resource_id: req.params.resourceId }
                ],
                is_active: true
            },
            include: [
                {
                    model: db.ResourceTag,
                    as: 'source_resource',
                    where: { is_deleted: false },
                    required: false
                },
                {
                    model: db.ResourceTag,
                    as: 'target_resource',
                    where: { is_deleted: false },
                    required: false
                }
            ],
            order: [['created_at', 'DESC']]
        });

        // Format response to distinguish between incoming and outgoing relationships
        const formattedRelationships = relationships.map(rel => ({
            ...rel.toJSON(),
            direction: rel.source_resource_id === parseInt(req.params.resourceId) ? 'outgoing' : 'incoming'
        }));

        res.json(formattedRelationships);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/v1/relationships/{id}:
 *   delete:
 *     summary: Delete a relationship
 *     tags: [Relationships]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Relationship deleted
 *       404:
 *         description: Relationship not found
 */
router.delete('/:id', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        // Using soft delete
        const [updated] = await db.ResourceRelationship.update(
            { is_active: false },
            {
                where: { id: req.params.id },
                transaction
            }
        );

        if (!updated) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Relationship not found' });
        }

        await transaction.commit();
        res.json({ message: 'Relationship deleted successfully' });
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
});

export default router;