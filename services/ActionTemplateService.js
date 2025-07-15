import { removeNullKeys } from '../helpers/helpers.js';
import { db } from '../models/index.js';
import ResourceApiService from './ResourceApiService.js';
import { formattedResourceObject } from './ResourceService.js';
import resultReferenceService from './ResultReferenceService.js';

/**
 * Executes an action template with the given parameters
 * @param {Object} template - The action template to execute
 * @param {Object} parameters - Key-value pairs of parameters
 * @returns {Promise<Object>} The execution result
 */
export async function executeTemplate(template, parameters, filter) {
    let result;

    // Run pre-hooks if any
    if (template.pre_hooks?.length > 0) {
        await executeHooks(template.pre_hooks, parameters, 'pre-hook');
    }

    // Execute main action
    try {
        switch (template.action_type) {
            case 'create':
                result = await handleCreate(template, parameters);
                break;
            case 'read':
                result = await handleRead(template, parameters, filter);
                break;
            case 'update':
                result = await handleUpdate(template, parameters);
                break;
            case 'delete':
                result = await handleDelete(template, parameters);
                break;
            default:
                throw new Error(`Unsupported action type: ${template.action_type}`);
        }
    } catch (error) {
        throw new Error(`Action execution failed: ${error.message}`);
    }



    // Run post-hooks if any
    // if (template.post_hooks?.length > 0) {
    //     await executeHooks(template.post_hooks, {
    //         ...parameters,
    //         action_result: result
    //     }, 'post-hook');
    // }


    if (parameters.return_reference) {
        const executionId = await resultReferenceService.createResultReference(
            template.id,
            result,
            template.result_ttl_minutes || 60
        );

        return {
            execution_id: executionId,
            result
        };
    }



    return result;
}


export async function getActionTemplates() {

    try {

        let resources = await db.ActionTemplate.findAll({
            attributes: ['name', 'description', 'conditions', 'field_mappings', 'action_type', 'aggregations', 'target_resource_type_id'],
            include: [{
                model: db.ActionTemplateParameter,
                as: 'parameters',
                required: false
            }, {
                model: db.ResourceTag,
                as: 'target_resource_type',
                required: false
            }]
        }).catch(err => {
            console.log(err, 'RANGE ERR')
            return err
        });

        return resources
    } catch (err) {
        console.log(err, 'ERROR')
        return []
    }

}



/**
 * Executes a series of hooks
 * @param {Array} hooks - Array of hook configurations
 * @param {Object} parameters - Current execution parameters
 * @param {string} hookType - Type of hook (for error messages)
 */
async function executeHooks(hooks, parameters, hookType) {
    for (const [index, hook] of hooks.entries()) {
        try {
            const hookTemplate = await db.ActionTemplate.findByPk(hook.template_id);
            if (!hookTemplate) {
                throw new Error(`Hook template not found: ${hook.template_id}`);
            }

            const hookParams = {
                ...parameters,
                ...hook.parameters
            };

            await executeTemplate(hookTemplate, hookParams);
        } catch (error) {
            throw new Error(`${hookType} ${index} failed: ${error.message}`);
        }
    }
}

export async function handleCreate(template, parameters) {
    const transaction = await db.sequelize.transaction();
    try {
        const data = resolveFieldMappings(template.field_mappings, parameters);

        console.log(data, 'CREATE DTA')
        // Resolve any value references
        if (data.attributes) {
            for (const [field_name, value] of Object.entries(data.attributes)) {
                if (typeof value === 'string' && value.startsWith('$result.')) {
                    const { value: resolvedValue } = await resultReferenceService.resolveReference(value);
                    data.attributes[field_name] = resolvedValue;
                }
            }
        }


        let attributes = removeNullKeys(data.attributes);

        // const resource = await db.ResourceTag.create({
        //     type: 'resource',
        //     name: template?.target_resource_type?.name,
        //     resource_parent_id: template.target_resource_type_id,
        //     attributes: data.attributes
        // }, { transaction });

        const resource = await ResourceApiService.createResource(
            { name: template?.target_resource_type?.name, attributes: attributes },
            transaction
        );

        await transaction.commit();
        return resource;
    } catch (error) {
        console.log(error, 'ERROR')
        await transaction.rollback();
        throw error;
    }
}

