import { initializeDatabase, db } from '../../models/index.js';
import { AIAgent } from './ai-agent.js';
import { FineTuner } from './fine-tuner.js';

// Initialize database

const syncDatabase = async () => {
    let initializedDb;
    try {
        initializedDb = await initializeDatabase();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1); // Exit if database fails to initialize
    }
};

syncDatabase();

// Create medical diagnosis model
const medicalModel = await db.AiPreset.create({
    name: 'med-diagnostician',
    base_model: 'llama3',
    system_instruction: `You are a medical diagnosis assistant. Analyze symptoms and provide diagnosis using ICD-11 codes.`,
    output_schema: {
        diagnosis: "string (ICD-11 code)",
        confidence: "number (0-1)",
        recommendations: "string[]",
        certainty_level: "string (high, medium, low)"
    },
    options: {
        diagnosis: ["1A00", "1B20", "1C25"],
        certainty_level: ["high", "medium", "low"]
    },
    anti_hallucination_rules: "Never suggest undiscussed symptoms. Never invent new conditions.",
    parameters: {
        temperature: 0.2,
        num_ctx: 4096
    },
    min_fine_tune_confidence: 0.9
});

// Create AI agent session
const agent = new AIAgent(medicalModel.id, 'patient-123');
await agent.initialize();

// Process multiple queries to build context
const queries = [
    "Patient has high fever for 3 days",
    "Now developed skin rash",
    "No other symptoms reported"
];

for (const query of queries) {
    const response = await agent.generate(query);
    console.log(`Response (Confidence: ${(response._confidence * 100).toFixed(1)}%):`, response);
}

// Create fine-tuned model after sufficient high-confidence interactions
try {
    const newModel = await agent.createFineTunedVersion();
    console.log(`Created fine-tuned model: ${newModel.name}`);

    // Switch to using the fine-tuned model
    agent.model = newModel;
    const refinedResponse = await agent.generate("Any change in diagnosis?");
    console.log("Refined diagnosis:", refinedResponse);
} catch (error) {
    console.error("Fine-tuning failed:", error.message);
}