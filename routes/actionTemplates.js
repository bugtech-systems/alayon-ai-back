import express from 'express';
import actionTemplateService from '../services/ActionTemplateService1.js';
import { validateRequest } from '../middleware/validation.js';
import { db } from '../models/index.js';

const router = express.Router();

// Create a new action template
router.post('/', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        const {
            name,
            description,
            action_type,
            target_resource_type_id,
            field_mappings = {},
            aggregations = {},
            conditions = {},
            parameters = {},
            pre_hooks = [],
            post_hooks = [],
        } = req.body;

        // Validate required fields
        if (!name || !action_type) {
            throw new Error('Name and action_type are required');
        }

        // Create template within transaction
        const template = await db.ActionTemplate.create({
            name,
            description,
            action_type,
            target_resource_type_id,
            conditions,
            field_mappings,
            aggregations,
            pre_hooks,
            post_hooks
        }, { transaction });

        // Create parameters within the same transaction
        if (parameters.length > 0) {
            await db.ActionTemplateParameter.bulkCreate(
                parameters.map(param => ({
                    ...param,
                    template_id: template.id
                })),
                { transaction }
            );
        }

        // Fetch the complete record WITHIN the transaction
        const createdTemplate = await db.ActionTemplate.findByPk(template.id, {
            include: ['target_resource_type', 'parameters'],
            transaction
        });

        // Commit only after all operations succeed
        await transaction.commit();

        res.status(201).json(createdTemplate);
    } catch (error) {
        await transaction.rollback();
        console.log(error, 'ERROR')
        next(error);
    }
});

// Execute an action template
router.post('/:name/execute', async (req, res) => {
    try {
        const result = await actionTemplateService.executeTemplate(
            req.params.name,
            req.body.parameters || {},
            req.body.where || {}
        );
        res.json(result);
    } catch (error) {
        res.status(400).json({
            error: error.message,
            details: error.details
        });
    }
});

// Get all action templates
router.get('/', async (req, res) => {
    try {
        const templates = await db.ActionTemplate.findAll({
            include: [
                {
                    model: db.ActionTemplateParameter,
                    as: 'parameters'
                }
            ],
            order: [['created_at', 'DESC']]
        });
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get template by name
router.get('/:name', async (req, res) => {
    try {
        const template = await db.ActionTemplate.findOne({
            where: { name: req.params.name },
            include: [
                {
                    model: db.ActionTemplateParameter,
                    as: 'parameters'
                }
            ]
        });

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json(template);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update template
router.put('/:id', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const { parameters, ...templateData } = req.body;

        // Validate template exists
        const existingTemplate = await db.ActionTemplate.findByPk(id, {
            include: [{
                model: db.ActionTemplateParameter,
                as: 'parameters'
            }],
            transaction
        });

        if (!existingTemplate) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Action template not found' });
        }

        // Update template fields
        const [updated] = await db.ActionTemplate.update(templateData, {
            where: { id },
            transaction
        });

        // Handle parameter updates if provided
        if (parameters && Array.isArray(parameters)) {
            const existingParams = existingTemplate.parameters || [];
            const newParams = parameters || [];

            // Identify parameters to keep, update, and create
            const paramsToKeep = existingParams.filter(ep =>
                newParams.some(np => np.id === ep.id)
            );
            const paramsToDelete = existingParams.filter(ep =>
                !newParams.some(np => np.id === ep.id)
            );
            const paramsToCreate = newParams.filter(np => !np.id);
            const paramsToUpdate = newParams.filter(np =>
                np.id && existingParams.some(ep => ep.id === np.id)
            );

            // Perform batch operations
            await Promise.all([
                // Delete removed parameters
                paramsToDelete.length > 0 && db.ActionTemplateParameter.destroy({
                    where: {
                        id: paramsToDelete.map(p => p.id),
                        template_id: id
                    },
                    transaction
                }),

                // Update modified parameters
                ...paramsToUpdate.map(param =>
                    db.ActionTemplateParameter.update(param, {
                        where: { id: param.id },
                        transaction
                    })
                ),

                // Create new parameters
                paramsToCreate.length > 0 && db.ActionTemplateParameter.bulkCreate(
                    paramsToCreate.map(param => ({
                        ...param,
                        template_id: id
                    })),
                    { transaction }
                )
            ]);
        }

        // Fetch the fully updated template
        const updatedTemplate = await db.ActionTemplate.findByPk(id, {
            include: [
                {
                    model: db.ResourceTag,
                    as: 'target_resource_type',
                    attributes: ['id', 'name', 'type']
                },
                {
                    model: db.ActionTemplateParameter,
                    as: 'parameters',
                    attributes: ['id', 'name', 'data_type', 'required', 'default_value']
                }
            ],
            transaction
        });

        await transaction.commit();
        return res.json(updatedTemplate);
    } catch (error) {
        if (transaction.finished !== 'commit') {
            await transaction.rollback();
        }

        console.error('Error updating action template:', error);

        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.errors.map(e => ({
                    field: e.path,
                    message: e.message
                }))
            });
        }

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({
                error: 'Invalid reference',
                details: 'The specified target resource type does not exist'
            });
        }

        next(error);
    }
});

// Delete template
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await db.ActionTemplate.destroy({
            where: { id: req.params.id }
        });

        if (!deleted) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;