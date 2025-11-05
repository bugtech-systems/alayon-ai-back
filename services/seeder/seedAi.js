// scripts/seedAiDescriptions.js
import { db, initializeDatabase } from '../../models/index.js';
import { Sequelize, where } from 'sequelize';
import { config, action_templates } from '../../configs/default_resource.js';
import { DEFAULT_MODELS } from '../../configs/default_models.js'
import { getActionTemplates } from '../ActionTemplateService.js';
import { getResourcesByType } from '../ResourceService.js';


async function seedResources() {
    try {
        for (const resourceConfig of config) {
            const transaction = await db.sequelize.transaction();

            try {
                const { resource_name, fields } = resourceConfig;

                // Check if resource already exists (case-insensitive)
                const existingResource = await db.ResourceTag.findOne({
                    where: Sequelize.where(
                        Sequelize.fn('lower', Sequelize.col('resource_name')),
                        Sequelize.fn('lower', resource_name)
                    ),
                    transaction
                });

                if (existingResource) {
                    console.log(`Resource "${resource_name}" already exists, skipping...`);
                    await transaction.rollback();
                    continue;
                }

                // Create the resource
                const resourceType = await db.ResourceTag.create({
                    resource_type: 'config',
                    resource_name: String(resource_name).toLowerCase()
                }, { transaction });

                // Create fields if they exist
                if (fields && fields.length > 0) {
                    await Promise.all(
                        fields.map(field =>
                            db.ResourceField.create({
                                ...field,
                                resource_tag_id: resourceType.id
                            }, { transaction })
                        )
                    );

                    // Reload with fields
                    await resourceType.reload({
                        include: ['fields'],
                        transaction
                    });
                }

                await transaction.commit();
                console.log(`Successfully created resource "${resource_name}" with ${fields.length} fields`);
            } catch (error) {
                // Only rollback if transaction hasn't completed
                if (transaction.finished !== 'commit') {
                    await transaction.rollback();
                }
                console.error(`Error creating resource "${resourceConfig.resource_name}":`, error.message);
            }
        }

        console.log('Resource seeding completed');
    } catch (error) {
        console.error('Error during resource seeding:', error);
    }
}

async function seedAiPreset() {
    try {











        for (let aiConfig of DEFAULT_MODELS) {
            const transaction = await db.sequelize.transaction();

            try {
                let { name, parameters, options, model_name, ...moreData } = aiConfig;

                console.log(name, 'MOD')

                if (name == 'action_selector') {
                    let actionTemplates = await getActionTemplates();
                    const resource_names = await getResourcesByType();
                    const allowedTemplates = actionTemplates.map(t => ({
                        name: t.name,
                        description: t.description,
                        // samples: t.samples.slice(0, 3) // Limit to 3 samples
                    }));
                    const allowed_resource_names = resource_names.map(a => a.resource_name)

                    options = {
                        ...options,
                        action_templates: allowedTemplates,
                        resource_name: allowed_resource_names
                    }
                }

                if (name == 'template_engine') {
                    const resource_names = await getResourcesByType();
                    const allowed_resource_names = resource_names.map(a => a.resource_name)

                    options = {
                        ...options,
                        // action_templates: allowedTemplates,
                        resource_name: allowed_resource_names
                    }
                }







                // Check if resource already exists (case-insensitive)
                const existingResource = await db.AiPreset.findOne({
                    where: Sequelize.where(
                        Sequelize.fn('lower', Sequelize.col('model_name')),
                        Sequelize.fn('lower', model_name)
                    ),
                    transaction
                });

                if (existingResource) {
                    console.log(`Ai Preset "${name}" already exists, skipping...`);
                    await db.AiPreset.update({ ...moreData, options }, { where: { id: existingResource.id } })
                    // await transaction.rollback();
                    await transaction.commit();
                    continue;
                }

                console.log(aiConfig, 'confff')

                // Create the resource
                await db.AiPreset.create({
                    ...aiConfig,
                    name: aiConfig.name,
                    base_model: aiConfig.base_model,
                    parameters,
                    options,
                    system_instruction: aiConfig.system_instruction
                }, { transaction });


                await transaction.commit();
                console.log(`Successfully created ai preset "${name}".`);
            } catch (error) {
                // Only rollback if transaction hasn't completed
                if (transaction.finished !== 'commit') {
                    await transaction.rollback();
                }
                console.error(`Error creating resource "${aiConfig.name}":`, error.message);
            }
        }

        console.log('Ai Preset seeding completed');
    } catch (error) {
        console.error('Error during resource seeding:', error);
    }
}

