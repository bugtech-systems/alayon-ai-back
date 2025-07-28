import { calculateEmbedding } from './EmbeddingService.js';
import { Tiktoken } from '@dqbd/tiktoken';

// Tokenizer cache
const tokenizers = new Map();

// Mistral-specific tokenization
const MISTRAL_ENCODING = "cl100k_base";  // Mistral 7B uses same tokenizer as GPT-3.5/4

// Tokenizer instance
let tokenizer = null;

/**
 * Initialize tokenizer for Mistral models
 * @returns {Tiktoken} Initialized tokenizer
 */
function initializeTokenizer() {
    if (!tokenizer) {
        try {
            // Load tokenizer config directly from file
            const cl100kPath = path.resolve(
                __dirname,
                '../node_modules/@dqbd/tiktoken/encoders/cl100k_base.json'
            );

            const cl100kBase = JSON.parse(fs.readFileSync(cl100kPath, 'utf8'));

            tokenizer = new Tiktoken(
                cl100kBase.bpe_ranks,
                cl100kBase.special_tokens,
                cl100kBase.pat_str
            );

            console.log('🔠 Mistral tokenizer initialized successfully');
        } catch (error) {
            console.error('❌ Tokenizer initialization failed:', error.message);
            throw error;
        }
    }
    return tokenizer;
}

export function calculateTokens(input, forCompletion = false) {
    let encoder;
    try {
        encoder = initializeTokenizer();
    } catch (error) {
        console.warn('⚠️ Using fallback token calculation');
        return fallbackTokenCount(input, forCompletion);
    }

    try {
        let count = 0;

        // Handle different input types
        if (Array.isArray(input)) {
            // Chat messages format
            for (const message of input) {
                count += 4; // Message framing tokens

                if (message.name) {
                    count += encoder.encode(message.name).length;
                }

                if (message.content) {
                    if (Array.isArray(message.content)) {
                        // Handle multimodal content
                        for (const item of message.content) {
                            if (item.type === 'text') {
                                count += encoder.encode(item.text).length;
                            } else {
                                // Estimate for non-text content
                                count += 100; // Conservative estimate
                            }
                        }
                    } else {
                        count += encoder.encode(message.content).length;
                    }
                }
            }
            count += 2; // Final </s> token
        } else if (typeof input === 'string') {
            // Plain text
            count = encoder.encode(input).length;
        } else if (typeof input === 'object') {
            // JSON objects
            count = encoder.encode(JSON.stringify(input)).length;
        }

        // Add completion buffer
        if (forCompletion) count += 128;

        console.log(`🧮 Token count: ${count} ${forCompletion ? '(with completion buffer)' : ''}`);
        return count;
    } catch (error) {
        console.error('❌ Token calculation error:', error.message);
        return fallbackTokenCount(input, forCompletion);
    }
}

/**
 * Fallback token calculation method
 * @param {string|Array|Object} input - Input content
 * @param {boolean} forCompletion - Add buffer for completion
 * @returns {number} Estimated token count
 */
function fallbackTokenCount(input, forCompletion = false) {
    let count = 0;

    if (Array.isArray(input)) {
        // Estimate for chat messages
        for (const message of input) {
            if (message.content) {
                if (typeof message.content === 'string') {
                    count += Math.ceil(message.content.length / 4);
                } else if (Array.isArray(message.content)) {
                    for (const item of message.content) {
                        if (item.type === 'text') {
                            count += Math.ceil(item.text.length / 4);
                        } else {
                            count += 100; // Non-text estimate
                        }
                    }
                }
                count += 4; // Message framing
            }
        }
        count += 2; // Final tokens
    } else if (typeof input === 'string') {
        count = Math.ceil(input.length / 4);
    } else if (typeof input === 'object') {
        count = Math.ceil(JSON.stringify(input).length / 4);
    }

    if (forCompletion) count += 128;

    console.log(`⚠️ Fallback token estimate: ${count}`);
    return count;
}

/**
 * Trim context to fit within token limit
 * @param {Array} messages - Conversation history
 * @param {number} maxTokens - Maximum allowed tokens
 * @returns {Array} Trimmed messages
 */
export function trimContext(messages, maxTokens = 4096) {
    const encoder = initializeTokenizer();
    let totalTokens = 0;
    const trimmed = [];

    // Process in reverse (keep most recent)
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const msgTokens = 4 + encoder.encode(msg.content).length;

        if (totalTokens + msgTokens <= maxTokens) {
            trimmed.unshift(msg);
            totalTokens += msgTokens;
        } else {
            // Try to preserve the system message if possible
            if (msg.role === 'system' && totalTokens === 0) {
                trimmed.unshift(msg);
                totalTokens += msgTokens;
            } else {
                break;
            }
        }
    }

    console.log(`✂️ Trimmed context from ${messages.length} to ${trimmed.length} messages (${totalTokens}/${maxTokens} tokens)`);
    return trimmed;
}

