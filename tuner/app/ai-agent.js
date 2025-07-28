import { db } from '../../models/index.js';
import { OllamaClient } from './ollama-client.js';
import { FineTuner } from './fine-tuner.js';

export class AIAgent {
    constructor(modelId, sessionId) {
        this.modelId = modelId;
        this.sessionId = sessionId;
        this.ollama = new OllamaClient();
    }

    async initialize(context) {
        let model = await db.AiPreset.findByPk(this.modelId);
        if (context && context?.model) {
            this.model = { ...model, ...context?.model };
        } else {
            this.model = model;
        }

        if (!this.model) throw new Error(`Model ${this.modelId} not found`);

        [this.conversation] = await db.Conversation.findOrCreate({
            where: { id: this.sessionId }
        });
    }

    async generate(userInput, system) {
        // Save user message
        let userMessage = await this.saveMessage('user', userInput, 1);

        const messages = await this.buildMessages(system);



        console.log(messages, 'mess')

        const rawResponse = await this.ollama.chat(
            this.model.name,
            messages,
            this.model.parameters
        );

        let response = await this.processResponse(rawResponse.content)
        userMessage.confidence_score = response._confidence;
        userMessage.is_training_candidate = response._confidence >= this.model.min_fine_tune_confidence
        userMessage.save()
        return response;
    }

    async buildMessages(system) {
        const messages = await db.Message.findAll({
            where: { conversation_id: this.conversation.id },
            order: [['created_at', 'ASC']],
            limit: 10 // Last 5 exchanges
        });

        return [
            { role: 'system', content: system ? system : this.buildSystemPrompt() },
            ...messages.map(m => ({ role: m.role, content: `${m.content}\n**DATE/TIME TODAY**: ${new Date()}` }))
        ];
    }

    buildSystemPrompt() {
        return `
# ROLE: ${this.model.name}
${this.model.system_instruction}

## ANTI-HALLUCINATION RULES:
1. ${this.model.anti_hallucination_rules}
2. ONLY use information from the context or provided options
3. If required information is missing, respond with "I cannot answer"

## OUTPUT REQUIREMENTS:
1. Output STRICTLY as JSON
2. Previous response as context
3. Use this EXACT schema:
${JSON.stringify(this.model.output_schema, null, 2)}
4. Select values ONLY from: ${JSON.stringify(this.model.options)}
    `.trim();
    }

    async processResponse(content) {
        try {

            console.log(content, 'coko')

            const response = JSON.parse(content);

            // Calculate confidence (simplified example)
            const confidence = this.calculateConfidence(response);
            console.log(response, confidence, 'process conf')
            // Save assistant message with confidence
            await this.saveMessage('assistant', content, confidence);

            return { ...response, _confidence: confidence };
        } catch (error) {
            throw new Error(`Response validation failed: ${error.message}`);
        }
    }

    calculateConfidence(response) {
        // Implement your confidence heuristic:
        // 1. Check against expected schema
        // 2. Validate option constraints
        // 3. Analyze response completeness

        const schemaKeys = Object.keys(this.model.output_schema);
        const responseKeys = Object.keys(response);

        // Basic confidence calculation
        const keyMatch = schemaKeys.filter(k => responseKeys.includes(k)).length / schemaKeys.length;
        const optionMatch = this.validateOptions(response) ? 1 : 0.5;

        return (keyMatch + optionMatch) / 2;
    }

    validateOptions(response) {
        for (const [key, options] of Object.entries(this.model.options)) {
            if (options && options.length > 0 && !options.includes(response[key])) {
                return false;
            }
        }
        return true;
    }

    async saveMessage(role, content, confidence = null) {
        return await db.Message.create({
            role,
            content,
            confidence_score: confidence,
            conversation_id: this.conversation.id,
            is_training_candidate: confidence >= this.model.min_fine_tune_confidence
        });
    }

    /**
     * Create a fine-tuned version of the current model
     */
    async createFineTunedVersion() {
        return FineTuner.createFineTunedModel(this.modelId);
    }
}