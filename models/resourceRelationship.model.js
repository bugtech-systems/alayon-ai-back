import { Model } from 'sequelize';

export default ({ sequelize, Op }, DataTypes) => {

    class ResourceRelationship extends Model {
        isCurrentlyActive() {
            const now = new Date();
            return this.isActive &&
                (!this.start_at || this.start_at <= now) &&
                (!this.end_at || this.end_at >= now);
        }
    }

    ResourceRelationship.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        source_resource_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'resource_tags',
                key: 'id'
            }
        },
        target_resource_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'resource_tags',
                key: 'id'
            }
        },
        relationship_type: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        start_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null,
            validate: {
                isDate: true
            }
        },
        end_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null,
            validate: {
                isDate: true,
                endDateAfterStartDate(value) {
                    if (value && this.start_at && value < this.start_at) {
                        throw new Error('end_at must be after start_at');
                    }
                }
            }
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            validate: {
                isBoolean: true
            }
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'ResourceRelationship',
        tableName: 'resource_relationships',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['source_resource_id', 'target_resource_id', 'relationship_type'],
                where: {
                    isActive: true
                },
                name: 'unique_active_relationship'
            },
            {
                fields: ['source_resource_id'],
                name: 'idx_source_resource'
            },
            {
                fields: ['target_resource_id'],
                name: 'idx_target_resource'
            },
            {
                fields: ['relationship_type'],
                name: 'idx_relationship_type'
            },
            {
                fields: ['isActive'],
                name: 'idx_is_active'
            },
            {
                fields: ['start_at'],
                name: 'idx_start_at'
            },
            {
                fields: ['end_at'],
                name: 'idx_end_at'
            }
        ],
        scopes: {
            active: {
                where: { isActive: true }
            },
            inactive: {
                where: { isActive: false }
            },
            current: {
                where: {
                    isActive: true,
                    [Op.or]: [
                        {
                            start_at: null,
                            end_at: null
                        },
                        {
                            start_at: { [Op.lte]: sequelize.fn('NOW') },
                            end_at: {
                                [Op.or]: [
                                    { [Op.gte]: sequelize.fn('NOW') },
                                    { [Op.is]: null }
                                ]
                            }
                        }
                    ]
                }
            },
            betweenResources(sourceId, targetId) {
                return {
                    where: {
                        [Op.or]: [
                            {
                                source_resource_id: sourceId,
                                target_resource_id: targetId
                            },
                            {
                                source_resource_id: targetId,
                                target_resource_id: sourceId
                            }
                        ]
                    }
                };
            },
            ofType(type) {
                return {
                    where: { relationship_type: type }
                };
            }
        },
        hooks: {
            beforeSave: (relationship) => {
                if (relationship.start_at && relationship.end_at && relationship.end_at < relationship.start_at) {
                    throw new Error('end_at cannot be before start_at');
                }
            }
        }
    });

    ResourceRelationship.associate = (models) => {
        ResourceRelationship.belongsTo(models.ResourceTag, {
            foreignKey: 'source_resource_id',
            as: 'source_resource',
            onDelete: 'CASCADE'
        });

        ResourceRelationship.belongsTo(models.ResourceTag, {
            foreignKey: 'target_resource_id',
            as: 'target_resource',
            onDelete: 'CASCADE'
        });
    };

    return ResourceRelationship;
};