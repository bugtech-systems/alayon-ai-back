export default ({ sequelize }, DataTypes) => {
    const ResourceTag = sequelize.define('ResourceTag', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        resource_type: {
            type: DataTypes.ENUM('resource', 'config', 'connections', 'tag'),
            allowNull: false,
            defaultValue: 'resource'
        },
        resource_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        attributes: {
            type: DataTypes.JSONB,
            description: "Resource data object"
        },
        resource_parent_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        ai_description: {
            type: DataTypes.TEXT,
            description: "Natural language description for AI"
        },
        ai_example_queries: {
            type: DataTypes.JSONB,
            description: "Example natural language queries"
        }
    }, {
        tableName: 'resource_tags',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                fields: ['resource_type', 'resource_name']
            },
            {
                fields: ['resource_parent_id']
            }
        ]
    });

    // ResourceTag.associate = (models) => {
    //     ResourceTag.belongsTo(models.ResourceTag, {
    //         foreignKey: 'resource_parent_id',
    //         as: 'parent'
    //     });
    // };

    return ResourceTag;
};