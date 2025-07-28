import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../../models/index.js';

export class ModelDeployer {
    static async generateBaseModelfile(model) {
        return `
FROM ${model.base_model}
SYSTEM """
${model.system_instruction}

## OUTPUT CONSTRAINTS:
- Output ONLY JSON
- Use this schema: ${JSON.stringify(model.output_schema)}
- Select values ONLY from: ${JSON.stringify(model.options)}
- ${model.anti_hallucination_rules}
"""
PARAMETER temperature ${model.parameters.temperature}
PARAMETER num_ctx ${model.parameters.num_ctx}
    `.trim();
    }

    static async deployModel(modelId) {
        const model = await db.AiPreset.findByPk(modelId);
        if (!model) throw new Error('Model not found');

        const modelfile = await this.generateBaseModelfile(model);
        return this.deployFromModelfile(model.name, modelfile);
    }

    static async deployFromModelfile(modelName, modelfile) {
        const dirPath = path.join('./tuner', 'models', modelName);
        await fs.mkdir(dirPath, { recursive: true });

        const filename = path.join(dirPath, 'Modelfile');
        await fs.writeFile(filename, modelfile);


        console.log(filename, modelName, 'MODD')

        return new Promise((resolve, reject) => {
            const ollama = spawn('ollama', ['create', modelName, '-f', filename], {
                stdio: 'inherit',
                shell: true
            });

            ollama.on('error', (err) => {
                console.log(err, 'ERR')
                reject(err)
            });
            ollama.on('close', (code) => {
                code === 0
                    ? resolve(`Model ${modelName} deployed`)
                    : reject(`Deployment failed with code ${code}`);
            });
        });
    }
}