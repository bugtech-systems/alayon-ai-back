export default ({ sequelize }, DataTypes) => {
    const Message = sequelize.define('Message', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        role: {
            type: DataTypes.ENUM('user', 'assistant', 'system'),
            allowNull: false
        },
        content: {
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
        rate: {
            type: DataTypes.INTEGER,
            defaultValue: 0
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
                fields: ['conversation_id']
            },
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