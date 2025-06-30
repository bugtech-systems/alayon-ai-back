// 📂 services/promptService.js
import promptConfig from '../config/promptConfig.json' assert { type: 'json' };
console.log(promptConfig, 'PROMPT')
export class PromptService {
    constructor(ollama) {
        this.ollama = ollama;
        this.systemPrompt = this.buildSystemPrompt({});
        this.conversationHistory = [];

    }

    addToHistory(userPrompt, generatedQuery) {
        this.conversationHistory.push({
            timestamp: new Date(),
            userPrompt,
            generatedQuery
        });
    }

    buildSystemPrompt(context) {
        let schemaConstraints = context?.type == 'config' ? promptConfig.promptInstructions.configSchemaConstraints : promptConfig.promptInstructions.schemaConstraints;

        return `
      ROLE: ${promptConfig.promptInstructions.description}
      SCHEMA: ${JSON.stringify(schemaConstraints)}
      REQUIRED FIELDS: ${context?.requiredFields?.join(', ')}
      EXAMPLE RESPONSE: ${JSON.stringify(promptConfig.examples[context?.type])}
      CURRENT INTENT: ${context.intent}
      
      TARGET DATA: ${context.results}
      
      CONVERSATION FLOW:
    ${context?.history?.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}
    `;
    }

    determineIntent(prompt) {
        const lowerPrompt = prompt.toLowerCase();
        if (lowerPrompt.includes('create') || lowerPrompt.includes('add')) return 'create';
        if (lowerPrompt.includes('update') || lowerPrompt.includes('modify')) return 'update';
        if (lowerPrompt.includes('delete') || lowerPrompt.includes('remove')) return 'delete';
        return 'find';
    }

    determineType(prompt) {
        const lowerPrompt = prompt.toLowerCase();
        if (lowerPrompt.includes('config') || lowerPrompt.includes('setup')) return 'config';
        if (lowerPrompt.includes('relationship') || lowerPrompt.includes('connect') || lowerPrompt.includes('connection')) return 'connection';
        return 'resource';
    }


    async generateQuery(userPrompt, context) {


        let intent = this.determineIntent(userPrompt);

        let resourceType = this.determineType(userPrompt);












        let systemPrompt = this.buildSystemPrompt({ ...context, intent, type: resourceType })
        console.log(systemPrompt, 'SS')





        return this.ollama.generate({
            model: 'mongoai',
            prompt: `SYSTEM: ${systemPrompt}\nUSER: ${userPrompt}`,
            format: 'json',
            options: {
                temperature: 0.3,  // Low for consistency
                // repeat_penalty: 1.5,  // Strong penalty for repetition
                top_k: 40,  // Broader consideration
                top_p: 0.8,  // Allows some creativity
                num_ctx: 4096  // Larger context window
            }
        });
    }
}