export async function handleRead(template, parameters, filter) {
    const where = buildWhereClause(template, parameters, filter);



    if (template.aggregations &&
        (
            (Array.isArray(template.aggregations) && template.aggregations.length > 0) ||
            (typeof template.aggregations === 'object' &&
                template.aggregations !== null &&
                !Array.isArray(template.aggregations) &&
                Object.keys(template.aggregations).length > 0)
        )
    ) {
        return handleAggregations(template, where);
    }



    let whereFilter = filter?.where ? filter?.where : filter

    let resourceIds = await db.ResourceTag.findAll({
        where: {
            resource_parent_id: template.target_resource_type_id,
            is_deleted: false,
            name: template?.target_resource_type.name,
            type: 'resource',
            attributes: {
                ...whereFilter?.attributes, ...where?.attributes
            }
        },
        attributes: ['id', 'name', 'attributes'],
        order: [['created_at', 'DESC']],
        raw: true
    }).then(doc => {
        return doc.map(a => { return { id: a.id, ...a?.attributes } })
    }).catch(err => {
        console.log(err, 'ERRORR')
        return []
    });

    return resourceIds
}

async function handleUpdate(template, parameters) {
    const transaction = await db.sequelize.transaction();
    try {
        const where = buildWhereClause(template, parameters);
        const data = resolveFieldMappings(template.field_mappings, parameters);

        // Validate we have either metadata or values to update
        if (!data.metadata && !data.attributes) {
            throw new Error('No update data provided');
        }

        let affectedCount = 0;

        // Update ResourceTag metadata if provided
        if (data.metadata) {
            // First fetch the current attributes to merge with new updates
            const existingRecords = await db.ResourceTag.findAll({
                where: {
                    resource_parent_id: template.target_resource_type_id,
                    is_deleted: false,
                    ...where
                },
                transaction
            });

            if (existingRecords.length === 0) {
                throw new Error('No matching records found for update');
            }

            // Prepare updates for each record
            const updates = existingRecords.map(record => {
                // Merge existing attributes with new updates (only overwriting provided fields)
                const updatedAttributes = {
                    ...record.attributes, // Existing attributes
                    ...data.attributes   // New updates (only overwrites provided fields)
                };

                return db.ResourceTag.update(
                    { attributes: updatedAttributes },
                    {
                        where: { id: record.id },
                        transaction
                    }
                );
            });

            // Execute all updates
            const updateResults = await Promise.all(updates);
            affectedCount = updateResults.reduce((sum, [count]) => sum + count, 0);

            console.log(`Updated ${affectedCount} resource metadata records`);
        }

        await transaction.commit();
        console.log('Transaction committed successfully');

        return {
            success: true,
            affected: where.id ? affectedCount : 'multiple',
            resourceId: where.id
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Update failed:', {
            message: error.message,
            stack: error.stack,
            templateId: template?.id,
            parameters
        });

        // Error handling remains the same as your original
        if (error.message.includes('Failed to update field')) {
            return {
                success: false,
                error: error.message,
                details: {
                    field: error.message.match(/field (\w+)/)[1],
                    reason: error.message.split(':').slice(1).join(':').trim()
                }
            };
        }

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return {
                success: false,
                error: 'Invalid resource reference',
                details: {
                    constraint: error.parent?.constraint,
                    table: error.parent?.table
                }
            };
        }

        if (error.name === 'SequelizeValidationError') {
            return {
                success: false,
                error: 'Validation failed',
                details: error.errors.map(err => ({
                    field: err.path,
                    message: err.message,
                    value: err.value
                }))
            };
        }

        return {
            success: false,
            error: error.message || 'Unknown error during update'
        };
    }
}

