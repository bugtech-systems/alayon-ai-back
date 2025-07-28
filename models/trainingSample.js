export default ({ sequelize }, DataTypes) => {
    const TrainingSample = sequelize.define('TrainingSample', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        input: {
            type: DataTypes.JSONB,
            allowNull: false
        },
        output: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        modelVersion: {
            type: DataTypes.STRING,
            defaultValue: '1.0.0'
        },
        usageCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        accuracyScore: {
            type: DataTypes.FLOAT,
            validate: { min: 0, max: 1 }
        }
    }, {
        tableName: 'training_samples',
        timestamps: false,
        underscored: true
    });


    return TrainingSample;
};