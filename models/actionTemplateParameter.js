export default ({ sequelize }, DataTypes) => {
    const ActionTemplateParameter = sequelize.define('ActionTemplateParameter', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        data_type: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        required: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        default_value: {
            type: DataTypes.TEXT
        }
    }, {
        tableName: 'action_template_parameters',
        indexes: [
            {
                unique: true,
                fields: ['template_id', 'name']
            }
        ]
    });

    return ActionTemplateParameter;
};