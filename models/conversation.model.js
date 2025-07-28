export default ({ sequelize }, DataTypes) => {
    const Conversation = sequelize.define('Conversation', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        context: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        session_id: {
            type: DataTypes.STRING(255),
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'conversations',
        timestamps: false,
        underscored: true,
        indexes: [
            {
                fields: ['created_at']
            },
            {
                fields: ['updated_at']
            }
        ]
    });


    return Conversation;
};