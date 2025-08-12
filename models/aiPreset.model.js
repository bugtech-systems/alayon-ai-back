export default ({ sequelize }, DataTypes) => {
    const AiPreset = sequelize.define('AiPreset', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                len: [3, 50]
            }
        },
        model_name: {
            type: DataTypes.STRING,
        },
        base_model: {
            type: DataTypes.STRING,
            comment: 'Original model this preset was derived from'
        },
        version: {
            type: DataTypes.STRING,
            defaultValue: '1.0.0',
            validate: {
                isSemVer: true
            }
        },
        // temperature: {
        //     type: DataTypes.FLOAT,
        //     allowNull: false,
        //     defaultValue: 0.7,
        //     validate: {
        //         min: 0,
        //         max: 2
        //     }
        // },
        system_instruction: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        prompt_instruction: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        system_prompt: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        pre_hooks: {
            type: DataTypes.JSONB
        },
        post_hooks: {
            type: DataTypes.JSONB
        },
        metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        is_trainable: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        accuracy_threshold: {
            type: DataTypes.FLOAT,
            defaultValue: 0.5,
            validate: {
                min: 0.5,
                max: 1
            }
        },
        last_trained_at: {
            type: DataTypes.DATE
        },
        context_window: {
            type: DataTypes.INTEGER,
            comment: 'Token limit for context retention'
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        output_schema: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        options: {
            type: DataTypes.JSONB,
            defaultValue: {

            }
        },
        parameters: {
            type: DataTypes.JSONB,
            defaultValue: {
                temperature: 0.3,
                num_ctx: 4096,
                top_p: 40
            }
        },
        anti_hallucination_rules: {
            type: DataTypes.JSONB,
            defaultValue: ["If unsure, respond with 'I don't know'"]
        },
        min_fine_tune_confidence: {
            type: DataTypes.FLOAT,
            defaultValue: 0.85
        }
    }, {
        tableName: 'ai_presets',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['name']
            },
            {
                fields: ['is_trainable']
            },
            {
                fields: ['accuracy_threshold']
            }
        ]
    });


    return AiPreset;
};