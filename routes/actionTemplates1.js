import express from 'express';
import { db } from '../models/index.js';
import { executeTemplate } from '../services/ActionTemplateService1.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ActionTemplates
 *   description: Action template management
 */

/**
 * @swagger
 * /api/v1/action-templates:
 *   post:
 *     summary: Create a new action template
 *     tags: [ActionTemplates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActionTemplate'
 *     responses:
 *       201:
 *         description: Created action template
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        const {
            name,
            description,
            action_type,
            target_resource_type_id,
            conditions = {},
            field_mappings = {},
            aggregations = [],
            pre_hooks = [],
            post_hooks = [],
            parameters = []
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

/**
 * @swagger
 * /api/v1/action-templates:
 *   get:
 *     summary: Get all action templates
 *     tags: [ActionTemplates]
 *     responses:
 *       200:
 *         description: List of action templates
 */
router.get('/', async (req, res, next) => {
    try {
        const templates = await db.ActionTemplate.findAll({
            include: [
                {
                    model: db.ResourceTag,
                    as: 'target_resource_type',
                    attributes: ['id', 'name', 'type']
                },
                {
                    model: db.ActionTemplateParameter,
                    as: 'parameters',
                    attributes: ['id', 'name', 'data_type', 'required']
                }
            ],
            order: [['created_at', 'DESC']]
        });
        res.json(templates);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/v1/action-templates/{id}:
 *   get:
 *     summary: Get a specific action template
 *     tags: [ActionTemplates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Action template data
 *       404:
 *         description: Action template not found
 */
router.get('/:id', async (req, res, next) => {
    try {
        const template = await db.ActionTemplate.findByPk(req.params.id, {
            include: [
                {
                    model: db.ResourceTag,
                    as: 'target_resource_type',
                    attributes: ['id', 'name', 'type']
                },
                {
                    model: db.ActionTemplateParameter,
                    as: 'parameters'
                }
            ]
        });

        if (!template) {
            return res.status(404).json({ error: 'Action template not found' });
        }

        res.json(template);
    } catch (error) {
        console.log(error, 'ERROR')
        next(error);
    }
});

/**
 * @swagger
 * /api/v1/action-templates/{name}/execute:
 *   post:
 *     summary: Execute an action template
 *     tags: [ActionTemplates]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parameters:
 *                 type: object
 *                 description: Key-value pairs of parameters
 *     responses:
 *       200:
 *         description: Template execution result
 *       400:
 *         description: Missing required parameters
 *       404:
 *         description: Action template not found
 */
router.post('/:name/execute', async (req, res, next) => {
    try {
        const { name } = req.params;
        const { parameters = {} } = req.body;

        const template = await db.ActionTemplate.findOne({
            where: { name },
            include: [
                {
                    model: db.ResourceTag,
                    as: 'target_resource_type'
                },
                {
                    model: db.ActionTemplateParameter,
                    as: 'parameters',
                    required: false
                }
            ]
        });

        if (!template) {
            return res.status(404).json({ error: 'Action template not found' });
        }

        // Validate parameters against template requirements
        const validationErrors = [];

        // 1. Check for missing required parameters
        const missingRequiredParams = template.parameters
            .filter(p => p.is_required && !parameters.hasOwnProperty(p.name) && !p.default_value)
            .map(p => p.name);

        if (missingRequiredParams.length > 0) {
            validationErrors.push({
                type: 'MISSING_REQUIRED',
                message: 'Missing required parameters',
                details: missingRequiredParams
            });
        }

        // 2. Check for parameters not defined in the template
        const allowedParamNames = template.parameters.map(p => p.name);
        const extraParams = Object.keys(parameters).filter(
            paramName => !allowedParamNames.includes(paramName)
        );

        if (extraParams.length > 0) {
            validationErrors.push({
                type: 'EXTRA_PARAMETERS',
                message: 'Parameters not allowed by template',
                details: extraParams
            });
        }

        // 3. Validate parameter values against allowed fields (if template has field restrictions)
        // if (template.allowed_fields && template.allowed_fields.length > 0) {
        //     const allowedFieldValues = template.allowed_fields.reduce((acc, field) => {
        //         acc[field.field_name] = field.allowed_values
        //             ? JSON.parse(field.allowed_values)
        //             : null;
        //         return acc;
        //     }, {});

        //     const invalidFieldValues = [];

        //     for (const [paramName, paramValue] of Object.entries(parameters)) {
        //         if (allowedFieldValues[paramName] &&
        //             !allowedFieldValues[paramName].includes(paramValue)) {
        //             invalidFieldValues.push({
        //                 parameter: paramName,
        //                 value: paramValue,
        //                 allowed: allowedFieldValues[paramName]
        //             });
        //         }
        //     }

        //     if (invalidFieldValues.length > 0) {
        //         validationErrors.push({
        //             type: 'INVALID_VALUES',
        //             message: 'Parameter values not in allowed values',
        //             details: invalidFieldValues
        //         });
        //     }
        // }

        // 4. Apply default values for missing optional parameters
        if (template.parameters && template.parameters.length) {
            for (const param of template.parameters) {
                if (!parameters.hasOwnProperty(param.name) && param.default_value) {
                    parameters[param.name] = param.default_value;
                }
            }
        }

        // Return validation errors if any
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Parameter validation failed',
                validationErrors
            });
        }

        // Execute template if validation passes
        const result = await executeTemplate(template, parameters);
        res.json(result);
    } catch (error) {
        console.error('Template execution error:', error);
        next(error);
    }
});

/**
 * @swagger
 * /api/v1/action-templates/{id}:
 *   put:
 *     summary: Update an action template
 *     tags: [ActionTemplates]
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
 *             $ref: '#/components/schemas/ActionTemplate'
 *     responses:
 *       200:
 *         description: Updated action template
 *       404:
 *         description: Action template not found
 */
router.put('/:id', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const { parameters, ...templateData } = req.body;

        // Validate template exists
        const existingTemplate = await db.ActionTemplate.findByPk(id, { transaction });
        if (!existingTemplate) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Action template not found' });
        }



        // Update template fields
        const [updated] = await db.ActionTemplate.update(templateData, {
            where: { id },
            transaction
        });



        if (!updated) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Failed to update action template' });
        }

        // Handle parameter updates if provided
        if (parameters && Array.isArray(parameters)) {
            // First delete all existing parameters
            await db.ActionTemplateParameter.destroy({
                where: { template_id: id },
                transaction
            });

            // Then create new parameters
            await db.ActionTemplateParameter.bulkCreate(
                parameters.map(param => ({
                    ...param,
                    template_id: id
                })),
                { transaction }
            );
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
        res.json(updatedTemplate);
    } catch (error) {
        if (transaction.finished !== 'commit') {
            await transaction.rollback();
        }


        console.log(error, 'ERROR')
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

/**
 * @swagger
 * /api/v1/action-templates/{id}:
 *   delete:
 *     summary: Delete an action template
 *     tags: [ActionTemplates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Action template deleted
 *       404:
 *         description: Action template not found
 */
router.delete('/:id', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        // First delete parameters to maintain referential integrity
        await db.ActionTemplateParameter.destroy({
            where: { template_id: req.params.id },
            transaction
        });

        const deleted = await db.ActionTemplate.destroy({
            where: { id: req.params.id },
            transaction
        });

        if (!deleted) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Action template not found' });
        }

        await transaction.commit();
        res.json({ message: 'Action template and associated parameters deleted successfully' });
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
});

// Error handling middleware
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

export default router;