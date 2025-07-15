
import { Ollama } from 'ollama';
import aiService from './aiServices.js';
import { findResourceByName, getResourceOptions, getResourceTypes } from './ResourceService.js';

// Initialize Ollama client
const ollamaClient = new Ollama({
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
});

export default class AgenticAIService {
    constructor(db) {
        this.db = db;
        this.models = db;
        // this.initializeModel();
    }

    // _initModels() {
    //     const Conversation = this.db.define('Conversation', {
    //         id: {
    //             type: Sequelize.UUID,
    //             defaultValue: Sequelize.UUIDV4,
    //             primaryKey: true,
    //         },
    //         title: {
    //             type: Sequelize.STRING,
    //             allowNull: false,
    //         },
    //         metadata: {
    //             type: Sequelize.JSONB,
    //             defaultValue: {},
    //         },
    //         createdAt: {
    //             type: Sequelize.DATE,
    //             defaultValue: Sequelize.NOW,
    //         },
    //         updatedAt: {
    //             type: Sequelize.DATE,
    //             defaultValue: Sequelize.NOW,
    //         },
    //     });

    //     const Message = this.db.define('Message', {
    //         id: {
    //             type: Sequelize.UUID,
    //             defaultValue: Sequelize.UUIDV4,
    //             primaryKey: true,
    //         },
    //         role: {
    //             type: Sequelize.ENUM('user', 'assistant', 'system'),
    //             allowNull: false,
    //         },
    //         content: {
    //             type: Sequelize.TEXT,
    //             allowNull: false,
    //         },
    //         metadata: {
    //             type: Sequelize.JSONB,
    //             defaultValue: {},
    //         },
    //         tokens: {
    //             type: Sequelize.INTEGER,
    //             defaultValue: 0,
    //         },
    //         createdAt: {
    //             type: Sequelize.DATE,
    //             defaultValue: Sequelize.NOW,
    //         },
    //     });

    //     // Define relationships
    //     Conversation.hasMany(Message, { onDelete: 'CASCADE' });
    //     Message.belongsTo(Conversation);

    //     return { Conversation, Message };
    // }

    // async initializeModel() {
    //     try {
    //         const models = await ollamaClient.list();
    //         if (!models.models.some(m => m.name.includes('mistral'))) {
    //             console.log('Pulling Mistral model...');
    //             await ollamaClient.pull({ model: 'mistral' });
    //         }
    //         console.log('Mistral model ready');
    //     } catch (error) {
    //         console.error('Model initialization error:', error);
    //         throw error;
    //     }
    // }

    // Conversation CRUD Operations

    async createConversation(sessionId, title = 'New Conversation', metadata = {}) {
        try {
            const conversation = await this.models.Conversation.create({
                title,
                sessionId,
                metadata
            });
            return conversation;
        } catch (error) {
            console.error('Error creating conversation:', error);
            throw error;
        }
    }

    async getConversationsById(identifier, includeMessages = true) {
        try {

            // Determine if identifier is UUID (id) or sessionId (string)
            // const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);

            const options = {
                where: { sessionId: identifier },
                order: [['created_at', 'DESC']],

            };


            /*          if (includeMessages) {
                         options.include = [{
                             model: this.models.Message,
                             as: 'messages',
                             order: [['createdAt', 'ASC']],
                         }];
                     } */

            const conversation = await this.models.Conversation.findAll(options);
            return conversation;
        } catch (error) {
            console.error('Error getting conversation:', error);
            throw error;
        }
    }

    async getAllConversations(limit = 20, offset = 0) {
        try {
            const conversations = await this.models.Conversation.findAll({
                order: [['updatedAt', 'DESC']],
                limit,
                offset,
                include: [{
                    model: this.models.Message,
                    as: 'Messages',
                    limit: 1,
                    order: [['createdAt', 'DESC']],
                }],
            });
            return conversations;
        } catch (error) {
            console.error('Error getting conversations:', error);
            throw error;
        }
    }

    async updateConversation(id, updates) {
        try {
            const [affectedRows] = await this.models.Conversation.update(updates, {
                where: { id },
                returning: true,
            });

            if (affectedRows === 0) {
                throw new Error('Conversation not found or no updates made');
            }

            return await this.getConversationsById(id);
        } catch (error) {
            console.error('Error updating conversation:', error);
            throw error;
        }
    }

    async deleteConversation(id) {
        try {
            const conversation = await this.getConversationsById(id);
            if (!conversation) {
                throw new Error('Conversation not found');
            }

            await this.models.Message.destroy({ where: { ConversationId: id } });
            await conversation.destroy();
            return true;
        } catch (error) {
            console.error('Error deleting conversation:', error);
            throw error;
        }
    }

    // Message Operations

