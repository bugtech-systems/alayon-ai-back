export default ({ sequelize }, DataTypes) => {
    const Message = sequelize.define('Message', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        role: {
            type: DataTypes.ENUM('system', 'user', 'assistant'),
            allowNull: false
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        tokens: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        confidence_score: {
            type: DataTypes.FLOAT,
            defaultValue: 0.7,
            validate: { min: 0, max: 1 }
        },
        is_training_candidate: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'messages',
        timestamps: false,
        underscored: true,
        indexes: [
            {
                fields: ['role']
            },
            {
                fields: ['created_at']
            }
        ]
    });

    return Message;
};