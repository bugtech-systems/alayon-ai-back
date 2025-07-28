import ollama from 'ollama';
import { Op } from 'sequelize';
import { db } from '../models/index.js'
// Cache configuration
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const BATCH_SIZE = 32; // Ollama's max batch size
const MODEL = 'nomic-embed-text'; // Default embedding model

/**
 * Calculate embeddings for text with intelligent caching
 * @param {string|Array} input - Text or array of texts to embed
 * @param {Array} domainLabels - Contextual labels for domain adaptation
 * @returns {Promise<Array>} Array of embeddings
 */
export const calculateEmbedding = async (input, domainLabels = []) => {
    try {
        // Handle array input
        const inputs = Array.isArray(input) ? input : [input];

        // Generate cache keys
        const cacheKeys = inputs.map(text => generateCacheKey(text, domainLabels));

        // Check cache first
        const { cachedResults, missingItems } = await checkEmbeddingCache(cacheKeys, inputs);

        if (missingItems.length === 0) {
            console.log(`📦 Serving ${inputs.length} embeddings from cache`);
            return cachedResults;
        }

        // Process missing embeddings
        console.log(`🧮 Generating embeddings for ${missingItems.length} items`);
        const newEmbeddings = await generateBatchEmbeddings(missingItems, domainLabels);

        // Update cache
        await cacheEmbeddings(missingItems, newEmbeddings, domainLabels);

        // Combine results
        const finalEmbeddings = [];
        for (let i = 0; i < inputs.length; i++) {
            finalEmbeddings.push(
                cachedResults[i] || newEmbeddings[missingItems.indexOf(inputs[i])]
            );
        }

        return Array.isArray(input) ? finalEmbeddings : finalEmbeddings[0];
    } catch (error) {
        console.error('❌ Embedding calculation error:', error.message);
        throw new Error('Embedding service unavailable');
    }
};

/**
 * Generate cache key based on text and domain labels
 * @param {string} text - Input text
 * @param {Array} domainLabels - Context labels
 * @returns {string} SHA-256 hash
 */
const generateCacheKey = (text, domainLabels) => {
    const labelHash = domainLabels.sort().join('');
    const data = `${text}|${labelHash}`;

    // Simple hash for demo (use crypto in production)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(16);
};

/**
 * Check cache for existing embeddings
 * @param {Array} cacheKeys - Generated cache keys
 * @param {Array} texts - Original texts
 * @returns {Object} { cachedResults: [], missingItems: [] }
 */
const checkEmbeddingCache = async (cacheKeys, texts) => {
    const cachedResults = new Array(texts.length).fill(null);
    const missingItems = [];

    const cacheEntries = await db.EmbeddingCache.findAll({
        where: {
            cacheKey: { [Op.in]: cacheKeys },
            updatedAt: { [Op.gte]: new Date(Date.now() - CACHE_TTL) }
        }
    });

    // Map results
    const cacheMap = new Map();
    cacheEntries.forEach(entry => {
        cacheMap.set(entry.cacheKey, JSON.parse(entry.embedding));
    });

    // Populate results and missing items
    cacheKeys.forEach((key, index) => {
        if (cacheMap.has(key)) {
            cachedResults[index] = cacheMap.get(key);
        } else {
            missingItems.push(texts[index]);
        }
    });

    return { cachedResults, missingItems };
};

/**
 * Generate embeddings in batches
 * @param {Array} texts - Texts to process
 * @param {Array} domainLabels - Context labels
 * @returns {Promise<Array>} Embedding vectors
 */
