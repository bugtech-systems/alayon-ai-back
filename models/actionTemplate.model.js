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
            unique: true
        },
        description: {
            type: DataTypes.TEXT
        },
        action_type: {
            type: DataTypes.ENUM('create', 'read', 'update', 'delete'),
            allowNull: false
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
        ai_config: {
            type: DataTypes.JSONB
        },
        is_chat_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
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

    ActionTemplate.associate = function (models) {
        ActionTemplate.belongsTo(models.ResourceTag, {
            foreignKey: 'target_resource_type_id',
            as: 'target_resource_type'
        });
        ActionTemplate.hasMany(models.ActionTemplateParameter, {
            foreignKey: 'template_id',
            as: 'parameters'
        });
    };

    return ActionTemplate;
};