async function seedActionTemplates() {
    try {
        for (const template of action_templates) {
            const transaction = await db.sequelize.transaction();

            try {
                const { name, parameters, ...moreData } = template;

                // Check if resource already exists (case-insensitive)
                const existingResource = await db.ActionTemplate.findOne({
                    where: Sequelize.where(
                        Sequelize.fn('lower', Sequelize.col('name')),
                        Sequelize.fn('lower', name)
                    ),
                    transaction
                });

                if (existingResource) {
                    console.log(`Resource "${name}" already exists, skipping...`);

                    await transaction.rollback();
                    continue;
                }

                // Create the resource
                const resourceType = await db.ActionTemplate.create({
                    name,
                    parameters,
                    ...moreData
                }, { transaction });

                // Create fields if they exist
                // if (fields && fields.length > 0) {
                //     await Promise.all(
                //         fields.map(field =>
                //             db.ResourceField.create({
                //                 ...field,
                //                 resource_tag_id: resourceType.id
                //             }, { transaction })
                //         )
                //     );

                //     // Reload with fields
                //     await resourceType.reload({
                //         include: ['fields'],
                //         transaction
                //     });
                // }
                console.log(resourceType)
                await transaction.commit();
                console.log(`Successfully created resource "${name}" with ${parameters.length} fields`);
            } catch (error) {
                // Only rollback if transaction hasn't completed
                if (transaction.finished !== 'commit') {
                    await transaction.rollback();
                }
                console.error(`Error creating resource "${template.name}":`, error.message);
            }
        }

        console.log('Resource seeding completed');
    } catch (error) {
        console.error('Error during resource seeding:', error);
    }
}

async function seedCRUDActionTemplates() {
    const transaction = await db.sequelize.transaction();
    try {
        const resources = await db.ResourceTag.findAll({
            where: {
                resource_type: 'config',
                // resource_name: {
                //     [Sequelize.Op.notIn]: [
                //         'tasks_priority',
                //         'user_status',
                //         'tasks_label',
                //         'tasks_status',
                //         'roles'
                //     ]
                // }
            },
            include: [{
                model: db.ResourceField,
                as: 'fields',
                required: false
            }],
            transaction
        });


        if (!resources.length) return;

        for (const resource of resources) {
            let baseParameters = [];



            // Create base parameters from resource fields
            baseParameters = resource.fields.map(field => ({
                name: field.field_name,
                data_type: field.data_type,
                required: false,
                default_value: null,
                description: field.description || `${field.data_type} field`
            }));

            baseParameters.push({
                name: "id",
                data_type: 'number',
                required: false,
                default_value: null,
            })

            // CRUD Templates to create
            const crudTemplates = [
                {
                    name: `create_${resource.resource_name}`,
                    description: `Create a new ${resource.resource_name} record`,
                    action_type: 'create',
                    target_resource_type_id: resource.id,
                    field_mappings: resource.fields.reduce((acc, field) => {
                        acc[`attributes.${field.field_name}`] = `$param.${field.field_name}`;
                        return acc;
                    }, {}),
                    parameters: baseParameters.map(p => ({ ...p, required: false })) // All fields required for create
                },
                {
                    name: `read_${resource.resource_name}`,
                    description: `Query ${resource.resource_name} records with filters`,
                    action_type: 'read',
                    target_resource_type_id: resource.id,
                    conditions: resource.fields.reduce((acc, field) => {
                        acc[field.field_name] = `$param.${field.field_name}`;
                        return acc;
                    }, {}),
                    parameters: baseParameters
                },
                {
                    name: `update_${resource.resource_name}`,
                    description: `Update existing ${resource.resource_name} records`,
                    action_type: 'update',
                    target_resource_type_id: resource.id,
                    conditions: {
                        id: '$param.id' // Require ID for update
                    },
                    field_mappings: resource.fields.reduce((acc, field) => {
                        if (field.field_name !== 'id') {
                            acc[`attributes.${field.field_name}`] = `$param.${field.field_name}`;
                        }
                        return acc;
                    }, {}),
                    parameters: [
                        {
                            name: 'id',
                            data_type: 'integer',
                            required: false,
                            description: 'ID of the record to update'
                        },
                        ...baseParameters.filter(p => p.name !== 'id')
                    ]
                },
                {
                    name: `delete_${resource.resource_name}`,
                    description: `Delete ${resource.resource_name} records`,
                    action_type: 'delete',
                    target_resource_type_id: resource.id,
                    conditions: {
                        id: '$param.id'
                    },
                    parameters: [
                        {
                            name: 'id',
                            data_type: 'integer',
                            required: false,
                            description: 'ID of the record to delete'
                        }
                    ]
                },
                {
                    name: `count_${resource.resource_name}`,
                    description: `Count ${resource.resource_name} records with optional filters`,
                    action_type: 'read',
                    target_resource_type_id: resource.id,
                    conditions: resource.fields.reduce((acc, field) => {
                        acc[field.field_name] = `$param.${field.field_name}`;
                        return acc;
                    }, {}),
                    aggregations: {
                        count: '*'
                    },
                    parameters: baseParameters
                }
            ];

            // Create each template with its parameters
            for (const templateData of crudTemplates) {
                const { parameters, ...template } = templateData;

                const createdTemplate = await db.ActionTemplate.create(template, { transaction });

                if (parameters && parameters.length) {
                    await db.ActionTemplateParameter.bulkCreate(
                        parameters.map(param => ({
                            ...param,
                            template_id: createdTemplate.id
                        })),
                        { transaction }
                    );
                }
            }
        }

        await transaction.commit();
        console.log(`Successfully created CRUD templates for ${resources.length} resources`);
    } catch (error) {
        await transaction.rollback();
        console.error('Error seeding CRUD action templates:', error);
        throw error;
    }
}




const syncDatabase = async () => {
    let initializedDb;
    try {
        initializedDb = await initializeDatabase();
        console.log('Database initialized successfully');
        await seedResources();
        await seedActionTemplates()
        await seedAiPreset()
        // await seedCRUDActionTemplates();
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1); // Exit if database fails to initialize
    }
};

syncDatabase()
