import { Ollama } from 'ollama';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AlayonWaterAssistant {
    constructor() {
        this.ollama = new Ollama({ host: 'http://localhost:11434' });
        this.modelName = 'alayon-assistant';
        this.conversationHistory = new Map();
        this.trainingData = this.loadTrainingData();
        this.responseTemplates = new Set();
        this.referralDatabase = new Map();
        this.initialize();
        this.extractTemplates();
        this.initializeReferralSystem();
    }

    // Load training data
    loadTrainingData() {
        try {
            const data = fs.readFileSync('./alayon-training-data.json', 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading training data:', error);
            return { conversation_templates: [], response_templates: {} };
        }
    }

    // Initialize referral system
    initializeReferralSystem() {
        this.referralDatabase.set('default_user', {
            referral_code: this.generateReferralCode(),
            referral_count: 0,
            credit_balance: 0,
            pending_credits: 0
        });
    }

    // Generate unique referral code
    generateReferralCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Extract templates for enforcement
    extractTemplates() {
        this.trainingData.conversation_templates.forEach(template => {
            this.responseTemplates.add(template.ai_response);
        });

        Object.values(this.trainingData.response_templates).forEach(template => {
            this.responseTemplates.add(template);
        });

        console.log(`✅ Loaded ${this.responseTemplates.size} Alayon response templates`);
    }

    // Create or update the Alayon model
    async createAlayonModel() {
        try {
            console.log('🚰 Creating Alayon Water Delivery AI Assistant...');
            
            // First, ensure the base model exists
            try {
                await this.ollama.pull({ model: 'llama2' });
                console.log('✅ Base model (llama2) is ready');
            } catch (error) {
                console.log('⚠️  Base model pull skipped, using existing model');
            }
            
            // Generate the modelfile content
            const modelfileContent = this.generateModelfile();
            
            // Check if model already exists
            let modelExists = false;
            try {
                const models = await this.ollama.list();
                modelExists = models.models.some(m => m.name === this.modelName);
            } catch (error) {
                console.log('ℹ️  Could not check existing models, proceeding with creation...');
            }
            
            if (modelExists) {
                console.log('🔄 Updating existing Alayon model...');
                try {
                    await this.ollama.delete({ model: this.modelName });
                } catch (error) {
                    console.log('⚠️  Could not delete existing model, continuing...');
                }
            }
            
            // Create the model using FROM with the base model
            console.log('📝 Creating model with custom instructions...');
            const response = await this.ollama.create({
                model: this.modelName,
                modelfile: modelfileContent
            });
            
            console.log('✅ Alayon AI Assistant created successfully!');
            
            // Test the model
            console.log('\n🧪 Testing model with sample query...');
            const testResponse = await this.ollama.generate({
                model: this.modelName,
                prompt: 'Hello, I want to order water',
                stream: false
            });
            
            console.log('✅ Model test successful!');
            console.log('Sample response:', testResponse.response.substring(0, 150) + '...');
            
            return true;
            
        } catch (error) {
            console.error('❌ Error creating Alayon model:', error.message);
            
            // Fallback: Try to use existing llama2 model with our prompts
            console.log('🔄 Falling back to using base model with prompt engineering...');
            return this.fallbackToBaseModel();
        }
    }

    // Generate the complete modelfile
    generateModelfile() {
        return `FROM llama2

SYSTEM """
You are "AlayonBot", the official AI assistant for Alayon Water Delivery Service in Cebu, Philippines.

BUSINESS INFORMATION:
- Name: Alayon Water Delivery Service
- Phone: (032) 123-4567
- Hours: 6:00 AM - 8:00 PM Daily
- Areas: Cebu City, Mandaue, Lapu-Lapu, Talisay
- Payment: Cash on Delivery, GCash, Bank Transfer

CRITICAL RULES:
1. ONLY use the exact response templates provided below
2. NEVER invent new responses or creative wording
3. ALWAYS match responses to user intent
4. USE TEMPLATES exactly as shown

RESPONSE TEMPLATES:

WELCOME GREETINGS:
- "Hello! Welcome to Alayon Water Delivery Service! 🌊 How can I help you today? You can book water delivery, refer friends, ask about products, or inquire about delivery."
- "Magandang umaga! Welcome to Alayon Water Delivery! 💧 How can I assist you today?"

WATER ORDER BOOKING:
- "Great! Let's get your water delivery scheduled. Are you looking for a one-time delivery or recurring subscription?"
- "Okay, one-time delivery! What type of water would you like? We have: 5-gallon Mineral Water (₱50), 5-gallon Purified Water (₱45), 1-gallon Bottled Water (₱25), 3-gallon Premium Water (₱120)"
- "Excellent choice! Our subscriptions save you 15%. What type of water would you like?"
- "Perfect! {water_type} selected. How many containers would you like?"
- "Got it! {bottle_quantity} container(s) of {water_type}. What's your full name for the delivery?"
- "Salamat, {customer_name}! What's your complete delivery address? (Street, Barangay, City)"
- "Noted! Delivery to {delivery_address}. What's your contact number for delivery updates?"
- "Thank you! Contact number {contact_phone} recorded. When would you like your delivery? (ASAP, today, specific date/time)"
- "ORDER SUMMARY 📝 - Name: {customer_name}, Address: {delivery_address}, Phone: {contact_phone}, Order: {bottle_quantity} × {water_type}, Delivery: {preferred_time}, Total: ₱{total_price}. Reply CONFIRM to schedule!"
- "✅ DELIVERY CONFIRMED! Your water delivery has been scheduled! Expected delivery: 2-4 hours. Driver will call before delivery."

REFERRAL PROGRAM:
- "🎉 REFER A FRIEND & EARN REWARDS! You get ₱100 credit, friend gets ₱50 off. Share code: ALAYON-{referral_code}"
- "📊 YOUR REFERRAL STATUS - Total Referrals: {referral_count}, Available Credits: ₱{credit_balance}"

PRODUCTS & SERVICES:
- "💧 ALAYON PRODUCTS: 5-gal Mineral ₱50, 5-gal Purified ₱45, 1-gal Bottled ₱25, 3-gal Premium ₱120. Dispensers available!"
- "📍 DELIVERY AREAS: Cebu City, Mandaue, Lapu-Lapu, Talisay. Free delivery for orders ₱200+"
- "⏰ DELIVERY TIME: 2-4 hours standard, 1-2 hours express (₱50 extra)"
- "💳 PAYMENT: Cash on Delivery, GCash, Bank Transfer, Maya"

FALLBACK MESSAGES:
- "I'm here to help with Alayon Water Delivery! You can ask about booking, referrals, products, delivery, or payment."
- "I'm not sure I understand. I help with water delivery booking, referrals, products, and delivery info."

CONVERSATION EXAMPLES:
User: hi
Assistant: Hello! Welcome to Alayon Water Delivery Service! 🌊 How can I help you today?

User: book water
Assistant: Great! Let's get your water delivery scheduled. Are you looking for a one-time delivery or recurring subscription?

User: what products
Assistant: 💧 ALAYON PRODUCTS: 5-gal Mineral ₱50, 5-gal Purified ₱45, 1-gal Bottled ₱25, 3-gal Premium ₱120. Dispensers available!

User: refer friend
Assistant: 🎉 REFER A FRIEND & EARN REWARDS! You get ₱100 credit, friend gets ₱50 off. Share code: ALAYON-{referral_code}

User: delivery areas
Assistant: 📍 DELIVERY AREAS: Cebu City, Mandaue, Lapu-Lapu, Talisay. Free delivery for orders ₱200+

Remember: Always use the exact templates above. Never invent new responses.
"""

PARAMETER temperature 0.1
PARAMETER top_k 40
PARAMETER top_p 0.7
PARAMETER num_ctx 4096`;
    }

    // Fallback to using base model with prompt engineering
    async fallbackToBaseModel() {
        console.log('🔄 Using base llama2 model with prompt engineering...');
        this.modelName = 'llama2';
        return true;
    }

    // Enhanced template matching with context awareness
    findMatchingTemplate(userMessage, userState) {
        const lowerMessage = userMessage.toLowerCase();
        let bestMatch = null;
        let highestScore = 0;

        // Check each template for matches
        this.trainingData.conversation_templates.forEach(template => {
            let score = this.calculateMatchScore(template, lowerMessage, userState);
            
            if (score > highestScore) {
                highestScore = score;
                bestMatch = template;
            }
        });

        // Apply threshold for matching
        return highestScore >= 2 ? bestMatch : null;
    }

    // Calculate match score based on multiple factors
    calculateMatchScore(template, lowerMessage, userState) {
        let score = 0;

        // Keyword matching
        template.user_input.forEach(pattern => {
            const cleanPattern = pattern.replace(/\*/g, '').toLowerCase().trim();
            
            if (pattern.includes('*')) {
                // Wildcard pattern
                if (lowerMessage.includes(cleanPattern) && cleanPattern.length > 2) {
                    score += 3;
                }
            } else if (lowerMessage === cleanPattern) {
                // Exact match
                score += 5;
            } else if (lowerMessage.includes(cleanPattern) && cleanPattern.length > 2) {
                // Partial match
                score += 2;
            }
        });

        // Context-based scoring
        if (this.isInBookingFlow(userState) && template.scenario.includes('booking')) {
            score += 3;
        }

        if (this.isInReferralFlow(userState) && template.scenario.includes('refer')) {
            score += 3;
        }

        // Check required fields availability
        const hasRequiredFields = template.required_fields.every(field => 
            userState[field] !== null && userState[field] !== undefined
        );

        if (hasRequiredFields) {
            score += 2;
        }

        return score;
    }

    // Check if user is in booking flow
    isInBookingFlow(userState) {
        return userState.water_type || userState.delivery_type;
    }

    // Check if user is in referral flow  
    isInReferralFlow(userState) {
        return userState.last_intent === 'referral';
    }

    // Generate response from template
    generateTemplateResponse(template, userState, userId) {
        let response = template.ai_response;

        // Replace all placeholders with actual data
        const replacements = {
            customer_name: userState.customer_name || '',
            delivery_address: userState.delivery_address || '',
            contact_phone: userState.contact_phone || '',
            water_type: userState.water_type || '',
            bottle_quantity: userState.bottle_quantity || '',
            delivery_type: userState.delivery_type || '',
            preferred_time: userState.preferred_time || '',
            total_price: this.calculatePrice(userState),
            referral_code: this.getReferralCode(userId),
            referral_count: this.getReferralCount(userId),
            credit_balance: this.getCreditBalance(userId),
            pending_credits: this.getPendingCredits(userId)
        };

        // Apply replacements
        Object.keys(replacements).forEach(key => {
            const placeholder = `{${key}}`;
            response = response.replace(new RegExp(placeholder, 'g'), replacements[key]);
        });

        // Handle confirmed fields
        if (response.includes('{confirmed_fields}')) {
            const confirmed = userState.confirmed_fields.join(', ') || 'no information yet';
            response = response.replace(/{confirmed_fields}/g, confirmed);
        }

        // Handle missing fields
        if (response.includes('{missing_fields}')) {
            const missing = this.getMissingFields(userState).join(', ');
            response = response.replace(/{missing_fields}/g, missing);
        }

        return response;
    }

    // Calculate order price
    calculatePrice(userState) {
        const prices = {
            'mineral': 50,
            'purified': 45,
            '1-gallon': 25,
            'premium': 120,
            '5-gallon': userState.water_type?.includes('mineral') ? 50 : 45
        };

        let basePrice = 0;
        
        // Find matching price
        Object.keys(prices).forEach(type => {
            if (userState.water_type?.toLowerCase().includes(type)) {
                basePrice = prices[type];
            }
        });

        // Default price
        if (basePrice === 0) basePrice = 50;

        const quantity = parseInt(userState.bottle_quantity) || 1;
        let total = basePrice * quantity;

        // Apply subscription discount
        if (userState.delivery_type === 'subscription') {
            total *= 0.85; // 15% discount
        }

        // Add delivery fee for small orders
        if (total < 200) {
            total += 30;
        }

        return Math.round(total);
    }

    // Referral system methods
    getReferralCode(userId) {
        const userRef = this.referralDatabase.get(userId) || this.referralDatabase.get('default_user');
        return userRef.referral_code;
    }

    getReferralCount(userId) {
        const userRef = this.referralDatabase.get(userId) || this.referralDatabase.get('default_user');
        return userRef.referral_count;
    }

    getCreditBalance(userId) {
        const userRef = this.referralDatabase.get(userId) || this.referralDatabase.get('default_user');
        return userRef.credit_balance;
    }

    getPendingCredits(userId) {
        const userRef = this.referralDatabase.get(userId) || this.referralDatabase.get('default_user');
        return userRef.pending_credits;
    }

    // Enhanced field extraction
    extractFieldFromMessage(message, userData) {
        const lowerMessage = message.toLowerCase();

        // Update last intent
        if (lowerMessage.includes('refer')) userData.last_intent = 'referral';
        if (lowerMessage.includes('book') || lowerMessage.includes('order')) userData.last_intent = 'booking';
        if (lowerMessage.includes('product') || lowerMessage.includes('price')) userData.last_intent = 'products';
        if (lowerMessage.includes('deliver')) userData.last_intent = 'delivery';

        // Extract name with multiple patterns
        const nameMatch = message.match(/(?:my name is|i'm|I am|ako si|pangalan ko|name is)\s+([A-Za-z\s]+?)(?:\s|\.|$)/i);
        if (nameMatch && !userData.customer_name) {
            userData.customer_name = nameMatch[1].trim();
            this.addConfirmedField(userData, 'customer_name');
        }

        // Extract address
        if ((lowerMessage.includes('address') || lowerMessage.includes('deliver to') || 
             lowerMessage.includes('sa ') || lowerMessage.includes('taga ')) && !userData.delivery_address) {
            userData.delivery_address = message;
            this.addConfirmedField(userData, 'delivery_address');
        }

        // Extract phone (Philippines format)
        const phoneMatch = message.match(/(09\d{9}|\+63\d{10}|\(\d{3}\)\s?\d{3}-\d{4})/);
        if (phoneMatch && !userData.contact_phone) {
            userData.contact_phone = phoneMatch[1];
            this.addConfirmedField(userData, 'contact_phone');
        }

        // Extract quantity
        const quantityWords = { 'isa': '1', 'dalawa': '2', 'tatlo': '3', 'apat': '4', 'lima': '5' };
        const quantityMatch = message.match(/(\d+)\s*(?:bottle|container|gallon|galon|order)/i) || 
                             message.match(/\b(one|two|three|four|five|isa|dalawa|tatlo|apat|lima)\b/i);
        if (quantityMatch && !userData.bottle_quantity) {
            let quantity = quantityMatch[1];
            quantity = quantityWords[quantity.toLowerCase()] || quantity;
            userData.bottle_quantity = quantity;
            this.addConfirmedField(userData, 'bottle_quantity');
        }

        // Extract water type
        const waterTypes = ['mineral', 'purified', '5-gallon', '1-gallon', 'premium', '3-gallon'];
        waterTypes.forEach(type => {
            if (lowerMessage.includes(type) && !userData.water_type) {
                userData.water_type = type;
                this.addConfirmedField(userData, 'water_type');
            }
        });

        // Extract delivery type
        if ((lowerMessage.includes('one-time') || lowerMessage.includes('single') || 
             lowerMessage.includes('isa lang') || lowerMessage.includes('today only')) && !userData.delivery_type) {
            userData.delivery_type = 'one-time';
            this.addConfirmedField(userData, 'delivery_type');
        } else if ((lowerMessage.includes('subscription') || lowerMessage.includes('regular') || 
                   lowerMessage.includes('every') || lowerMessage.includes('weekly') || 
                   lowerMessage.includes('monthly')) && !userData.delivery_type) {
            userData.delivery_type = 'subscription';
            this.addConfirmedField(userData, 'delivery_type');
        }

        // Extract delivery time
        const timeWords = { 'asap': 'ASAP', 'now': 'ASAP', 'today': 'Today', 'tomorrow': 'Tomorrow', 'bukas': 'Tomorrow', 'mamaya': 'Later today' };
        if (lowerMessage.includes('asap') || lowerMessage.includes('now') || lowerMessage.includes('today') || 
            lowerMessage.includes('tomorrow') || lowerMessage.includes('bukas') || lowerMessage.includes('mamaya')) {
            Object.keys(timeWords).forEach(key => {
                if (lowerMessage.includes(key) && !userData.preferred_time) {
                    userData.preferred_time = timeWords[key];
                    this.addConfirmedField(userData, 'preferred_time');
                }
            });
        }
    }

    addConfirmedField(userData, field) {
        if (!userData.confirmed_fields.includes(field)) {
            userData.confirmed_fields.push(field);
        }
    }

    getMissingFields(userData) {
        const requiredFields = [
            'customer_name', 'delivery_address', 'contact_phone', 
            'water_type', 'bottle_quantity', 'delivery_type', 'preferred_time'
        ];
        return requiredFields.filter(field => !userData[field]);
    }

    // Main message processing
    async processMessage(userId, userMessage) {
        // Get or initialize user state
        const userData = this.conversationHistory.get(userId) || {
            customer_name: null,
            delivery_address: null,
            contact_phone: null,
            water_type: null,
            bottle_quantity: null,
            delivery_type: null,
            preferred_time: null,
            last_intent: null,
            confirmed_fields: [],
            conversation: []
        };

        // Extract fields from current message
        this.extractFieldFromMessage(userMessage, userData);

        // Find matching template
        let matchingTemplate = this.findMatchingTemplate(userMessage, userData);
        let response, templateUsed;

        if (matchingTemplate) {
            // Use template-based response
            response = this.generateTemplateResponse(matchingTemplate, userData, userId);
            templateUsed = matchingTemplate.scenario;
        } else {
            // Use appropriate fallback
            const missingFields = this.getMissingFields(userData);
            if (missingFields.length > 0 && userData.last_intent === 'booking') {
                const fallbackTemplate = this.trainingData.conversation_templates.find(t => t.scenario === 'fallback_general');
                response = this.generateTemplateResponse(fallbackTemplate, userData, userId);
                templateUsed = 'fallback_booking';
            } else {
                const unknownTemplate = this.trainingData.conversation_templates.find(t => t.scenario === 'fallback_unknown');
                response = this.generateTemplateResponse(unknownTemplate, userData, userId);
                templateUsed = 'fallback_unknown';
            }
        }

        // Update conversation history
        userData.conversation.push({ 
            role: 'user', 
            content: userMessage,
            timestamp: new Date().toISOString()
        });
        userData.conversation.push({ 
            role: 'assistant', 
            content: response,
            timestamp: new Date().toISOString()
        });

        // Keep conversation manageable
        if (userData.conversation.length > 20) {
            userData.conversation = userData.conversation.slice(-20);
        }

        this.conversationHistory.set(userId, userData);

        return {
            response,
            currentState: userData,
            missingFields: this.getMissingFields(userData),
            templateUsed,
            isComplete: this.getMissingFields(userData).length === 0
        };
    }

    // Initialize the assistant
    async initialize() {
        await this.createAlayonModel();
        console.log('✅ Alayon Water Delivery AI Assistant Ready!');
        console.log('📍 Service Areas: Cebu City, Mandaue, Lapu-Lapu, Talisay');
        console.log('🕒 Operating Hours: 6:00 AM - 8:00 PM Daily');
        console.log('📞 Contact: (032) 123-4567\n');
    }

    // Get user conversation history
    getUserHistory(userId) {
        return this.conversationHistory.get(userId)?.conversation || [];
    }

    // Reset user conversation
    resetUserConversation(userId) {
        this.conversationHistory.delete(userId);
        return true;
    }
}

// Demo function
export async function runAlayonDemo() {
    const alayon = new AlayonWaterAssistant();
    await alayon.initialize();

    console.log('🚰 ALAYON WATER DELIVERY AI ASSISTANT DEMO\n');
    console.log('=' .repeat(50));

    const userId = 'demo_customer_001';
    const messages = [
        "Hi there!",
        "I want to book water delivery",
        "Subscription please",
        "Mineral water",
        "2 containers",
        "My name is Maria Santos",
        "123 Jones Avenue, Cebu City",
        "09171234567",
        "ASAP delivery",
        "CONFIRM"
    ];

    for (const message of messages) {
        console.log(`\n👤 Customer: ${message}`);
        const result = await alayon.processMessage(userId, message);
        console.log(`🤖 AlayonBot: ${result.response}`);
        console.log(`📊 Template: ${result.templateUsed} | Complete: ${result.isComplete}`);
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Show final state
    console.log('\n' + '='.repeat(50));
    console.log('📈 FINAL CONVERSATION SUMMARY');
    const finalState = alayon.conversationHistory.get(userId);
    console.log(`Total exchanges: ${finalState.conversation.length / 2}`);
    console.log(`Confirmed fields: ${finalState.confirmed_fields.join(', ')}`);
}

// Export for use in other files
export default AlayonWaterAssistant;

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAlayonDemo().catch(console.error);
}