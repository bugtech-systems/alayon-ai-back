export default ({ sequelize }, DataTypes) => {
    const ResourceValue = sequelize.define('ResourceValue', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        resource_tag_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        field_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        value: {
            type: DataTypes.TEXT
        },
        related_resource_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        resource_parent_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        value_reference: {
            type: DataTypes.TEXT
        }
    }, {
        tableName: 'resource_values',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['resource_tag_id', 'field_name']
            },
            {
                fields: ['related_resource_id']
            }
        ]
    });

    /*    ResourceValue.associate = (models) => {
           ResourceValue.belongsTo(models.ResourceTag, {
               foreignKey: 'resource_tag_id',
               as: 'resource'
           });
           ResourceValue.belongsTo(models.ResourceTag, {
               foreignKey: 'related_resource_id',
               as: 'related_resource'
           });
       }; */

    return ResourceValue;
};