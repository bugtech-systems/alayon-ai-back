export default ({ sequelize }, DataTypes) => {
    const ResourceField = sequelize.define('ResourceField', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        position: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0
        },
        resource_tag_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        related_resource_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        field_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        data_type: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT
        },
        label: {
            type: DataTypes.TEXT
        },
        options_resource_type: {
            type: DataTypes.STRING(255)
        },
        validation: {
            type: DataTypes.TEXT
        },
        is_required: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_column: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        has_filter: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_hidden: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_searchable: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_sortable: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_unique: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        resource_parent_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
    }, {
        tableName: 'resource_fields',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['resource_tag_id', 'field_name'],
                name: 'resource_fields_unique_name_per_resource'
            },
            {
                fields: ['resource_tag_id'],
                name: 'resource_fields_resource_tag_index'
            }
        ]
    });

    ResourceField.associate = (models) => {
        ResourceField.belongsTo(models.ResourceTag, {
            foreignKey: 'resource_tag_id',
            as: 'resourceTag',
            onDelete: 'CASCADE'
        });
    };

    return ResourceField;
};