class DynamicConversationProcessor {
    constructor(config) {
        this.config = {
            extractionKeywords: {
                default: ['is', ':', '='],
                ...config?.extractionKeywords
            },
            mergeStrategy: config?.mergeStrategy || 'deep-merge',
            confidenceThreshold: config?.confidenceThreshold || 0.7
        };
    }

    process(conversations, defaultFields, previousState = {}) {
        const state = { ...previousState };
        const confidence = {};
        const extractionPatterns = this._buildExtractionPatterns(defaultFields);

        // Process in chronological order (allows later messages to override)
        conversations.forEach(message => {
            const { content } = message;
            const lowerContent = content.toLowerCase();

            defaultFields.forEach(field => {
                const patterns = extractionPatterns[field];
                const extractedValue = this._extractFieldValue(content, lowerContent, field, patterns);

                if (extractedValue !== undefined) {
                    state[field] = extractedValue.value;
                    confidence[field] = extractedValue.confidence;
                }
            });
        });

        return {
            query_object: this._cleanState(state, defaultFields),
            confidence_scores: confidence,
            processing_metadata: {
                fields_extracted: defaultFields.filter(f => state[f] !== null),
                fields_missing: defaultFields.filter(f => state[f] === null)
            }
        };
    }

    _buildExtractionPatterns(fields) {
        return fields.reduce((patterns, field) => {
            patterns[field] = [
                // Field name as direct key
                new RegExp(`\\b${field}[\\s,:;=]+([^\\s.,!?]+(?:\\s[^\\s.,!?]+)*)`, 'i'),
                // Common extraction patterns
                ...this.config.extractionKeywords.default.map(kw =>
                    new RegExp(`\\b${field}\\b.*?${kw}\\s*([^\\s.,!?]+(?:\\s[^\\s.,!?]+)*)`, 'i')
      ];
            return patterns;
        }, {});
    }

    _extractFieldValue(content, lowerContent, field, patterns) {
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match && match[1]) {
                return {
                    value: match[1].trim(),
                    confidence: this._calculateConfidence(match[0])
                };
            }
        }

        // Fallback to simple contains check
        if (lowerContent.includes(field.toLowerCase())) {
            return {
                value: content.split(field)[1]?.trim() || null,
                confidence: 0.5
            };
        }

        return undefined;
    }

    _calculateConfidence(matchText) {
        const score = Math.min(1, matchText.length / 20); // Longer matches = higher confidence
        return Math.max(0.1, Math.min(1, score));
    }

    _cleanState(state, fields) {
        return fields.reduce((clean, field) => {
            clean[field] = state[field] !== undefined ? state[field] : null;
            return clean;
        }, {});
    }
}

// Example Usage:
const processor = new DynamicConversationProcessor({
    extractionKeywords: {
        address: ['at', 'to', 'location'],
        quantity: ['x', 'of', 'need']
    }
});

const conversations = [
    { role: "user", content: "Order 5 bottles to 123 Main St" },
    { role: "assistant", content: "What name for the order?" },
    { role: "user", content: "For: John Doe" },
    { role: "user", content: "Actually change address to 456 Oak Ave" }
];

const defaultFields = ['name', 'address', 'quantity', 'deliveryDate'];
const previousState = { deliveryDate: '2023-12-01' };

const result = processor.process(conversations, defaultFields, previousState);
console.log(result);