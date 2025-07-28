export default ({ sequelize }, DataTypes) => {
    const Rating = sequelize.define('Rating', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        accuracy: {
            type: DataTypes.INTEGER,
            validate: { min: 1, max: 5 } // 1-5 scale
        },
        creativity: {
            type: DataTypes.INTEGER,
            validate: { min: 1, max: 5 }
        },
        feedback: { type: DataTypes.TEXT }
    }, {
        tableName: 'ratings',
        timestamps: false,
        underscored: true
    });


    return Rating;
};