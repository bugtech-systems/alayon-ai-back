import ollama from 'ollama';
import { calculateEmbedding } from './EmbeddingService.js';
import { calculateTokens } from './tokenService.js';
import { db } from '../models/index.js'

// Record new message

export async function getAiPreset(name) {

    let convo = await db.AiPreset.findOne({ where: { name: name } })

    if (!convo) {
        return null;
    } else {
        // Get conversation history

        return convo;
    }
}

// Helper: Format conversation context
export const formatConversation = (input) => {
    if (Array.isArray(input)) {
        return input.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }
    return typeof input === 'string' ? input : JSON.stringify(input);
};

export async function getConversationMessages(conversationId) {

    let convo = await db.Conversation.findOne({ where: { session_id: conversationId } })

    if (!convo) {
        convo = await db.Conversation.create({
            session_id: conversationId,
            context: {}
        });
        return { id: convo.id, conversation: convo, messages: [] }
    } else {
        // Get conversation history
        const messages = await db.Message.findAll({
            where: { conversation_id: convo.id },
            order: [['created_at', 'ASC']]
        });
        return { id: convo.id, conversation: convo, messages };
    }
}



// Record new message
export async function logMessage(conversationId, role, content, confidence) {
    const tokenCount = await calculateTokens(content);
    const conversation = await getConversationMessages(conversationId)

    console.log(conversation, 'CONVO', tokenCount, content)
    return db.Message.create({
        conversation_id: conversation.id,
        role,
        content,
        tokens: tokenCount,
        confidence_score: confidence
    });
}


/**
 * Generate AI response with confidence scoring
 * @param {string} prompt - User input
 * @param {Array} context - Conversation history
 * @param {Object} modelConfig - AI model parameters
 * @returns {Object} { response: string, confidence: float }
 */
export const generateResponse = async (prompt, context, modelConfig) => {
    console.log(`🤖 Generating response with ${modelConfig.model}...`);

    const messages = [
        ...context,
        { role: 'user', content: prompt }
    ];

    try {
        const response = await ollama.chat({
            model: modelConfig.model,
            messages,
            options: {
                temperature: modelConfig.temperature,
                top_k: modelConfig.top_k,
                top_p: modelConfig.top_p,
                num_ctx: modelConfig.contextWindow
            }
        });

        // Calculate confidence score
        const confidence = await calculateConfidence(
            prompt,
            response.message.content,
            context
        );

        console.log(`✅ AI response generated (Confidence: ${confidence.toFixed(2)})`);

        return {
            content: response.message.content,
            confidence,
            tokens: response.eval_count
        };
    } catch (error) {
        console.error('❌ AI generation error:', error.message);
        throw new Error('Failed to generate AI response');
    }
};



/**
 * Calculate response confidence score
 * @param {string} prompt - User input
 * @param {string} response - AI generated response
 * @param {Array} context - Conversation history
 * @returns {float} Confidence score (0-1)
 */
const calculateConfidence = async (prompt, response, context) => {
    try {
        // 1. Semantic similarity between prompt and response
        const promptEmbedding = await calculateEmbedding(prompt);
        const responseEmbedding = await calculateEmbedding(response);
        const similarity = cosineSimilarity(promptEmbedding, responseEmbedding);

        // 2. Context relevance
        const contextEmbedding = await calculateEmbedding(context.join(' '));
        const contextRelevance = cosineSimilarity(responseEmbedding, contextEmbedding);

        // 3. Response coherence score
        const coherence = await calculateCoherence(response);

        // Weighted confidence score
        const confidence = (similarity * 0.5) + (contextRelevance * 0.3) + (coherence * 0.2);

        console.log(`   🔍 Confidence components - Similarity: ${similarity.toFixed(2)}, Context: ${contextRelevance.toFixed(2)}, Coherence: ${coherence.toFixed(2)}`);

        return Math.min(Math.max(confidence, 0), 1); // Clamp between 0-1
    } catch (error) {
        console.error('❌ Confidence calculation error:', error.message);
        return 0.5; // Default confidence
    }
};

// Helper function for cosine similarity
const cosineSimilarity = (a, b) => {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
};