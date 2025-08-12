export default ({ sequelize }, DataTypes) => {
    const ActionTrigger = sequelize.define('ActionTrigger', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        trigger_type: {
            type: DataTypes.ENUM(
                'IMMEDIATE',
                'SCHEDULED',
                'RECURRING',
                'COUNTDOWN'
            ),
            allowNull: false,
            defaultValue: "IMMEDIATE"
        },
        tool_type: {
            type: DataTypes.ENUM(
                'SMS',
                'EMAIL',
                'API_CALL',
                'AI_ACTION',
                'DB_QUERY',
                'SCRIPT',
                'COMPOSITE',
                'SPEAK'
            ),
            allowNull: true,
            defaultValue: "DB_QUERY"
        },
        trigger_config: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        parameters: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        next_execution: DataTypes.DATE,
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'action_triggers',
        timestamps: true
    });

    ActionTrigger.associate = models => {
        ActionTrigger.belongsTo(models.ActionTemplate, {
            foreignKey: 'template_id'
        });
    };

    return ActionTrigger;
};