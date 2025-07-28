import express from 'express';
// import { validateRequest } from '../middleware/validation.js';
import { db } from '../models/index.js';
import { ActionEngine } from '../services/ActionEngine.js';
import { ActionService } from '../services/ActionTriggerService.js';
import { generateExecutionId } from '../helpers/helpers.js';
import { findActionTemplateByName } from '../services/ResourceService.js';

const actionEngine = new ActionEngine();


const router = express.Router();

// Create a new action template
router.post('/', async (req, res, next) => {
    try {
        const template = await db.ActionTemplate.create(req.body);
        res.status(201).json(template);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Execute an action template
router.post('/:templateId/execute', async (req, res) => {
    try {


        let template = await findActionTemplateByName(req.params.templateId);
        // let result;


        console.log(template, 'TEMP')

        if (!template) return res.status(400).json({ message: "Template doesn't exist." })


        // Validate parameters against template requirements
        const validationErrors = [];
        const parameters = req.body.parameters;
        // 1. Check for missing required parameters
        const missingRequiredParams = template.parameters
            .filter(p => p.is_required && !parameters.hasOwnProperty(p.field_name) && !p.default_value)
            .map(p => p.field_name);

        if (missingRequiredParams.length > 0) {
            validationErrors.push({
                type: 'MISSING_REQUIRED',
                message: 'Missing required parameters',
                details: missingRequiredParams
            });
        }

        // 2. Check for parameters not defined in the template
        const allowedParamNames = template.parameters.map(p => p.field_name);
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
                if (!parameters.hasOwnProperty(param.field_name) && param.default_value) {
                    parameters[param.field_name] = param.default_value;
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




        let result = null;



        const trigger = await db.ActionTrigger.create({
            ...req.body,
            action_template_id: template.id,
            tool_type: template.tool_type,
            parameters: req.body.parameters
        });


        console.log(trigger, template, req.body.parameters, 'temp')

        if (trigger.trigger_type !== 'IMMEDIATE') {
            await ActionService.scheduleTrigger(trigger);
        } else {

            // this.executeImmediately(trigger);
            result = await actionEngine.execute(
                template.id,
                req.body.parameters
            );
        }






        res.json(result);
    } catch (error) {
        // console.log(error, "ERRORrr")
        res.status(400).json({
            error: error?.message,
            details: error?.details
        });
    }
});

// Get all action templates
router.get('/', async (req, res) => {
    try {
        const templates = await db.ActionTemplate.findAll({
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
            /*   include: [{
                  model: db.ActionTemplateParameter,
                  as: 'parameters'
              }], */
            transaction
        });

        if (!existingTemplate) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Action template not found' });
        }

        // Update template fields
        const [updated] = await db.ActionTemplate.update({ parameters, ...templateData }, {
            where: { id },
            transaction
        });

        // Handle parameter updates if provided
        /*   if (parameters && Array.isArray(parameters)) {
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
   */
        // Fetch the fully updated template
        const updatedTemplate = await db.ActionTemplate.findByPk(id, {
            include: [
                {
                    model: db.ResourceTag,
                    as: 'target_resource_type',
                    attributes: ['id', 'resource_name', 'resource_type']
                },
                // {
                //     model: db.ActionTemplateParameter,
                //     as: 'parameters',
                //     attributes: ['id', 'name', 'data_type', 'required', 'default_value']
                // }
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