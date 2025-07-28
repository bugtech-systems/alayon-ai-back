import express from 'express';
import { db } from '../models/index.js';
import { Sequelize } from 'sequelize';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ResourceTypes
 *   description: Resource type management
 */

/**
 * @swagger
 * /api/v1/resource-types:
 *   post:
 *     summary: Create a new resource type
 *     tags: [ResourceTypes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResourceType'
 *     responses:
 *       201:
 *         description: Created resource type
 *       400:
 *         description: Validation error
 */
// Create a new resource type with transaction
router.post('/', async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
        const { resource_name, fields } = req.body;


        console.log(fields, resource_name, 'rssss')
        if (!resource_name || !fields) {
            await transaction.rollback();
            return res.status(400).json({ error: 'resource_name is required' });
        }


        // Case-insensitive check for existing resource with same name and parent
        const existingResource = await db.ResourceTag.findOne({
            where: Sequelize.where(
                Sequelize.fn('lower', Sequelize.col('resource_name')),
                Sequelize.fn('lower', resource_name)
            ),
            transaction
        });

        if (existingResource) {
            await transaction.rollback();
            return res.status(409).json({
                error: 'Resource with this name already exists',
                existingResource: {
                    id: existingResource.id,
                    resource_name: existingResource.resource_name,
                    resource_type: existingResource.resource_type
                }
            });
        }


        const resourceType = await db.ResourceTag.create({
            resource_type: 'config',
            resource_name: String(resource_name).toLowerCase()
        }, { transaction });

        if (fields && fields.length > 0) {
            await Promise.all(
                fields.map(field =>
                    db.ResourceField.create({
                        ...field,
                        resource_tag_id: resourceType.id
                    }, { transaction })
                )
            );

            // Reload with fields if needed
            await resourceType.reload({
                include: ['fields'],
                transaction
            });
        }

        await transaction.commit();
        res.status(201).json(resourceType);
    } catch (error) {
        // Only rollback if transaction hasn't completed
        if (transaction.finished !== 'commit') {
            await transaction.rollback();
        }
        res.status(400).json({ error: error.message });
    }
});

/**
 * @swagger
 * /api/v1/resource-types:
 *   get:
 *     summary: Get all resource types
 *     tags: [ResourceTypes]
 *     responses:
 *       200:
 *         description: List of resource types
 */
router.get('/', async (req, res, next) => {
    try {
        const resourceTypes = await db.ResourceTag.findAll({
            where: { resource_type: 'config', is_deleted: false },
            include: [
                {
                    model: db.ResourceField,
                    as: 'fields',
                    where: { is_deleted: false },
                    required: false
                }
            ],
            order: [
                ['created_at', 'DESC'],
                [{ model: db.ResourceField, as: 'fields' }, 'created_at', 'ASC']
            ]
        });
        res.json(resourceTypes);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/v1/resource-types/{id}:
 *   get:
 *     summary: Get a resource type by ID
 *     tags: [ResourceTypes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Resource type data
 *       404:
 *         description: Resource type not found
 */
router.get('/:identifier', async (req, res, next) => {
    try {
        const { identifier } = req.params;
        let options = {}
        // Determine if identifier is numeric (ID) or string (name)

        if (!identifier) {
            return null
        }

        if (Number.isInteger(identifier) || /^\d+$/.test(identifier)) {
            // If identifier is a number, use it directly as parent ID
            options = { id: identifier }
        } else {
            options = {
                resource_name: db.sequelize.where(
                    db.sequelize.fn('LOWER', db.sequelize.col('resource_name')),
                    '=',
                    identifier.toLowerCase()
                )
            }
        }



        const resourceType = await db.ResourceTag.findOne({
            where: {
                ...options,
                is_deleted: false,
                resource_type: 'config' // Ensure it's a config type as per your original check
            },
            include: [
                {
                    model: db.ResourceField,
                    as: 'fields',
                    required: false
                }
            ]
        });


        if (!resourceType) return res.status(404).json({ message: 'Resource Not Found!' })

        let resData = resourceType.get({ plain: true })
        return res.json(resData);
    } catch (error) {
        console.error(`Error fetching resource: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/v1/resource-types/{id}:
 *   put:
 *     summary: Update a resource type
 *     tags: [ResourceTypes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResourceType'
 *     responses:
 *       200:
 *         description: Updated resource type
 *       404:
 *         description: Resource type not found
 */
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { fields, ...resourceData } = req.body;

        // Check if resource exists and include current fields
        const resource = await db.ResourceTag.findByPk(id, {
            include: ['fields']
        });
        if (!resource) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        // Update resource attributes (name, configType, etc.)
        if (Object.keys(resourceData).length > 0) {
            await resource.update(resourceData);
        }

        // Process fields if provided
        if (fields) {
            // Get current field IDs for comparison
            const currentFieldIds = resource.fields.map(f => f.id);
            const incomingFieldIds = fields.filter(f => f.id).map(f => f.id);

            // Determine fields to remove (present in current but not in incoming)
            const fieldsToRemove = currentFieldIds.filter(
                id => !incomingFieldIds.includes(id)
            );

            // Remove fields first
            if (fieldsToRemove.length > 0) {
                await db.ResourceField.destroy({
                    where: {
                        id: fieldsToRemove,
                        resource_tag_id: id
                    }
                });
            }

            // Process each field (create or update)
            const fieldUpdates = fields.map(async field => {
                if (field.id) {
                    // Update existing field
                    const [affectedRows] = await db.ResourceField.update(field, {
                        where: {
                            id: field.id,
                            resource_tag_id: id
                        }
                    });
                    if (affectedRows === 0) {
                        throw new Error(`Failed to update field ${field.id}`);
                    }
                } else {
                    // Create new field
                    const newField = await db.ResourceField.create({
                        ...field,
                        resource_tag_id: id
                    });
                    return newField;
                }
            });

            await Promise.all(fieldUpdates);
        }

        // Fetch the fully updated resource with fields
        const updatedResource = await db.ResourceTag.findByPk(id, {
            include: ['fields']
        });

        res.json({
            success: true,
            data: {
                ...updatedResource.get({ plain: true }),
                fields: updatedResource.fields
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/v1/resource-types/{id}:
 *   delete:
 *     summary: Delete a resource type
 *     tags: [ResourceTypes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Resource type deleted
 *       404:
 *         description: Resource type not found
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await db.sequelize.transaction(async (transaction) => {
            const [updated] = await db.ResourceTag.update(
                { is_deleted: true },
                {
                    where: { id: req.params.id, type: 'config' },
                    transaction
                }
            );

            if (!updated) {
                return null;
            }

            await db.ResourceField.update(
                { is_deleted: true },
                {
                    where: { resource_tag_id: req.params.id },
                    transaction
                }
            );

            return updated;
        });

        if (!result) {
            return res.status(404).json({ error: 'Resource type not found' });
        }

        res.json({ message: 'Resource type and associated fields deleted successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;