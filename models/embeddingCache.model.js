export default ({ sequelize }, DataTypes) => {
    const EmbeddingCache = sequelize.define('EmbeddingCache ', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        cacheKey: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true
        },
        embedding: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        originalText: {
            type: DataTypes.STRING(500)
        },
        domainLabels: {
            type: DataTypes.STRING(200)
        }
    }, {
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['cache_key'] },
            { fields: ['domain_labels'] }
        ]
    });


    return EmbeddingCache;
};