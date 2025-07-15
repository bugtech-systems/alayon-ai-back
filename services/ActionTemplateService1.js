import { db } from '../models/index.js';
import { Op } from 'sequelize';
import { ResultReferenceService } from './ResultReferenceService1.js';
import ResourceApiService from './ResourceApiService.js';
import { Ollama } from 'ollama'


const ollamaClient = new Ollama({
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
});
const resultReferenceService = new ResultReferenceService();


class ActionTemplateService {
    /**
     * Creates a new action template
     */

    formatResourceResponse(resource, connection) {
        if (!resource) return null;





        // Format relationships into grouped object
        const formattedRelationships = {};
        if (connection && resource.incoming_relationships) {
            let relate = 'incoming_relationships'
            resource[relate].forEach(relationship => {


                const relatedResource = relationship.target_resource || relationship.source_resource;
                if (relatedResource && (String(relatedResource.name).toLowerCase() == String(connection).toLowerCase())) {
                    if (!formattedRelationships[relatedResource.name]) {
                        formattedRelationships[relatedResource.name] = [];
                    }


                    formattedRelationships[relatedResource.name].push({
                        id: relatedResource.id,
                        type: 'resource',
                        name: relatedResource.name,
                        attributes: { ...relatedResource.attributes },
                        is_deleted: relatedResource.is_deleted,
                        is_active: relatedResource.is_active,
                        created_at: relatedResource.created_at,
                        updated_at: relatedResource.updated_at,
                        // Include relationship-specific attributes if needed
                        relationship_attributes: {
                            created_at: relationship.created_at,
                            updated_at: relationship.updated_at
                        }
                    });
                }
            });
        }

        if (connection && resource.outgoing_relationships) {
            let relate = 'outgoing_relationships'
            resource[relate].forEach(relationship => {


                const relatedResource = relationship.target_resource || relationship.source_resource;
                if (relatedResource && (String(relatedResource.name).toLowerCase() == String(connection).toLowerCase())) {
                    if (!formattedRelationships[relatedResource.name]) {
                        formattedRelationships[relatedResource.name] = [];
                    }

                    formattedRelationships[relatedResource.name].push({
                        id: relatedResource.id,
                        type: 'resource',
                        name: relatedResource.name,
                        attributes: { ...relatedResource.attributes },
                        is_deleted: relatedResource.is_deleted,
                        is_active: relatedResource.is_active,
                        created_at: relatedResource.created_at,
                        updated_at: relatedResource.updated_at,
                        // Include relationship-specific attributes if needed
                        relationship_attributes: {
                            created_at: relationship.created_at,
                            updated_at: relationship.updated_at
                        }
                    });
                }
            });
        }

        return {
            id: resource.id,
            attributes: { ...resource.attributes },
            // Explicitly exclude relationships to avoid circular references
            relationships: connection ? formattedRelationships : {},
            // incoming_relationships: undefined,
            // outgoing_relationships: undefined,
            created_at: resource.created_at,
        };
    };


