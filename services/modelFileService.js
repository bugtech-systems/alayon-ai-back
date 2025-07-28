import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generates a Modelfile for Ollama fine-tuning
 * @param {Array} samples - Training samples with labels
 * @param {Object} baseConfig - Base model configuration
 * @returns {Object} { modelfilePath: string, sampleCount: number }
 */
export const generateModelfile = async (samples, baseConfig) => {
    // Create temp directory
    const timestamp = Date.now();
    const tempDir = path.join(__dirname, `../temp/modelfiles`);
    await fs.mkdir(tempDir, { recursive: true });

    const modelfilePath = path.join(tempDir, `model-${timestamp}.Modelfile`);

    // Start building Modelfile content
    let modelfileContent = `FROM ${baseConfig.model}\n`;
    modelfileContent += `SYSTEM """\n`;
    modelfileContent += `You are an expert assistant trained on specialized datasets.\n`;
    modelfileContent += `Key domain labels: ${getDomainLabels(samples)}\n`;
    modelfileContent += `Response style guidelines:\n`;
    modelfileContent += `- Be factual and precise\n- Maintain conversational tone\n- Use markdown when appropriate\n`;
    modelfileContent += `"""\n\n`;

    // Add parameter configurations
    modelfileContent += `# Model Behavior Parameters\n`;
    modelfileContent += `PARAMETER temperature ${baseConfig.temperature}\n`;
    modelfileContent += `PARAMETER top_k ${baseConfig.top_k}\n`;
    modelfileContent += `PARAMETER num_ctx ${baseConfig.num_ctx}\n\n`;

    // Add training templates
    modelfileContent += `# Response Templates\n`;
    modelfileContent += `TEMPLATE """[\n`;
    modelfileContent += `  {{ range .System }}<|system|>\n{{ . }}\n<|end|>\n{{ end }}`;
    modelfileContent += `  {{ range .Messages }}<|{{ .Role }}|>\n{{ .Content }}\n<|end|>\n{{ end }}`;
    modelfileContent += `  <|assistant|>\n`;
    modelfileContent += `""\"\n\n`;

    // Add training messages
    modelfileContent += `# Training Data with Labels\n`;
    let sampleCount = 0;

    for (const sample of samples) {
        const labels = sample.Labels.map(label => label.name).join(', ');

        modelfileContent += `MESSAGE system """\n`;
        modelfileContent += `Training sample ID: ${sample.id}\n`;
        modelfileContent += `Domain labels: ${labels}\n`;
        modelfileContent += `Accuracy score: ${sample.accuracyScore || 0.85}\n`;
        modelfileContent += `"""\n`;

        modelfileContent += `MESSAGE user """\n`;
        modelfileContent += `${formatConversation(sample.input)}\n`;
        modelfileContent += `"""\n`;

        modelfileContent += `MESSAGE assistant """\n`;
        modelfileContent += `${sample.output}\n`;
        modelfileContent += `"""\n\n`;

        sampleCount++;
    }

    await fs.writeFile(modelfilePath, modelfileContent);
    console.log(`📝 Generated Modelfile with ${sampleCount} samples at ${modelfilePath}`);

    return { modelfilePath, sampleCount };
};

// Helper: Extract unique domain labels
const getDomainLabels = (samples) => {
    const labelSet = new Set();
    samples.forEach(sample => {
        sample.Labels.forEach(label => labelSet.add(label.name));
    });
    return Array.from(labelSet).join(', ');
};

// Helper: Format conversation context
const formatConversation = (input) => {
    if (Array.isArray(input)) {
        return input.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }
    return typeof input === 'string' ? input : JSON.stringify(input);
};

/**
 * Execute Ollama create command to spawn new model
 * @param {string} modelfilePath - Path to Modelfile
 * @param {string} modelName - New model name
 */
export const createModel = async (modelfilePath, modelName) => {
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
        console.log(`🚀 Creating model: ${modelName}`);

        const ollama = spawn('ollama', ['create', modelName, '-f', modelfilePath]);

        ollama.stdout.on('data', (data) => {
            console.log(`[OLLAMA] ${data.toString().trim()}`);
        });

        ollama.stderr.on('data', (data) => {
            console.error(`[OLLAMA ERROR] ${data.toString().trim()}`);
        });

        ollama.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Model created successfully: ${modelName}`);
                resolve();
            } else {
                console.error(`❌ Model creation failed for ${modelName} (code ${code})`);
                reject(new Error('Model creation failed'));
            }
        });
    });
};