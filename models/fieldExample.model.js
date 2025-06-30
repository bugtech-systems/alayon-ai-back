export default ({ sequelize }, DataTypes) => {
    const FieldExample = sequelize.define('FieldExample', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        field_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'resource_fields',
                key: 'id'
            }
        },
        example_value: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        description: {
            type: DataTypes.STRING(500),
            allowNull: true,
            validate: {
                len: [0, 500]
            }
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        sort_order: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            validate: {
                isInt: true
            }
        }
    }, {
        tableName: 'field_examples',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at', // Recommended to keep updated_at
        paranoid: false,
        indexes: [
            {
                name: 'field_examples_field_id_index',
                fields: ['field_id']
            },
            {
                name: 'field_examples_sort_order_index',
                fields: ['field_id', 'sort_order']
            }
        ],
        defaultScope: {
            order: [['sort_order', 'ASC']]
        },
        scopes: {
            forField(fieldId) {
                return {
                    where: {
                        field_id: fieldId
                    }
                };
            },
            defaultExamples: {
                where: {
                    is_default: true
                }
            },
            sorted: {
                order: [['sort_order', 'ASC']]
            }
        }
    });

    FieldExample.associate = (models) => {
        FieldExample.belongsTo(models.ResourceField, {
            foreignKey: 'field_id',
            as: 'field',
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        });
    };

    // Hooks for business logic
    FieldExample.beforeValidate((example) => {
        if (example.example_value) {
            example.example_value = example.example_value.trim();
        }
    });

    return FieldExample;
};