export default ({ sequelize }, DataTypes) => {
    const Label = sequelize.define('Label', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        description: {
            type: DataTypes.TEXT
        },
        color_code: {
            type: DataTypes.STRING,
            defaultValue: '#4F46E5'
        }
    }, {
        tableName: 'labels',
        timestamps: false,
        underscored: true
    });


    return Label;
};