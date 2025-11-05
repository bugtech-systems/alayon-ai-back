
import { Ollama } from 'ollama';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import { db } from '../models/index.js';
import { fileURLToPath } from 'url';
import { systemPrompt } from '../helpers/system-prompt.js';
import { validationConfig } from '../helpers/modelConfig.js';



// Initialize Ollama client
const ollama = new Ollama({
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const systemPrompt = fs.readFileSync(path.join(__dirname, '..', 'tuner', 'Alayon_Sequelize'), 'utf8');

let currentModel = 'alayon_sequelize';



// Validate fields against configuration
async function validateFields(resource, fields) {
    const invalidFields = [];
    const validation = await validationConfig()
    for (const field of fields) {
        const cleanField = field.startsWith('attributes.')
            ? field
            : `attributes.${field}`;


        if (!validation.allowedFields[resource]?.includes(cleanField)) {
            invalidFields.push(field);
        }
    }



    return invalidFields;
}

// Validate field values against options
async function validateFieldValues(resource, data) {
    const errors = [];
    const validation = await validationConfig()

    for (const [field, value] of Object.entries(data)) {
        const fullPath = `${resource}.${field}`;
        const options = validation.fieldOptions[fullPath];

        if (options && !options.includes(value)) {
            errors.push(`'${field}' must be one of: ${options.join(', ')}`);
        }
    }

    return errors;
}


// Helper functions
async function resolveResourceIds(conditions) {
    const resolved = {};
    for (const [key, value] of Object.entries(conditions)) {
        if (key.endsWith('_resource_name')) {
            const resourceType = key.replace('_resource_name', '');
            const resource = await db.ResourceTag.findOne({
                where: {
                    resource_name: value,
                    resource_type: resourceType
                }
            });
            if (!resource) throw new Error(`${resourceType} resource not found: ${value}`);
            resolved[`${resourceType}_resource_id`] = resource.id;
        } else {
            resolved[key] = value;
        }
    }
    return resolved;
}

function mapAttributes(conditions) {
    const mapped = {};
    for (const [key, value] of Object.entries(conditions)) {
        if (key.includes('.')) {
            mapped[`attributes.${key}`] = value;
        } else {
            mapped[key] = value;
        }
    }
    return mapped;
}

// New: Create relationship between resources
async function createResourceRelationship(options) {
    const { data: { sourceResource, targetResource }, source_conditions, target_conditions, ...relationshipData } = options;
    // Resolve source resource
    // const sourceResource = await db.ResourceTag.findOne({
    //     where: mapAttributes(source_conditions)
    // });

    console.log(options, 'OPTIONS')
    if (!sourceResource) {
        throw new Error(`Source resource not found: ${JSON.stringify(source_conditions)}`);
    }

    // Resolve target resource
    // const targetResource = await db.ResourceTag.findOne({
    //     where: mapAttributes(target_conditions)
    // });
    if (!targetResource) {
        throw new Error(`Target resource not found: ${JSON.stringify(target_conditions)}`);
    }

    // Create relationship
    return db.ResourceRelationship.create({
        source_resource_id: sourceResource.id,
        target_resource_id: targetResource.id,
        ...relationshipData
    });
}

// Main processing function
export async function processMessage(userInput, conversation) {

    conversation.history.push({
        role: 'user',
        content: userInput,
        timestamp: new Date()
    });



    let promptMessages = [
        { role: 'system', content: await systemPrompt() },
        ...conversation.history.map(msg => ({
            role: msg.role,
            content: msg.content
        }))
    ];




    const response = await ollama.chat({
        model: currentModel,
        messages: promptMessages,
        format: 'json'
    });


    let chat = await db.Conversation.create({
        title: currentModel,
        prompt: userInput,
        response: response.message.content,
        sessionId: conversation.id,
        // metadata: result,
        tokens: response.message.tokens || 0,
        rate: 0
    });

    const result = JSON.parse(response.message.content);


    console.log(response.message.content)
    chat.metadata = result;
    conversation.history.push({
        role: 'assistant',
        content: response.message.content,
        timestamp: new Date(),
        queryType: result.type,
        confirmed: false
    });



    if (result.sequelizeQuery) {
        const { model, options, needsConfirmation, operation } = result.sequelizeQuery;
        if (needsConfirmation) {
            result.needsConfirmation = needsConfirmation;
        }

        if (model == 'ResourceTag') {
            const resource = conversation.resourceName;

            const validation = await validationConfig()

            console.log(validation, resource, 'MODEL SCHEMA')

            // 1. Validate resource
            if (!validation.allowedResources.includes(resource)) {
                return {
                    message: `Resource '${resource}' not allowed. Valid resources: ${validation.allowedResources.join(', ')}`,
                    type: 'error',
                    needsConfirmation: false
                };
            }

            // 2. Validate fields in where/data
            const whereFields = options.where?.attributes ? Object.keys(options.where?.attributes) : [];
            const dataFields = options.data?.attributes ? Object.keys(options.data?.attributes) : [];
            const allFields = [...whereFields, ...dataFields];
            const invalidFields = await validateFields(resource, allFields);

            console.log(allFields, 'ALL FIELDS', options, validation.allowedFields[resource], invalidFields, whereFields, dataFields)

            if (invalidFields.length > 0) {
                return {
                    message: `Invalid fields for ${resource}: ${invalidFields.join(', ')}`,
                    type: 'error',
                    needsConfirmation: false
                };
            }

            // 3. Validate field values
            const valueErrors = await validateFieldValues(resource, options.data || {});

            if (valueErrors.length > 0) {
                return {
                    message: `Validation errors:\n- ${valueErrors.join('\n- ')}`,
                    type: 'error',
                    needsConfirmation: false
                };
            }






            // Process Sequelize queries
            if (result.type != 'create') {

                // Resolve names and attributes
                if (options.where) {
                    options.where = await resolveResourceIds(options.where);
                    // console.log(options.where, 'where opt')

                    options.where = mapAttributes(options.where);
                    // console.log(options.where, 'where att')

                }



                let where = buildWhereClause(options.where, options.data)


                // Get the allowed fields for this resource type
                const fields = validation.allowedFields[resource] || [];

                // Build dynamic attributes array
                const attributes = [
                    'id', // Always include ID
                    'resource_type', // Include type if needed
                    'resource_name',
                    ...fields.map(fieldPath => {
                        const [parentField, ...nestedPath] = fieldPath.split('.');
                        const attributeName = nestedPath.join('_'); // Convert 'attributes.label' to 'label'

                        // PostgreSQL syntax
                        return [
                            db.sequelize.literal(`(${parentField}->>'${nestedPath.join('.')}')::text`),
                            attributeName
                        ];

                        // MySQL alternative:
                        // return [
                        //   sequelize.fn('JSON_UNQUOTE',
                        //     sequelize.fn('JSON_EXTRACT',
                        //       sequelize.col(parentField),
                        //       `$.${nestedPath.join('.')}`
                        //     )
                        //   ),
                        //   attributeName
                        // ];
                    })
                ];





                const records = await db[model].findAll({
                    where: {
                        ...where,
                        is_deleted: false
                    },
                    attributes: attributes,
                    // raw: true
                });

                result.foundRecords = records;
                conversation.results = records;

                result.message = `Provide only what users asks with precise, detailed summary of data context.`;

            } else {
                if (!allFields.length) {
                    return {
                        message: `Creation error:\nProvide Data:- ${validation.allowedFields[resource].join('\n- ')}`,
                        type: 'error',
                        needsConfirmation: false
                    };
                }
            }
        }
        if (result.type == 'create_relationship') {


            // Validate relationship type
            // const allowedTypes = validation.fieldOptions['ResourceRelationship.relationship_type'];
            // if (!allowedTypes.includes(options.relationship_type)) {
            //     return {
            //         message: `Invalid relationship type. Allowed: ${allowedTypes.join(', ')}`,
            //         type: 'error'
            //     };
            // }
            console.log(options, 'RELATE OPTIONS')
            let sourceWhere = buildWhereClause(options.source_conditions, {})
            let targetWhere = buildWhereClause(options.target_conditions, {})






            const sourceResource = await db.ResourceTag.findOne({
                where: {
                    ...sourceWhere,
                    is_deleted: false
                },
                // attributes: attributes,
                raw: true
            });


            if (!sourceResource) {
                return {
                    message: `Source resource not found`,
                    type: 'error',
                    needsConfirmation: false
                };
            }


            const targetResource = await db.ResourceTag.findOne({
                where: {
                    ...targetWhere,
                    is_deleted: false
                },
                // attributes: attributes,
                raw: true
            })



            // Resolve target resource
            // const targetResource = await db.ResourceTag.findOne({
            //     where: mapAttributes(target_conditions)
            // });
            if (!targetResource) {
                return {
                    message: `Target resource not found`,
                    type: 'error',
                    needsConfirmation: false
                };
            }



            console.log(sourceResource, targetResource, 'RECORDS')

            // Store pending relationship creation
            conversation.context = {
                source: sourceResource,
                target: targetResource
            }


            result.foundRecords = [sourceResource, targetResource];
            conversation.results = [sourceResource, targetResource];
            result.sequelizeQuery.options = { ...result.sequelizeQuery.options, data: { sourceResource, targetResource } }
            if (result.needsConfirmation) {
                conversation.pending = { ...result };
                result.message = `Respond with summary of data and ask for Confirmation to proceed with the action. Create ${options.relationship_type} relationship?`;

            }
        }
        // Store pending operations
        if ((['update', 'delete', 'create'].includes(result.type) && result.needsConfirmation)) {
            result.message = `Respond with summary of data and ask for Confirmation to proceed with the action ${result.type || operation}. Found ${!result?.foundRecords?.length ? 0 : result?.foundRecords?.length} records.`;
            conversation.pending = result;
        }

    }







    await chat.save();
    return result;
}

export async function confirmOperation(conversation, confirmation) {
    if (!conversation.pending) throw new Error('No pending operation');
    const { sequelizeQuery, foundRecords } = conversation.pending;

    if (confirmation !== 'yes') {
        conversation.pending = null;
        return 'Operation cancelled';
    }

    const { model, options, operation } = sequelizeQuery;
    // const foundRecords = conversation.results;

    if (!foundRecords?.length && ['update', 'delete'].includes(operation)) {
        return `Operation failed, Found ${foundRecords?.length} record to ${type}.`;
    } else if (operation == 'create' && !options.data) {
        return `No data to be created.`;
    } else if (operation == 'create' && model == 'ResourceRelationship') {
        const result = await createResourceRelationship(sequelizeQuery.options);
        conversation.pending = null;
        return `Relationship created successfully. ID: ${result.id}`;
    }


    // Execute based on operation type
    let result;
    switch (operation) {
        case 'create':

            let { data } = options;
            result = 0;

            console.log(options, 'CREATE OPTIONS', model, {
                type: 'resource',
                name: conversation.resourceName,
                resource_parent_id: conversation.resourceId,
                ...data
            })

            await db.ResourceTag.create({
                resource_type: 'resource',
                resource_name: conversation.resourceName,
                resource_parent_id: conversation.resourceId,
                ...data
            }).then(rs => {
                result++
            });

            break;

        case 'update':
            const ids = foundRecords.map(r => r.id);
            result = 0;
            let updateIds = await db.ResourceTag.findAll({
                where: {
                    id: { [Op.in]: ids },
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
                await db[model].update({
                    ...doc, attributes: {
                        ...doc.attributes, ...options?.data?.attributes
                    }
                }, {
                    where: { id: doc.id }
                }).then(rs => {
                    result++
                });
            }


            break;

        case 'delete':
            const deleteIds = foundRecords.map(r => r.id);
            result = await db[model].destroy({
                where: {
                    id: { [Op.in]: deleteIds }
                }
            });
            break;

        default:
            throw new Error(`Unsupported operation: ${operation}`);
    }

    // Update conversation history
    const lastMessage = conversation.history[conversation.history.length - 1];
    lastMessage.confirmed = true;

    return `Operation successful. Affected ${result} record/s.`;
}

export function switchModel(newModel) {
    currentModel = newModel;
    return currentModel;
}

function resolveValue(value, parameters) {
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


export function buildWhereClause(conditions, parameters = {}) {

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


        };

        const transform = (obj) => {
            if (obj === undefined || obj === null) {
                return undefined;
            }

            if (typeof obj !== 'object') {
                return resolveValue(obj, parameters)?.value ?? undefined;
            }

            if (Array.isArray(obj)) {
                return obj.map(transform).filter(v => v !== undefined);
            }

            const result = {};
            let hasValidProperties = false;

            for (const [key, value] of Object.entries(obj)) {
                // Handle operator keys

                if (operatorMap[key]) {
                    const resolvedValue = resolveValue(value, parameters);

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

export async function generateAIResponse(session, prompt, options = { model: 'mistral' }) {
    try {
        // const conversations = await this.getConversationsById(session.id, true);
        /*      if (!conversations || conversations.length) {
                 throw new Error('Conversation not found');
             } */
        const conversations = [...session.history];




        conversations.push({
            role: 'user',
            content: prompt,
            timestamp: new Date()
        });



        let promptMessages = [
            // { role: 'system', content: await systemPrompt() },
            ...conversations.map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        ];

        const response = await ollama.chat({
            model: options.model,
            messages: promptMessages,
            options: {
                ...options
            },
            format: 'json'
        });




        const result = JSON.parse(response.message.content);



        await db.Conversation.create({
            title: options.model,
            prompt: prompt,
            response: response.message.content,
            sessionId: session.id,
            metadata: result,
            tokens: response.message.tokens || 0,
            rate: 0
        });


        // session.history.push({
        //     role: 'assistant',
        //     content: response.message.content,
        //     timestamp: new Date(),
        // });



        return result;
    } catch (error) {
        console.error('Error generating AI response:', error);
        throw error;
    }
}