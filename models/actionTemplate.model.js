export default ({ sequelize }, DataTypes) => {
    const ActionTemplate = sequelize.define('ActionTemplate', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: false
        },
        description: {
            type: DataTypes.TEXT
        },
        output_as: {
            type: DataTypes.STRING(255),
        },
        context_as: {
            type: DataTypes.STRING(255),
        },
        tool_type: {
            type: DataTypes.ENUM(
                'SMS',
                'EMAIL',
                'API_CALL',
                'AI_ACTION',
                'DB_OPERATION',
                'SCRIPT',
                'COMPOSITE',
                'SPEAK'
            ),
            allowNull: true,
            defaultValue: "DB_OPERATION"
        },
        config: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        output_template: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },        
        context_template: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        resource_type: {
            type: DataTypes.ENUM('config', 'resource', 'connection', 'execution'),
            allowNull: false,
            defaultValue: 'resource'
        },
        conditions: {
            type: DataTypes.JSONB
        },
        field_mappings: {
            type: DataTypes.JSONB
        },
        aggregations: {
            type: DataTypes.JSONB
        },
        pre_hooks: {
            type: DataTypes.JSONB
        },
        post_hooks: {
            type: DataTypes.JSONB
        },
        success_hooks: {
            type: DataTypes.JSONB
        },
        error_hooks: {
            type: DataTypes.JSONB
        },
        parameters: {
            type: DataTypes.JSONB
        },
        is_chat_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        is_sms_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        ai_example_queries: {
            type: DataTypes.JSONB,
            description: "Example natural language queries"
        }
    }, {
        tableName: 'action_templates',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    // ActionTemplate.associate = function (models) {
    //     ActionTemplate.belongsTo(models.ResourceTag, {
    //         foreignKey: 'target_resource_type_id',
    //         as: 'target_resource_type'
    //     });
    //     ActionTemplate.hasMany(models.ActionTemplateParameter, {
    //         foreignKey: 'template_id',
    //         as: 'parameters'
    //     });
    // };

    return ActionTemplate;
};