async function handleDelete(template, parameters) {
    const where = buildWhereClause(template, parameters);

    const result = await db.ResourceTag.update(
        { is_deleted: true },
        {
            where: {
                resource_parent_id: template.target_resource_type_id,
                is_deleted: false,
                ...where
            }
        }
    );

    return {
        success: true,
        deleted_count: result[0]
    };
}

async function handleAggregations(template, where) {
    const results = {};
    // let whereValue = {}



    for (const [aggType, config] of Object.entries(template.aggregations)) {
        switch (aggType) {
            case 'count':


                results.count = await db.ResourceTag.count({
                    where: {
                        resource_parent_id: template.target_resource_type_id,
                        is_deleted: false,
                        type: 'resource',
                        ...where
                    }
                });
                break;

            case 'sum':
                results.sum = await db.ResourceValue.sum('value', {
                    where: {
                        field_name: config.field,
                        ...buildValueWhere(config.filter, where)
                    },
                    include: [{
                        model: db.ResourceTag,
                        where: {
                            resource_parent_id: template.target_resource_type_id,
                            is_deleted: false
                        }
                    }]
                });
                break;

            // Add other aggregation types as needed
        }
    }

    return results;
}

function resolveFieldMappings(mappings, parameters) {
    const result = { metadata: {}, attributes: {} };

    for (const [target, source] of Object.entries(mappings || {})) {
        const isValueField = target.startsWith('attributes.');
        const field_name = isValueField ? target.replace('attributes.', '') : target;

        if (typeof source === 'string') {
            if (source.startsWith('$param.')) {
                const value = getNestedProperty(parameters, source.replace('$param.', ''));
                setNestedProperty(isValueField ? result.attributes : result.metadata, field_name, value);
            } else if (source.startsWith('$resource.')) {
                const [paramName, prop] = source.replace('$resource.', '').split('.');
                result.attributes[field_name] = {
                    value: prop ? getNestedProperty(parameters[paramName], prop) : null,
                    related_resource_id: parameters[paramName]?.id
                };
            } else {
                setNestedProperty(isValueField ? result.attributes : result.metadata, field_name, source);
            }
        } else {
            setNestedProperty(isValueField ? result.attributes : result.metadata, field_name, source);
        }
    }

    return result;
}

function buildWhereClause(template, params, filter = {}) {
    const where = {};
    const conditions = template.action_type == 'read' ? filter : template?.conditions;
    const fieldMappings = template.field_mappings || {};
    // First resolve all parameter references in the conditions
    const resolvedConditions = resolveParameterValue(conditions, params);

    for (const [field, condition] of Object.entries(resolvedConditions)) {
        // Get the mapped field path if field_mappings exist
        const mappedField = fieldMappings[field]
            ? fieldMappings[field].replace('$param.', '')
            : field;

        if (typeof condition === 'object' && condition !== null) {
            const operators = {};
            for (const [operator, value] of Object.entries(condition)) {
                // Skip if value is undefined (parameter wasn't provided)
                if (value === undefined) continue;

                switch (operator) {
                    case '$eq': operators[db.Sequelize.Op.eq] = value; break;
                    case '$ne': operators[db.Sequelize.Op.ne] = value; break;
                    case '$gt': operators[db.Sequelize.Op.gt] = value; break;
                    case '$gte': operators[db.Sequelize.Op.gte] = value; break;
                    case '$lt': operators[db.Sequelize.Op.lt] = value; break;
                    case '$lte': operators[db.Sequelize.Op.lte] = value; break;
                    case '$in': operators[db.Sequelize.Op.in] = value; break;
                    case '$notIn': operators[db.Sequelize.Op.notIn] = value; break;
                    case '$like': operators[db.Sequelize.Op.like] = value; break;
                    case '$notLike': operators[db.Sequelize.Op.notLike] = value; break;
                    case '$iLike': operators[db.Sequelize.Op.iLike] = value; break;
                    case '$between': operators[db.Sequelize.Op.between] = value; break;
                    case '$notBetween': operators[db.Sequelize.Op.notBetween] = value; break;
                    case '$overlap': operators[db.Sequelize.Op.overlap] = value; break;
                    case '$contains': operators[db.Sequelize.Op.contains] = value; break;
                    case '$contained': operators[db.Sequelize.Op.contained] = value; break;
                    case '$any': operators[db.Sequelize.Op.any] = value; break;
                }
            }


            // Only add to where clause if we have operators
            if (Reflect.ownKeys(operators).length > 0) {
                where[mappedField] = operators;
            }

        } else {
            // Simple equality check for non-object conditions
            if (condition !== undefined) {
                where[mappedField] = condition;
            }
        }
    }

    // Apply field mappings to the where clause structure
    return applyFieldMappings(where, fieldMappings);
}

