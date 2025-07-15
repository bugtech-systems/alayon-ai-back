export default ({ sequelize }, DataTypes) => {
    const Conversation = sequelize.define('Conversation', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        rate: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: 'New Conversation'
        },
        prompt: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        response: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        tokens: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        sessionId: {
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