    async createTemplate(templateData) {
        const transaction = await db.sequelize.transaction();

        try {
            // Validate action type
            const validActions = ['create', 'read', 'update', 'delete', 'conditional'];
            if (!validActions.includes(templateData.action_type)) {
                throw new Error(`Invalid action type. Must be one of: ${validActions.join(', ')}`);
            }

            // Create the template
            const template = await db.ActionTemplate.create({
                name: templateData.name,
                description: templateData.description,
                action_type: templateData.action_type,
                target_resource_type_id: templateData.target_resource_type_id,
                conditions: templateData.conditions,
                field_mappings: templateData.field_mappings,
                aggregations: templateData.aggregations,
                pre_hooks: templateData.pre_hooks,
                post_hooks: templateData.post_hooks,
                response_map: templateData.response_map
            }, { transaction });

            // Create parameters if provided
            if (templateData.parameters && templateData.parameters.length > 0) {
                await db.ActionTemplateParameter.bulkCreate(
                    templateData.parameters.map(param => ({
                        ...param,
                        template_id: template.id
                    })),
                    { transaction }
                );
            }

            await transaction.commit();
            return await this.getTemplateById(template.id);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * Executes an action template
     */
    async executeTemplate(templateName, parameters = {}, filter) {
        const templateData = await db.ActionTemplate.findOne({
            where: { name: templateName },
            include: [
                {
                    model: db.ActionTemplateParameter,
                    as: 'parameters'
                },
                {
                    model: db.ResourceTag,
                    as: 'target_resource_type'
                }
            ]
        });

        if (!templateData) {
            throw new Error(`Template "${templateName}" not found`);
        }

        let template = templateData.get({ plain: true })

        if (filter) {
            template.conditions = filter;
        }


        // Validate parameters
        this.validateParameters(template, parameters);

        // Execute pre-hooks
        await this.executeHooks(template.pre_hooks, parameters);

        // Execute main action
        let result;
        try {
            switch (template.action_type) {
                case 'create':
                    result = await this.handleCreate(template, parameters);
                    break;
                case 'read':
                    result = await this.handleRead(template, parameters);
                    break;
                case 'update':
                    result = await this.handleUpdate(template, parameters);
                    break;
                case 'delete':
                    result = await this.handleDelete(template, parameters);
                    break;
                case 'conditional':
                    result = await this.handleConditional(template, parameters);
                    break;
                default:
                    throw new Error(`Unsupported action type: ${template.action_type}`);
            }

            // Execute post-hooks
            await this.executeHooks(template.post_hooks, { ...parameters, previousResult: result });

            // Format response if mapping defined
            if (template.response_map) {
                result = this.formatResponse(result, template.response_map, parameters);
            }

            // Store reference if requested
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
        } catch (error) {
            throw new Error(`Template execution failed: ${error.message}`);
        }
    }

    /**
     * CRUD Operation Handlers
     */
    async handleCreate(template, parameters = {}) {
        const transaction = await db.sequelize.transaction();

        const data = this.resolveFieldMappings(template.field_mappings, { ...parameters, ...parameters?.attributes });





        const resource = await ResourceApiService.createResource({ name: template.target_resource_type.name, attributes: data.attributes, relationships: parameters.relationships }, transaction)
        /*       const resource = await db.ResourceTag.create({
                  type: 'resource',
                  name: template.target_resource_type.name,
                  resource_parent_id: template.target_resource_type.target_resource_type_id,
                  attributes: { ...data.values }
      
              }); */

        // Create resource values
        // if (data.values) {
        //     const values = Object.entries(data.values).map(([field_name, value]) => ({
        //         resource_tag_id: resource.id,
        //         field_name,
        //         value: value.value,
        //         value_reference: value.reference,
        //         related_resource_id: value.related_resource_id
        //     }));

        //     await db.ResourceValue.bulkCreate(values);
        // }
        await transaction.commit();
        return resource;
    }

    async handleRead(template, parameters) {
        const where = this.buildWhereClause(template.conditions, parameters);



        // Handle aggregations
        if (template.aggregations &&
            (
                (Array.isArray(template.aggregations) && template.aggregations.length > 0) ||
                (typeof template.aggregations === 'object' &&
                    template.aggregations !== null &&
                    !Array.isArray(template.aggregations) &&
                    Object.keys(template.aggregations).length > 0)
            )
        ) {
            return this.handleAggregations(template, where);
        }



        // Get fields to select
        const fields = template.field_mappings
            ? this.resolveFieldMappings({ ...where, ...template.field_mappings }, { ...where, ...parameters })
            : undefined;



        console.log('FIND QUERY CONDITION', template.conditions, where, fields, parameters)
        // Find resources
        let resources = await db.ResourceTag.findAll({
            where: {
                resource_parent_id: template.target_resource_type_id,
                // ...(where['id'] ? { id: where['id'] } : {}),
                // ...(where['created_at'] ? { created_at: where['created_at'] } : {}),
                is_deleted: false,
                ...(fields ? fields : where ? where : {}),

            },
            attributes: ['id', 'type', 'name', 'attributes', 'created_at'],
            /*   include: [
                  {
                      model: db.ResourceValue,
                      as: 'values',
                      ...(fields ? { where: { field_name: fields } } : {}),
                      include: [
                          {
                              model: db.ResourceTag,
                              as: 'related_resource'
                          }
                      ]
                  }
              ] */
        });

        console.log('FIND QUERY', fields, where, parameters)

        return resources.map(a => this.formatResourceResponse(a));

    }

    async handleUpdate(template, parameters) {

        const whereData = this.buildWhereClause(template.conditions, parameters);
        const where = this.resolveFieldMappings(template.field_mappings, whereData);





        console.log(where, whereData, 'update', parameters)

        // Update resource metadata
        if (Object.keys(where).length) {
            let updateIds = await db.ResourceTag.findAll({
                where: {
                    ...whereData,
                    is_deleted: false
                },
                attributes: ['id', 'attributes'],
                raw: true
            })

            for (const doc of updateIds) {
                /*          await db.ResourceValue.upsert({
                             resource_tag_id: where.id, // For single resource updates
                             field_name,
                             value: value.value,
                             value_reference: value.reference,
                             related_resource_id: value.related_resource_id
                         }, {
                             conflictFields: ['resource_tag_id', 'field_name']
                         }); */
                await db.ResourceTag.update({
                    ...doc, ...parameters, attributes: {
                        ...doc.attributes, ...parameters.attributes
                    }
                }, {
                    where: { id: doc.id }
                });
            }



            return { success: true, message: 'Resources updated', count: updateIds.length };

        } else {
            throw new Error(`Please provide id or attributes of resource to be updated`);
        }




        // Update or create values
        /*  if (data.values) {
             for (const [field_name, value] of Object.entries(data.values)) {
                 await db.ResourceValue.upsert({
                     resource_tag_id: where.id, // For single resource updates
                     field_name,
                     value: value.value,
                     value_reference: value.reference,
                     related_resource_id: value.related_resource_id
                 }, {
                     conflictFields: ['resource_tag_id', 'field_name']
                 });
             }
         } */

    }

    async handleDelete(template, parameters) {
        // const where = this.buildWhereClause(template.conditions, parameters);



        const whereData = this.buildWhereClause(template.conditions, parameters);
        const resources = await db.ResourceTag.findAll({
            where: {
                resource_parent_id: template.target_resource_type_id,
                ...whereData,
                is_deleted: false
            },
            raw: true
        })


        if (!resources.length) {
            return {
                success: true,
                message: 'No Resources marked as deleted',
                count: 0
            };
        }

        for (const doc of resources) {
            await db.ResourceTag.update(
                { is_deleted: true },
                {
                    where: {
                        id: doc.id
                    }
                }
            );

        }



        return {
            success: true,
            message: 'Resources marked as deleted',
            count: resources.length
        };
    }

    async handleAggregations(template, where) {
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

    async handleConditional(template, parameters) {
        // Determine which action to take based on parameters
        const action = parameters.action;
        if (!action) {
            throw new Error('Conditional templates require an "action" parameter');
        }

        // Execute the appropriate handler
        switch (action) {
            case 'create':
                return this.handleCreate(template, parameters);
            case 'update':
                return this.handleUpdate(template, parameters);
            case 'delete':
                return this.handleDelete(template, parameters);
            default:
                throw new Error(`Unsupported conditional action: ${action}`);
        }
    }

    /**
     * Helper Methods
     */
    validateParameters(template, parameters) {
        let pars = { ...parameters, ...parameters.attributes };
        const missingParams = template.parameters
            .filter(p => p.required && !(p.name in pars))
            .map(p => p.name);


        if (missingParams.length > 0) {
            throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
        }

        // Additional parameter validation can be added here
    }

    async executeHooks(hooks, parameters) {
        if (!hooks || hooks.length === 0) return;

        for (const hook of hooks) {
            try {
                await this.executeTemplate(hook.template_name, {
                    ...parameters,
                    ...hook.parameters
                });
            } catch (error) {
                if (hook.abort_on_failure) {
                    throw new Error(`Hook ${hook.template_name} failed: ${error.message}`);
                }
                console.error(`Non-critical hook error: ${error.message}`);
            }
        }
    }

    resolveFieldMappings(mappings, parameters) {
        if (!mappings) return {};

        const result = {
            attributes: {}
        };

        for (const [target, source] of Object.entries(mappings)) {
            const resolvedValue = this.resolveValue(source, parameters);
            if (!!resolvedValue) {
                if (target.startsWith('attributes.')) {
                    const fieldName = target.replace('attributes.', '');
                    result.attributes[fieldName] = resolvedValue;
                } else {
                    result[target] = resolvedValue?.value ? resolvedValue?.value : resolvedValue;
                }
            }
        }

        return result;
    }

    resolveValue(value, parameters) {
        if (typeof value === 'string' && parameters) {
            // Handle parameter references
            if (value.startsWith('$param.')) {
                const paramName = value.replace('$param.', '');
                return parameters[paramName];
            }

            // Handle result references
            if (value.startsWith('$result.')) {
                return {
                    reference: value,
                    value: null // Will be resolved when accessed
                };
            }

            // Handle resource references
            if (value.startsWith('$resource.')) {
                const parts = value.replace('$resource.', '').split('.');
                return {
                    related_resource_id: parameters[parts[0]],
                    value: null
                };
            }

            // Handle simple values
            return { value };
        }

        // Handle objects and arrays
        if (typeof value === 'object' && value !== null && parameters) {
            if (Array.isArray(value)) {
                return value.map(item => this.resolveValue(item, parameters));
            }

            const resolved = {};
            for (const [key, val] of Object.entries(value)) {
                resolved[key] = this.resolveValue(val, parameters);
            }
            return resolved;
        }

        // Handle other types (numbers, booleans, etc.)
        return { value };
    }


    buildWhereClause(conditions, parameters = {}) {

        try {

            /*            if (!conditions || typeof conditions !== 'object') {
                           return {};
                       } */

            const operatorMap = {
                '$eq': Op.eq,
                '$ne': Op.ne,
                '$gt': Op.gt,
                '$lt': Op.lt,
                '$gte': Op.gte,
                '$lte': Op.lte,
                '$in': Op.in,
                '$notIn': Op.notIn,
                '$like': Op.like,
                '$iLike': Op.iLike,
                '$notLike': Op.notLike,
                '$between': Op.between,
                '$notBetween': Op.notBetween,
                '$overlap': Op.overlap,
                '$contains': Op.contains,
                '$any': Op.any
            };

            const transform = (obj) => {
                if (obj === undefined || obj === null) {
                    return undefined;
                }

                if (typeof obj !== 'object') {
                    return this.resolveValue(obj, parameters)?.value ?? undefined;
                }

                if (Array.isArray(obj)) {
                    return obj.map(transform).filter(v => v !== undefined);
                }

                const result = {};
                let hasValidProperties = false;

                for (const [key, value] of Object.entries(obj)) {
                    // Handle operator keys

                    if (operatorMap[key]) {
                        const resolvedValue = this.resolveValue(value, parameters);

                        if (resolvedValue?.value !== undefined) {
                            result[operatorMap[key]] = transform(resolvedValue?.value);
                            hasValidProperties = true;
                        } else if (resolvedValue && Array.isArray(resolvedValue)) {
                            result[operatorMap[key]] = transform(resolvedValue.map(a => (a.value || a)));
                            hasValidProperties = true;
                        }
                    }
                    // Handle nested objects
                    else {
                        const transformedValue = transform(value);
                        if (transformedValue !== undefined) {
                            result[key] = transformedValue;
                            hasValidProperties = true;
                        }
                    }
                }


                return hasValidProperties ? result : undefined;
            }

            const where = transform(conditions);


            return where || {};



        } catch (err) {
            console.log(err, 'ERRR WHERE')
            return null
        }
    }

    formatResponse(data, mapDef, parameters) {
        if (typeof mapDef === 'string') {
            return this.resolveValuePath(data, mapDef, parameters);
        }

        if (Array.isArray(mapDef)) {
            return data.map(item =>
                this.formatResponse(item, mapDef[0], parameters)
            );
        }

        if (typeof mapDef === 'object') {
            const result = {};
            for (const [key, mapping] of Object.entries(mapDef)) {
                if (key.startsWith('$')) {
                    return this.handleSpecialOperator(key, mapping, data, parameters);
                } else {
                    result[key] = this.formatResponse(data, mapping, parameters);
                }
            }
            return result;
        }

        return data;
    }

    handleSpecialOperator(operator, config, data, params) {
        switch (operator) {
            case '$filter':
                return data.filter(item =>
                    this.evaluateCondition(item, config.$condition, params)
                );
            case '$map':
                return data.map(item =>
                    this.formatResponse(item, config, params)
                );
            case '$format':
                return this.applyFormatter(
                    this.resolveValuePath(data, config.field),
                    config.type,
                    params
                );
            default:
                return data;
        }
    }

    async checkConfirmation(prompt, conversation = []) {
        const messages = [
            {
                role: 'user',
                content: `
                
                Prompt: "${prompt}"`
            }
        ];

        try {

            const response = await ollamaClient.chat({
                model: 'alayon_confirmation',
                messages,
                format: 'json',
                options: { temperature: 0.2 }
            });


            let resJson = JSON.parse(response.message.content)
            // Save AI response
            const aiMessage = await db.Conversation.create({
                title: 'alayon_confirmation',
                prompt: prompt,
                response: response.message.content,
                metadata: resJson,
                tokens: response.message.tokens || 0,
                rate: 0
            });






            const result = this.parseResponse(response.message.content);
            return this.validateResponse(result);
        } catch (error) {
            console.error('Confirmation check failed:', error);
            return { confirmed: false, confidence: 0, reason: 'Error processing confirmation' };
        }
    }

    validateOperation(actionType, result) {
        let isValid = false;
        const followupQuestions = [];
        const missingFields = [];

        switch (actionType) {
            case 'create':
                isValid = Object.keys(result.data || {}).length > 0;
                if (!isValid) {
                    followupQuestions.push("Please provide the data to create a new record");
                    missingFields.push("data");
                }
                break;

            case 'update':
                const hasUpdates = Object.keys(result.updates || result.data || {}).length > 0;
                const hasConditions = Object.keys(result.whereConditions || {}).length > 0;

                isValid = hasUpdates && hasConditions;

                if (!hasConditions) {
                    followupQuestions.push("Which records should be updated? Please specify conditions");
                    missingFields.push("whereConditions");
                }
                if (!hasUpdates) {
                    followupQuestions.push("What fields should be updated? Please specify changes");
                    missingFields.push("updates");
                }
                break;

            case 'delete':
                isValid = Object.keys(result.whereConditions || {}).length > 0;
                if (!isValid) {
                    followupQuestions.push("Which records should be deleted? Please specify conditions");
                    missingFields.push("whereConditions");
                }
                break;

            case 'read':
                isValid = Object.keys(result.whereConditions || {}).length > 0;
                if (!isValid) {
                    followupQuestions.push("Which records should be retrieved? Please specify conditions");
                    missingFields.push("whereConditions");
                }
                break;

            default:
                followupQuestions.push(`Unsupported operation type: ${actionType}`);
        }

        return {
            isValid,
            followupQuestions: [...followupQuestions, ...(result.followupQuestions || [])],
            missingFields: [...missingFields, ...(result.missingFields || [])]
        };
    }

    parseResponse(content) {
        try {
            return typeof content === 'string' ? JSON.parse(content) : content;
        } catch (e) {
            console.error('Failed to parse confirmation response:', content);
            return { confirmed: false, confidence: 0, reason: 'Invalid response format' };
        }
    }

    validateResponse(response) {
        // Validate the AI response structure
        if (typeof response.confirmed !== 'boolean') {
            return { confirmed: false, confidence: 0, reason: 'Invalid confirmation response' };
        }

        return {
            confirmed: response.confirmed,
            confidence: Math.min(1, Math.max(0, response.confidence || 0)),
            reason: response.reason || (response.confirmed ? 'User confirmed' : 'User denied or unsure')
        };
    }


    async callOllama(prompt, modelName = 'mistral', options) {
        try {


            const response = await ollamaClient.generate({
                model: modelName,
                prompt,
                format: 'json',
                options: {
                    ...options
                },
            });


            let resJson = JSON.parse(response.response)
            // Save AI response
            const aiMessage = await db.Conversation.create({
                title: modelName,
                prompt: prompt,
                response: response.response,
                metadata: resJson,
                tokens: response.prompt_eval_count || 0,
                rate: 0
            });



            return response.response;
        } catch (error) {
            console.error("Ollama API error:", error.message);
            throw new Error("Failed to process request with Ollama.");
        }
    }

    // ... additional helper methods ...
}

export default new ActionTemplateService();