    async addUserMessage(conversationId, content, metadata = {}) {
        try {

            const conversation = await this.getConversationsById(conversationId);
            if (!conversation) {
                throw new Error('Conversation not found');
            }

            const message = await this.models.Message.create({
                role: 'user',
                content,
                metadata,
                conversation_id: conversation.id,
                rate: 4

            });


            // Update conversation timestamp
            await conversation.update({ updatedAt: new Date() });

            return message;
        } catch (error) {
            console.error('Error adding user message:', error);
            throw error;
        }
    }

    async generateAIResponse(session, prompt, options = {
        temperature: 0.2,
        num_ctx: 4096
    }) {
        try {
            // const conversations = await this.getConversationsById(session.id, true);
            /*      if (!conversations || conversations.length) {
                     throw new Error('Conversation not found');
                 } */
            let formatInstructions = session.template?.ai_config
            let formatCondition = session.template?.conditions
            let resourceName = session.resourceName;
            let context = session?.context;
            let today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));

            console.log(resourceName, 'resourceName')
            let resource = await findResourceByName(resourceName);
            console.log(resource, 'resource')

            let selectFields = resource?.fields.filter(a => a.data_type == 'select').map(a => a.options_resource_type);
            let options = await getResourceOptions(selectFields);

            const userPrompt = `
            Available Fields: ${session.template?.parameters.map(a => a.name).join(', ')}
            Field Options: ${JSON.stringify(options, null, 2)}
            RESOURCE NAME: ${resourceName}
            PREVIOUS CONTEXT: ${JSON.stringify(context, null, 2)}
            QUERY CONDITION: ${JSON.stringify(formatCondition, null, 2)}
            
            
            Input Text: ${prompt}
            
            Additional Instructions:
            - Consider previous context if available.
            ${formatInstructions ? `- ${formatInstructions}` : ''}
            - Select only from Field Options the Allowed value for fields with Options.
            - for date reference, date today is ${new Date(today).toISOString()}
        }
            `.trim();



            const conversations = session.history;

            // Prepare messages for Mistral
            const messages = [];

            conversations.map(m => {
                messages.push({
                    role: m.role,
                    content: m.content
                })
            });

            messages.push({
                role: 'user',
                content: userPrompt
            })

            // Generate AI response
            const response = await ollamaClient.chat({
                model: 'alayon_pg',
                messages,
                format: 'json',
                options: {
                    ...options
                },
            });



            let resJson = JSON.parse(response.message.content)
            // Save AI response
            const aiMessage = await this.models.Conversation.create({
                title: 'alayon_pg',
                prompt: userPrompt,
                response: response.message.content,
                sessionId: session.id,
                metadata: resJson,
                tokens: response.message.tokens || 0,
                rate: 0
            });

            // Update conversation timestamp
            // await conversation.update({ updatedAt: new Date() });
            return aiMessage;
        } catch (error) {
            console.error('Error generating AI response:', error);
            throw error;
        }
    }

    async chat(session, userMessage, options = {}) {
        try {
            // Add user message
            // await this.addUserMessage(conversationId, userMessage, options);




            // Generate AI response
            const aiMessage = await this.generateAIResponse(session, userMessage, options);















            return aiMessage;
        } catch (error) {
            console.error('Error in chat:', error);
            throw error;
        }
    }

    async getConversationMessages(conversationId, limit = 50, offset = 0) {
        try {
            const messages = await this.models.Message.findAll({
                where: { ConversationId: conversationId },
                order: [['createdAt', 'ASC']],
                limit,
                offset,
            });
            return messages;
        } catch (error) {
            console.error('Error getting messages:', error);
            throw error;
        }
    }

    // Advanced AI Operations

    async summarizeConversation(conversationId) {
        try {
            const messages = await this.getConversationMessages(conversationId);
            const conversationText = messages
                .map(m => `${m.role}: ${m.content} `)
                .join('\n');

            const response = await ollamaClient.generate({
                model: 'mistral',
                prompt: `Summarize this conversation in 2 - 3 sentences: \n\n${conversationText} `,
                options: {
                    temperature: 0.3,
                },
            });

            return response.response;
        } catch (error) {
            console.error('Error summarizing conversation:', error);
            throw error;
        }
    }

    async suggestNextSteps(conversationId) {
        try {
            const messages = await this.getConversationMessages(conversationId);
            const conversationText = messages
                .map(m => `${m.role}: ${m.content} `)
                .join('\n');

            const response = await ollamaClient.generate({
                model: 'mistral',
                prompt: `Based on this conversation, suggest 3 - 5 next steps the user might take: \n\n${conversationText} `,
                options: {
                    temperature: 0.5,
                },
            });

            return response.response;
        } catch (error) {
            console.error('Error suggesting next steps:', error);
            throw error;
        }
    }
}