const generateBatchEmbeddings = async (texts, domainLabels) => {
    const embeddings = [];

    // Apply domain context to texts
    const domainContext = domainLabels.length > 0
        ? `[DOMAINS: ${domainLabels.join(', ')}]\n`
        : '';

    const contextedTexts = texts.map(text => domainContext + text);

    // Process in batches
    for (let i = 0; i < contextedTexts.length; i += BATCH_SIZE) {
        const batch = contextedTexts.slice(i, i + BATCH_SIZE);
        const response = await ollama.embeddings({
            model: MODEL,
            prompt: batch,
        });

        // Validate response
        if (!response || !response.embeddings || response.embeddings.length !== batch.length) {
            throw new Error('Invalid embedding response');
        }

        // Normalize embeddings
        const normalizedBatch = response.embeddings.map(normalizeEmbedding);
        embeddings.push(...normalizedBatch);

        console.log(`   🔄 Processed batch ${i / BATCH_SIZE + 1}/${Math.ceil(contextedTexts.length / BATCH_SIZE)}`);
    }

    return embeddings;
};

/**
 * Normalize embedding vector to unit length
 * @param {Array} vector - Embedding vector
 * @returns {Array} Normalized vector
 */
const normalizeEmbedding = (vector) => {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
};

/**
 * Cache new embeddings
 * @param {Array} texts - Original texts
 * @param {Array} embeddings - Generated embeddings
 * @param {Array} domainLabels - Context labels
 */
const cacheEmbeddings = async (texts, embeddings, domainLabels) => {
    const cacheEntries = texts.map((text, index) => ({
        cacheKey: generateCacheKey(text, domainLabels),
        embedding: JSON.stringify(embeddings[index]),
        originalText: text.substring(0, 500), // Truncate for storage
        domainLabels: domainLabels.join(',')
    }));

    try {
        await db.EmbeddingCache.bulkCreate(cacheEntries);
        console.log(`💾 Cached ${cacheEntries.length} new embeddings`);
    } catch (error) {
        console.error('❌ Embedding cache update failed:', error.message);
    }
};

/**
 * Calculate cosine similarity between two embeddings
 * @param {Array} a - First embedding
 * @param {Array} b - Second embedding
 * @returns {number} Similarity score (0-1)
 */
export const cosineSimilarity = (a, b) => {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    return magA > 0 && magB > 0
        ? Math.max(0, dotProduct / (magA * magB))
        : 0;
};

/**
 * Calculate response coherence score
 * @param {string} response - AI generated response
 * @returns {Promise<number>} Coherence score (0-1)
 */
export const calculateCoherence = async (response) => {
    try {
        // Split response into sentences
        const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length < 2) return 1.0; // Single sentence is always coherent

        // Calculate pairwise similarity
        let totalSimilarity = 0;
        let pairs = 0;

        const embeddings = await calculateEmbedding(sentences);

        for (let i = 0; i < embeddings.length - 1; i++) {
            const similarity = cosineSimilarity(embeddings[i], embeddings[i + 1]);
            totalSimilarity += similarity;
            pairs++;
        }

        const avgSimilarity = totalSimilarity / pairs;
        console.log(`   🧠 Coherence score: ${avgSimilarity.toFixed(2)}`);
        return avgSimilarity;
    } catch (error) {
        console.error('❌ Coherence calculation error:', error.message);
        return 0.7; // Default score
    }
};

/**
 * Find most relevant labels for text
 * @param {string} text - Input text
 * @returns {Promise<Array>} Array of label IDs
 */
export const suggestLabels = async (text) => {
    try {
        // Get all active labels
        const labels = await db.Label.findAll({ attributes: ['id', 'name'] });

        // Calculate text embedding
        const textEmbedding = await calculateEmbedding(text);

        // Calculate similarity with each label
        const labelScores = await Promise.all(
            labels.map(async label => {
                const labelEmbedding = await calculateEmbedding(label.name);
                return {
                    id: label.id,
                    score: cosineSimilarity(textEmbedding, labelEmbedding)
                };
            })
        );

        // Filter top 3 labels
        return labelScores
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(item => item.id);
    } catch (error) {
        console.error('❌ Label suggestion error:', error.message);
        return [];
    }
};