// scripts/seedAiDescriptions.js
import { db, initializeDatabase } from '../models/index.js';
import { Sequelize } from 'sequelize';




async function seedResourceDescriptions() {
    const resources = await db.ResourceTag.findAll({ where: { type: 'config' } });

    for (const resource of resources) {
        const fields = await db.ResourceField.findAll({
            where: { resource_tag_id: resource.id }
        });

        const fieldDescriptions = fields.map(f =>
            `${f.field_name}: ${f.description || f.data_type + ' field'}`
        ).join(', ');

        await resource.update({
            ai_description: `A ${resource.name} resource with fields: ${fieldDescriptions}`,
            ai_example_queries: [
                `Show me all ${resource.name} records`,
                `How many ${resource.name} are there?`,
                `List ${resource.name} created last week`,
                `Find ${resource.name} with specific criteria`
            ]
        });
    }

    console.log('AI descriptions updated for all resources');
}

async function seedCRUDActionTemplates() {
    const transaction = await db.sequelize.transaction();
    try {
        const resources = await db.ResourceTag.findAll({
            where: {
                type: 'config',
                name: {
                    [Sequelize.Op.notIn]: [
                        'tasks_priority',
                        'user_status',
                        'tasks_label',
                        'tasks_status',
                        'roles'
                    ]
                }
            },
            include: [{
                model: db.ResourceField,
                as: 'fields',
                required: false
            }],
            transaction
        });




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
                    name: `create_${resource.name}`,
                    description: `Create a new ${resource.name} record`,
                    action_type: 'create',
                    target_resource_type_id: resource.id,
                    field_mappings: resource.fields.reduce((acc, field) => {
                        acc[`attributes.${field.field_name}`] = `$param.${field.field_name}`;
                        return acc;
                    }, {}),
                    parameters: baseParameters.map(p => ({ ...p, required: false })) // All fields required for create
                },
                {
                    name: `read_${resource.name}`,
                    description: `Query ${resource.name} records with filters`,
                    action_type: 'read',
                    target_resource_type_id: resource.id,
                    conditions: resource.fields.reduce((acc, field) => {
                        acc[field.field_name] = `$param.${field.field_name}`;
                        return acc;
                    }, {}),
                    parameters: baseParameters
                },
                {
                    name: `update_${resource.name}`,
                    description: `Update existing ${resource.name} records`,
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
                    name: `delete_${resource.name}`,
                    description: `Delete ${resource.name} records`,
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
                    name: `count_${resource.name}`,
                    description: `Count ${resource.name} records with optional filters`,
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
        seedResourceDescriptions();

        seedCRUDActionTemplates();
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1); // Exit if database fails to initialize
    }
};

syncDatabase()
