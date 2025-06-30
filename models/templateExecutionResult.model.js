export default ({ sequelize }, DataTypes) => {
    const TemplateExecutionResult = sequelize.define('TemplateExecutionResult', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        execution_id: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true
        },
        results: {
            type: DataTypes.JSONB,
            allowNull: false
        },
        expires_at: {
            type: DataTypes.DATE
        }
    }, {
        tableName: 'template_execution_results',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false
    });

    // TemplateExecutionResult.associate = function (models) {
    //     TemplateExecutionResult.belongsTo(models.ActionTemplate, {
    //         foreignKey: 'template_id'
    //     });
    // };

    return TemplateExecutionResult;
};