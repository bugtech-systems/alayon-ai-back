// scripts/seedAiDescriptions.js
import { db } from '../models/index.js';

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

seedResourceDescriptions();