/**
 * Get tokenizer instance with caching
 * @returns {tiktoken.Tiktoken} Tokenizer instance
 */
function getTokenizer() {
    if (!tokenizers.has(MISTRAL_ENCODING)) {
        tokenizers.set(
            MISTRAL_ENCODING,
            tiktoken.getEncoding(MISTRAL_ENCODING)
        );
        console.log(`🔠 Loaded tokenizer for ${MISTRAL_ENCODING}`);
    }
    return tokenizers.get(MISTRAL_ENCODING);
}



/**
 * Calculate token cost estimate
 * @param {number} inputTokens - Input tokens
 * @param {number} outputTokens - Output tokens
 * @param {string} modelType - Model size (7b, 13b, 70b)
 * @returns {number} Estimated cost in USD
 */
export function estimateTokenCost(inputTokens, outputTokens, modelType = '7b') {
    // Mistral pricing estimates (hypothetical)
    const COSTS = {
        '7b': { in: 0.0000002, out: 0.0000002 },
        '13b': { in: 0.0000004, out: 0.0000004 },
        '70b': { in: 0.0000009, out: 0.0000009 }
    };

    const cost = (inputTokens * COSTS[modelType].in) +
        (outputTokens * COSTS[modelType].out);

    console.log(`💰 Cost estimate: $${cost.toFixed(6)} for ${inputTokens} in + ${outputTokens} out tokens`);
    return cost;
}

/**
 * Calculate tokens using Mistral's special tokens
 * @param {string} text - Input text
 * @returns {number} Token count
 */
export function calculateWithSpecialTokens(text) {
    const tokenizer = getTokenizer();
    const tokens = tokenizer.encode(text);

    // Add special token overhead
    const SPECIAL_TOKENS = {
        BEGIN_TEXT: 1,
        END_TEXT: 1,
        PAD: 0
    };

    const count = tokens.length + SPECIAL_TOKENS.BEGIN_TEXT + SPECIAL_TOKENS.END_TEXT;
    console.log(`🎯 Special token count: ${count} (base: ${tokens.length})`);
    return count;
}

/**
 * Calculate semantic token density
 * @param {string} text - Input text
 * @returns {Promise<number>} Tokens per meaningful unit
 */
export async function calculateTokenDensity(text) {
    try {
        const tokenCount = calculateTokens(text);
        const embedding = await calculateEmbedding(text);

        // Calculate variance as proxy for information density
        let sum = 0;
        let squareSum = 0;

        for (const value of embedding) {
            sum += value;
            squareSum += value * value;
        }

        const mean = sum / embedding.length;
        const variance = (squareSum / embedding.length) - (mean * mean);
        const density = tokenCount / (variance * 1000 + 1); // Normalized

        console.log(`📊 Token density: ${density.toFixed(4)} (variance: ${variance.toFixed(4)})`);
        return density;
    } catch (error) {
        console.error('❌ Token density calculation error:', error.message);
        return 1.0; // Neutral density
    }
}

/**
 * Split text into token-limited chunks
 * @param {string} text - Input text
 * @param {number} chunkSize - Max tokens per chunk
 * @returns {Array} Text chunks
 */
export function chunkText(text, chunkSize = 512) {
    const tokenizer = getTokenizer();
    const tokens = tokenizer.encode(text);
    const chunks = [];

    for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunkTokens = tokens.slice(i, i + chunkSize);
        chunks.push(tokenizer.decode(chunkTokens));
    }

    console.log(`📚 Split text into ${chunks.length} chunks`);
    return chunks;
}

/**
 * Optimize prompt for token efficiency
 * @param {string} prompt - Original prompt
 * @returns {string} Optimized prompt
 */
export function optimizePrompt(prompt) {
    // Common optimizations
    const replacements = [
        [/\bplease\b/gi, ''], // Remove pleasantries
        [/\bI need you to\b/gi, ''], // Remove unnecessary phrases
        [/\bcan you\b/gi, ''],
        [/\.\s+/g, '. '], // Normalize whitespace
        [/\s{2,}/g, ' '], // Remove extra spaces
        [/\bvery\b/gi, ''], // Remove intensifiers
        [/\bactually\b/gi, ''],
        [/\bbasically\b/gi, ''],
        [/\bsimply\b/gi, '']
    ];

    let optimized = prompt;
    for (const [regex, replacement] of replacements) {
        optimized = optimized.replace(regex, replacement);
    }

    const originalTokens = calculateTokens(prompt);
    const newTokens = calculateTokens(optimized);
    const reduction = ((originalTokens - newTokens) / originalTokens) * 100;

    console.log(`⚡ Prompt optimized: ${reduction.toFixed(1)}% token reduction`);
    return optimized;
}