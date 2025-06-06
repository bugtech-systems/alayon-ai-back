import { ResourceTag } from "../models/resourceTag.model.js";
import { extractFieldsWithOllama } from "../utils/extractFieldWithOllama.js";
import axios from "axios";

const sessionStore = {};

const getSession = (sessionId) => {
    if (!sessionStore[sessionId]) {
        sessionStore[sessionId] = {
            organization: null,
            resourceType: null,
            resourceIntent: null,
            resourceFields: [],
            resourceValues: {},
            resourceOptions: {},
            step: 'organization',
            query: null,
            history: [],
        };
        console.log(`[Session] New session created: ${sessionId}`);
    } else {
        console.log(`[Session] Existing session loaded: ${sessionId}`);
    }
    return sessionStore[sessionId];
};

const determineNextStep = (session) => {
    if (!session.organization) return 'organization';
    if (!session.resourceType) return 'resourceType';
    if (!session.resourceIntent) return 'resourceIntent';
    if (session.resourceIntent === 'view') return 'viewQuery';
    if (session.resourceFields.length === 0) return 'resourceFields';
    if (Object.keys(session.resourceValues).length < session.resourceFields.length) return 'resourceValues';
    return 'done';
};

const buildSystemPrompt = async (session) => {
    const basePrompt = `You are Alayon AI, a helpful assistant for managing user resources.
Respond with short, casual questions or confirmations based on the user’s current step.
NEVER explain your answers. Use short, clear messages only.`;

    const organizations = await ResourceTag.find({ resourceType: { $regex: /^organizations$/i } }).lean();
    const orgList = organizations.map((o) => o.name).join(', ') || 'None';
    const resourceTypes = await ResourceTag.distinct('resourceType');
    const typeList = resourceTypes.filter(t => t.toLowerCase() !== 'organizations').join(', ') || 'None';

    if (!session.organization) {

        return `${basePrompt}\nAvailable organizations: ${orgList}.`

    } else if (!session.resourceType) {

        return `${basePrompt}\nAvailable resource types: ${typeList}.`;
    } else {
        const resourceType = await ResourceTag.findOne({
            resourceType: { $regex: new RegExp(session.resourceType, 'i') }, // partial, case-insensitive
        });

        for (let field of resourceType.fields) {
            if (field.dataType == 'select') {
                let options = await ResourceTag.find({
                    resourceType: { $regex: new RegExp(field.fieldName, 'i') }, // partial, case-insensitive
                    name: { $ne: 'config' }
                }, { name: 1, values: 1 });
                session.resourceOptions[field.fieldName] = options.map(a => { return a?.values.find(ab => ab.fieldName == 'value').value });
            }
        }

        return `${basePrompt}\nOrganization: ${session.organization}.\nResource type: ${session.resourceType}.\nRequired Fields: ${resourceType.fields}.\n`;
    }
};

export const chatPrompt = async (req, res) => {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
        return res.status(400).json({ error: 'sessionId and message are required.' });
    }

    const session = getSession(sessionId);
    session.history.push({ role: 'user', content: message });
    const lower = message.toLowerCase();

    try {
        // Step 1: AI Prompting
        const systemPrompt = await buildSystemPrompt(session);
        console.log(systemPrompt)
        const conversationContext = [
            { role: 'system', content: systemPrompt },
            ...session.history.slice(-10),
        ];

        const ollamaResponse = await axios.post('http://127.0.0.1:11434/api/chat', {
            model: 'mistral',
            messages: conversationContext,
            stream: false,
        });

        const reply = ollamaResponse.data.message.content.trim();
        console.log('[AI Reply]', reply);

        // Step 2: Auto-match inputs
        if (!session.organization) {
            const orgs = await ResourceTag.find({ resourceType: { $regex: /^organizations$/i } }).lean();
            const match = orgs.find(o => lower.includes(o.name.toLowerCase()));
            if (match) session.organization = match.name;
        }

        if (!session.resourceType) {
            const types = await ResourceTag.distinct('resourceType');
            const match = types.find(t => lower.includes(t.toLowerCase()) && t.toLowerCase() !== 'organizations');
            if (match) session.resourceType = match;
        }

        if (!session.resourceIntent) {
            const intentMatch = ['create', 'update', 'view', 'delete'].find(intent => lower.includes(intent));
            if (intentMatch) session.resourceIntent = intentMatch;
        }

        // Step 3: Load fields from schema if needed
        if (session.resourceType && session.resourceFields.length === 0) {
            const typeDef = await ResourceTag.findOne({ resourceType: session.resourceType }).lean();
            if (typeDef?.fields) {
                session.resourceFields = typeDef.fields.map(f => f.fieldName);
            }
        }

        // Step 4: Use AI to extract field values
        if (
            session.resourceIntent === 'create' &&
            session.resourceFields.length &&
            Object.keys(session.resourceValues).length < session.resourceFields.length
        ) {
            const aiResult = await extractFieldsWithOllama(session.resourceType, message);

            session.resourceValues = { ...session.resourceValues, ...aiResult.extracted };
        }

        if (
            session.resourceIntent === 'view' &&
            session.resourceFields.length &&
            !session.query
        ) {
            const aiResult = await extractFieldsWithOllama(session.resourceType, message);
            if (Object.keys(aiResult.extracted).length) {
                session.query = aiResult.extracted;
            }
        }

        session.step = determineNextStep(session);

        // Step 5: Generate next follow-up question
        let followUp = '';
        switch (session.step) {
            case 'organization':
                followUp = 'Which organization are you from?';
                break;
            case 'resourceType':
                followUp = `What type of resource are you managing?`;
                break;
            case 'resourceIntent':
                followUp = `Do you want to create, view, update, or delete this ${session.resourceType}?`;
                break;
            case 'viewQuery':
                followUp = `What are you looking for in ${session.resourceType}?`;
                break;
            case 'resourceFields':
                followUp = `What fields should this ${session.resourceType} include?`;
                break;
            case 'resourceValues':
                const nextField = session.resourceFields.find(f => !(f in session.resourceValues));
                if (session.resourceOptions[nextField]) {
                    followUp = `What's the value for "${nextField}"? available options (${session.resourceOptions[nextField]})`;
                } else {
                    followUp = `What's the value for "${nextField}"?`;
                }
                break;
            case 'done':

                followUp = `All done! Want me to save this ${session.resourceType}?`;
                break;
        }

        session.history.push({ role: 'assistant', content: followUp });

        // Step 6: Return structured result
        const query = session.resourceIntent === 'create'
            ? { resourceType: session.resourceType, values: session.resourceValues }
            : session.resourceIntent === 'view'
                ? { resourceType: session.resourceType, search: session.query }
                : {};



        res.json({
            reply,
            message: followUp,
            query,
            metadata: {
                step: session.step,
                resourceType: session.resourceType,
                intent: session.resourceIntent,
            },
            session: sessionStore[sessionId],
        });
    } catch (err) {
        console.error('[Error] chatPrompt failed:', err);
        res.status(500).json({ error: 'AI processing failed.' });
    }
};
