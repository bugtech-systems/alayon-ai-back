const express = require('express');
const router = express.Router();
const axios = require('axios');
const Resource = require('../models/Resource');

const sessionStore = {};

const getSession = (sessionId) => {
    if (!sessionStore[sessionId]) {
        sessionStore[sessionId] = {
            organization: null,
            resourceType: null,
            resourceFields: [],
            resourceValues: {},
            step: 'organization',
            history: [],
        };
    }
    return sessionStore[sessionId];
};

const determineNextStep = (session) => {
    if (!session.organization) return 'organization';
    if (!session.resourceType) return 'resourceType';
    if (session.resourceFields.length === 0) return 'resourceFields';
    if (Object.keys(session.resourceValues).length < session.resourceFields.length) {
        return 'resourceValues';
    }
    return 'done';
};

const buildSystemPrompt = async (session) => {
    const basePrompt = `You are a helpful and casual AI assistant that helps users manage their resources in a database.`;

    const organizations = await Resource.find({ resourceType: 'organization' }).lean();
    const orgList = organizations.map((o) => o.name).join(', ') || 'None yet';

    const resourceTypes = await Resource.distinct('resourceType');
    const typeList = resourceTypes.filter(t => t !== 'organization').join(', ') || 'None available';

    return `${basePrompt}
Here are available organizations: ${orgList}.
Available resource types: ${typeList}.
Collect all necessary information like organization, resourceType, fields, and values one by one.
Respond casually and guide the user step-by-step.`;
};

router.post('/chat', async (req, res) => {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
        return res.status(400).json({ error: 'sessionId and message are required.' });
    }

    const session = getSession(sessionId);
    session.history.push({ role: 'user', content: message });

    try {
        const systemPrompt = await buildSystemPrompt(session);
        const conversationContext = [
            { role: 'system', content: systemPrompt },
            ...session.history.slice(-10),
        ];

        const ollamaResponse = await axios.post('http://localhost:11434/api/chat', {
            model: 'mistral',
            messages: conversationContext,
            stream: false,
        });

        const reply = ollamaResponse.data.message.content;

        const lower = message.toLowerCase();

        if (!session.organization) {
            const orgs = await Resource.find({ resourceType: 'organization' }).lean();
            const matched = orgs.find(o => lower.includes(o.name.toLowerCase()));
            if (matched) session.organization = matched.name;
        } else if (!session.resourceType) {
            const resourceTypes = await Resource.distinct('resourceType');
            const matched = resourceTypes.find(t => lower.includes(t.toLowerCase()) && t !== 'organization');
            if (matched) session.resourceType = matched;
        } else if (session.resourceFields.length === 0 && lower.includes('fields')) {
            session.resourceFields = message.split(':')[1]?.split(',').map(f => f.trim()) || [];
        } else if (session.resourceFields.length > 0) {
            for (const field of session.resourceFields) {
                if (lower.includes(field.toLowerCase())) {
                    session.resourceValues[field] = message.split(':')[1]?.trim() || '';
                }
            }
        }

        session.step = determineNextStep(session);

        let followUp = '';
        switch (session.step) {
            case 'organization':
                followUp = 'Let’s start! What is your organization? You can pick from the listed options.';
                break;
            case 'resourceType':
                followUp = `Awesome! Now, what type of resource would you like to manage?`;
                break;
            case 'resourceFields':
                followUp = `Great! What fields do you want this ${session.resourceType} to have? (e.g. name, price, quantity)`;
                break;
            case 'resourceValues':
                const nextField = session.resourceFields.find(f => !(f in session.resourceValues));
                followUp = `Cool! What’s the value for "${nextField}"?`;
                break;
            case 'done':
                followUp = `You're all set! I have everything I need. Would you like to save this to the database or do something else?`;
                break;
        }

        session.history.push({ role: 'assistant', content: reply + '\n\n' + followUp });

        res.json({
            reply,
            followUp,
            session,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'AI processing failed.' });
    }
});

module.exports = router;
