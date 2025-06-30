import express from 'express';
import { Ollama } from 'ollama';
import { sessionManager } from './services/SessionManager.js';

const app = express();
app.use(express.json());

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });

// Field Configuration
const FIELD_CONFIG = [
    {
        name: 'name',
        description: 'Full name of the customer',
        required: true,
        type: 'string'
    },
    {
        name: 'email',
        description: 'Email address',
        required: true,
        type: 'string',
        validation: 'email'
    },
    {
        name: 'status',
        description: 'Account status',
        required: true,
        type: 'string',
        options: ['active', 'pending', 'inactive']
    }
];

// AI Instruction Template
const AI_INSTRUCTION = `
You are a helpful database assistant that constructs MongoDB queries through conversation.

Rules:
1. Maintain a polite, professional tone
2. Extract values ONLY from user input
3. For fields with options, only accept specified values
4. List ALL missing required fields in each response
5. Provide detailed explanations for required information
6. Confirm before executing operations

Response Format (JSON ONLY):
{
  "operation": "create|read|update|delete",
  "extractedFields": {"field": "value"},
  "missingFields": [
    {
      "name": "fieldName",
      "description": "Field description",
      "options": ["valid", "options"] // if applicable
    }
  ],
  "followUp": "Polite message requesting missing information",
  "query": {}, // MongoDB query object
  "nextStep": "field_required|confirmation|execute"
}

Current Field Configuration:
${JSON.stringify(FIELD_CONFIG, null, 2)}
`;


app.post('/api/query', async (req, res) => {
    console.log('\n=== NEW REQUEST ===');
    console.log(`[Request] Received at ${new Date().toISOString()}`);
    console.log(`[Request] Body: ${JSON.stringify(req.body)}`);

    const { prompt, sessionId } = req.body;

    try {
        // Get or create session
        let session = sessionId ? sessionManager.getSession(sessionId) : null;
        if (!session) {
            console.log('[Session] Creating new session');
            session = sessionManager.createSession();
        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }

        // Add user message to history
        console.log(`[History] Adding user prompt: ${prompt}`);
        sessionManager.addHistory(session.id, {
            role: 'user',
            content: prompt
        });

        // Prepare AI context
        const context = {
            instruction: AI_INSTRUCTION,
            conversation: session.history,
            currentState: session.state,
            fieldConfig: FIELD_CONFIG
        };
        console.log(`[AI] Context prepared: ${JSON.stringify(context, null, 2)}`);

        // Generate AI response
        console.log('[AI] Generating response...', context);
        const aiResponse = await generateAIResponse(context);
        console.log(`[AI] Response received: ${JSON.stringify(aiResponse, null, 2)}`);

        // Validate field options
        console.log('[Validation] Checking field options...');
        for (const field in aiResponse.extractedFields) {
            const config = FIELD_CONFIG.find(f => f.name === field);
            if (config?.options && !config.options.includes(aiResponse.extractedFields[field])) {
                const errorMsg = `Invalid value for ${field}. Valid options: ${config.options.join(', ')}`;
                console.log(`[Validation] ${errorMsg}`);
                throw new Error(errorMsg);
            }
        }

        // Update session
        console.log('[Session] Updating session with extracted fields');
        sessionManager.updateSession(session.id, {
            ...aiResponse,
            extractedFields: {
                ...session.state.extractedFields,
                ...aiResponse.extractedFields
            }
        });

        // Add AI response to history
        console.log(`[History] Adding AI response: ${aiResponse.followUp}`);
        sessionManager.addHistory(session.id, {
            role: 'system',
            content: aiResponse.followUp
        });

        // Prepare response
        const response = {
            sessionId: session.id,
            message: aiResponse.followUp,
            operation: aiResponse.operation,
            extractedFields: session.state.extractedFields,
            missingFields: aiResponse.missingFields,
            nextStep: aiResponse.nextStep
        };

        if (aiResponse.query) {
            response.query = aiResponse.query;
            console.log(`[Query] Generated query: ${JSON.stringify(aiResponse.query)}`);
        }

        console.log(`[Response] Sending response: ${JSON.stringify(response, null, 2)}`);
        res.json(response);

    } catch (error) {
        console.log(`[ERROR] ${error}`);
        console.log(error.stack);
        res.status(400).json({
            success: false,
            error: error.message,
            followUp: "Let's try that again. " + error.message
        });
    }
});

async function generateAIResponse(context) {
    console.log(context, 'CONT')
    const prompt = `
  ${context.instruction}
  
  Conversation History:
  ${context.conversation.map(m => `${m.role}: ${m.content}`).join('\n')}
  
  
  Current State:
  ${JSON.stringify(context.currentState, null, 2)}
  
  Your Response (JSON ONLY):
  `;

    console.log('[AI] Sending prompt to Ollama...', prompt);
    const startTime = Date.now();

    const response = await ollama.generate({
        model: 'mistral:7b',
        prompt,
        format: 'json',
        options: { temperature: 0.3 }
    });

    const endTime = Date.now();
    console.log(`[AI] Received response in ${endTime - startTime}ms`);

    try {
        const parsed = JSON.parse(response.response);
        console.log('[AI] Parsed response successfully');
        return parsed;
    } catch (error) {
        console.error('[AI] Failed to parse response:', response.response);
        throw new Error('Failed to parse AI response');
    }
}

const PORT = process.env.PORT || 3500;
app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
});