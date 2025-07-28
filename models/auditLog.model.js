export default ({ sequelize }, DataTypes) => {
    const AuditLog = sequelize.define('AuditLog', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        action_type: DataTypes.STRING,
        status: {
            type: DataTypes.ENUM(
                'PENDING',
                'RUNNING',
                'COMPLETED',
                'FAILED',
                'CANCELLED'
            ),
            defaultValue: 'PENDING'
        },
        executed_at: DataTypes.DATE,
        completed_at: DataTypes.DATE,
        initiator: DataTypes.STRING,
        target_entity: DataTypes.STRING,
        target_id: DataTypes.STRING,
        execution_id: DataTypes.STRING, // for composite actions
        request_data: DataTypes.JSONB,
        response_data: DataTypes.JSONB,
        context: DataTypes.JSONB, // snapshot of execution context
        error_details: DataTypes.TEXT
    }, {
        tableName: 'audit_logs',
        timestamps: true,
        indexes: [
            { fields: ['action_template_id'] },
            { fields: ['status'] },
            { fields: ['executed_at'] }
        ]
    });


    return AuditLog;
};