// Helper function to resolve parameter references in conditions
function resolveParameterValue(obj, params) {
    if (typeof obj === 'string' && obj.startsWith('$param.')) {
        const paramKey = obj.replace('$param.', '');
        return params[paramKey];
    }

    if (Array.isArray(obj)) {
        return obj.map(item => resolveParameterValue(item, params));
    }

    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = resolveParameterValue(value, params);
        }
        return result;
    }

    return obj;
}

// Helper function to restructure where clause based on field mappings
function applyFieldMappings(where, fieldMappings) {
    const mappedWhere = {};

    for (const [field, value] of Object.entries(where)) {
        // Find if this field has a mapping
        const mapping = Object.entries(fieldMappings).find(([_, v]) =>
            v === `$param.${field}`
        );

        if (mapping) {
            // Split the target path (e.g., "attributes.status" → ["attributes", "status"])
            const path = mapping[0].split('.');
            let current = mappedWhere;

            for (let i = 0; i < path.length; i++) {
                const part = path[i];
                if (i === path.length - 1) {
                    current[part] = value;
                } else {
                    current[part] = current[part] || {};
                    current = current[part];
                }
            }
        } else {
            mappedWhere[field] = value;
        }
    }

    return mappedWhere;
}

// function resolveParameterValue(value, parameters) {
//     if (typeof value === 'string' && value.startsWith('$param.')) {
//         return getNestedProperty(parameters, value.replace('$param.', ''));
//     }
//     return value;
// }

// function resolveFieldValue(value, parameters) {
//     if (typeof value === 'string' && value.startsWith('attributes.')) {
//         return getNestedProperty(parameters, value.replace('attributes.', ''));
//     }
//     return value;
// }


function getNestedProperty(obj, path) {
    return path.split('.').reduce((o, p) => o?.[p], obj);
}

function setNestedProperty(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    let current = obj;

    for (const part of parts) {
        current[part] = current[part] || {};
        current = current[part];
    }

    current[last] = value;
}


function convertToFieldValueObject(flatObject) {
    // Handle null/undefined input
    if (!flatObject || typeof flatObject !== 'object') {
        return { [db.Sequelize.Op.and]: [] };
    }

    // Safely get object keys
    const keys = Object.keys(flatObject);
    if (keys.length === 0) return { [db.Sequelize.Op.and]: [] };

    const conditions = keys.map(key => {
        const value = flatObject[key];

        // Ensure key is a string
        if (typeof key !== 'string') {
            return {};
        }

        // Split the key safely
        const keyParts = key.split('.');
        const fieldName = keyParts[keyParts.length - 1];
        // Handle different value types
        if (value === null || value === undefined) {
            return {};
        }

        if (Array.isArray(value)) {
            return { field_name: fieldName, value: { [db.Sequelize.Op.in]: value } };
        }

        if (typeof value === 'object') {
            // Handle nested operators like { gt: 10 }
            const operator = Object.keys(value)[0];
            if (operator in db.Sequelize.Op) {
                return { field_name: fieldName, value: { [db.Sequelize.Op[operator]]: value[operator] } };
            }
            return { field_name: fieldName, value: value }; // Direct object assignment
        }

        // Default equality check
        return { field_name: fieldName, value: value };
    }).filter(cond => Object.keys(cond).length > 0); // Remove empty conditions
    return conditions.length > 0 ? { [db.Sequelize.Op.or]: conditions } : {};
}



