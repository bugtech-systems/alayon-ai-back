export default ({ sequelize }, DataTypes) => {
    const Message = sequelize.define('Message', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        tread_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        conversation_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        role: {
            type: DataTypes.ENUM('system', 'user', 'assistant', 'context'),
            allowNull: false
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        content: {
            type: DataTypes.JSONB,
            allowNull: true
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
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
                defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'messages',
        timestamps: false,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        underscored: true,
        indexes: [
            {
                fields: ['role']
            }
        ]
    });

    return Message;
};