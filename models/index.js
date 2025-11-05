import { Sequelize, Op } from 'sequelize';
import * as dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: false,
        define: {
            operatorsAliases: Sequelize.Op
        },
         dialectOptions: {
                    ssl: { require: true, rejectUnauthorized: false }
        }
    }
);

const db = {
    Sequelize,
    Op,
    sequelize,
    models: {}
};

// Model imports with error handling
const modelInitializers = [
    { name: 'ResourceTag', init: (await import('./resourceTag.model.js')).default },
    { name: 'ResourceField', init: (await import('./resourceField.model.js')).default },
    { name: 'ResourceRelationship', init: (await import('./resourceRelationship.model.js')).default },
    { name: 'ActionTemplate', init: (await import('./actionTemplate.model.js')).default },
    // { name: 'TemplateExecutionResult', init: (await import('./templateExecutionResult.model.js')).default },
    { name: 'Conversation', init: (await import('./conversation.model.js')).default },
    { name: 'ActionTrigger', init: (await import('./actionTrigger.model.js')).default },
    { name: 'AuditLog', init: (await import('./auditLog.model.js')).default },
    { name: 'Message', init: (await import('./message.model.js')).default },
    // { name: 'Rating', init: (await import('./rating.model.js')).default },
    // { name: 'Label', init: (await import('./label.model.js')).default },
    // { name: 'TrainingSample', init: (await import('./trainingSample.js')).default },
    // { name: 'EmbeddingCache', init: (await import('./embeddingCache.model.js')).default },
    { name: 'AiPreset', init: (await import('./aiPreset.model.js')).default }


];

// Initialize models
for (const { name, init } of modelInitializers) {
    try {
        db.models[name] = init(db, Sequelize.DataTypes);
        db[name] = db.models[name]; // Backward compatibility
    } catch (error) {
        console.error(`Failed to initialize ${name} model:`, error);
        process.exit(1);
    }
}

// Define associations with proper cascade rules
function defineAssociations() {
    // ResourceTag associations
    db.ResourceTag.belongsTo(db.ResourceTag, {
        foreignKey: 'resource_parent_id',
        as: 'parent'
    });

    db.ResourceTag.belongsTo(db.ResourceTag, {
        foreignKey: 'tenant_id',
        as: 'tenant'
    });

    db.ResourceTag.hasMany(db.ResourceField, {
        foreignKey: 'resource_tag_id',
        as: 'fields',
        onDelete: 'CASCADE'
    });



    db.ResourceField.belongsTo(db.ResourceTag, {
        foreignKey: 'resource_tag_id',
        as: 'resourceTag'
    });

    // ResourceField associations
    // db.ResourceField.hasMany(db.FieldExample, {
    //     foreignKey: 'field_id',
    //     as: 'examples',
    //     onDelete: 'CASCADE'
    // });

    db.ResourceField.belongsTo(db.ResourceTag, {
        foreignKey: 'resource_parent_id',
        as: 'parent'
    });

    // db.FieldExample.belongsTo(db.ResourceField, {
    //     foreignKey: 'field_id',
    //     as: 'field'
    // });


    // db.ResourceValue.belongsTo(db.ResourceTag, {
    //     foreignKey: 'related_resource_id',
    //     as: 'related_resource'
    // });

    // ResourceRelationship associations
    db.ResourceTag.hasMany(db.ResourceRelationship, {
        foreignKey: 'source_resource_id',
        as: 'outgoing_relationships',
        onDelete: 'CASCADE'
    });

    db.ResourceTag.hasMany(db.ResourceRelationship, {
        foreignKey: 'target_resource_id',
        as: 'incoming_relationships',
        onDelete: 'CASCADE'
    });

    db.ResourceRelationship.belongsTo(db.ResourceTag, {
        foreignKey: 'source_resource_id',
        as: 'source_resource'
    });

    db.ResourceRelationship.belongsTo(db.ResourceTag, {
        foreignKey: 'target_resource_id',
        as: 'target_resource'
    });


    db.ActionTemplate.belongsTo(db.ResourceTag, {
        foreignKey: 'tenant_id',
        as: 'tenant'
    });

    db.Conversation.belongsTo(db.ResourceTag, {
        foreignKey: 'tenant_id',
        as: 'tenant'
    });

    db.Message.belongsTo(db.ResourceTag, {
        foreignKey: 'tenant_id',
        as: 'tenant'
    });

    db.AiPreset.belongsTo(db.ResourceTag, {
        foreignKey: 'tenant_id',
        as: 'tenant'
    });


    db.ResourceRelationship.belongsTo(db.ResourceTag, {
        foreignKey: 'tenant_id',
        as: 'tenant'
    });

    db.ResourceTag.hasMany(db.ActionTemplate, {
        foreignKey: 'target_resource_type_id',
        as: 'action_templates',
        // onDelete: 'CASCADE'
    });


    db.AiPreset.hasMany(db.Conversation, {
        foreignKey: 'ai_preset_id',
        as: 'conversation_ai'
    });

    db.Conversation.belongsTo(db.AiPreset, {
        foreignKey: 'ai_preset_id',
        as: 'conversation_ai'
    });

    db.AiPreset.hasMany(db.Message, {
        foreignKey: 'ai_preset_id',
        as: 'message_ai'
    });

    db.Message.belongsTo(db.AiPreset, {
        foreignKey: 'ai_preset_id',
        as: 'message_ai'
    });

    db.ActionTemplate.belongsTo(db.AiPreset, {
        foreignKey: 'ai_preset_id',
        as: 'template_ai'
    });
    // Define relationships


    // db.ActionTemplate.hasMany(db.ActionTemplateParameter, {
    //     foreignKey: 'template_id',
    //     as: 'parameters',
    //     onDelete: 'CASCADE'
    // });

    // ActionTemplateParameter associations
    // db.ActionTemplateParameter.belongsTo(db.ActionTemplate, {
    //     foreignKey: 'template_id',
    //     as: 'template'
    // });


   /*  db.TemplateExecutionResult.belongsTo(db.ActionTemplate, {
        foreignKey: 'template_id'
    }); */


    db.ActionTemplate.hasMany(db.ActionTrigger, { foreignKey: 'action_template_id' });
    db.ActionTrigger.belongsTo(db.ActionTemplate, { foreignKey: 'action_template_id' });

    db.ActionTemplate.hasMany(db.AuditLog, { foreignKey: 'action_template_id' });
    db.AuditLog.belongsTo(db.ActionTemplate, { foreignKey: 'action_template_id' });

    db.ActionTrigger.hasMany(db.AuditLog, { foreignKey: 'action_trigger_id' });
    db.AuditLog.belongsTo(db.ActionTrigger, { foreignKey: 'action_trigger_id' });



    // // Define associations
    // db.Conversation.hasMany(db.Message, { foreignKey: 'conversation_id' });
    // db.Message.belongsTo(db.Conversation, { foreignKey: 'conversation_id' });






}

// Test and initialize database
async function initializeDatabase() {
    try {
        await sequelize.authenticate();
        console.log('Database connection established successfully');

        defineAssociations();

        if (process.env.NODE_ENV === 'development') {
            await sequelize.sync({
                // alter: true,
                // force: true
            });  
            console.log('Database synchronized with alter');
        }

        return db;
    } catch (error) {
        console.error('Database initialization failed:', error);
        process.exit(1);
    }
}

// Export both the db object and initialization function
export { db, initializeDatabase };