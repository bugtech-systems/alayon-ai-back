import axios from "axios";
import { ResourceTag } from "../models/resourceTag.model.js";
import { getOrganizations, getResourceTypes, getResourceFields } from "../services/resourceService.js"

const sessionStore = {};

const initSession = (sessionId) => {
    if (!sessionStore[sessionId]) {
        sessionStore[sessionId] = {
            organization: null,
            resource: null,
            action: null,
            resourceFields: [],
            resourceValues: {},
            query_object: {},
            confirmed: false,
            history: [],
        };
    }
    return sessionStore[sessionId];
};

const buildStructuredPrompt = async (session, message) => {
    const organizations = await getOrganizations();
    const resourceTypes = await getResourceTypes({ excludeOrganizations: true });

    const selectedFields = session.resourceFields || [];
    const existingValues = session.resourceValues || {};
    const missingFields = selectedFields.filter(f => !existingValues[f]);

    const orgOptions = organizations.map(o => o.name).join(', ') || 'None';
    const resourceOptions = resourceTypes.join(', ') || 'None';
    console.log(resourceTypes, session, 'SSS', existingValues, orgOptions, resourceOptions)
    const systemInstructions = `
You are a helpful, polite AI assistant. You are helping a user manage a structured data resource system.

You must:
- Never assume any value unless the user explicitly provides it.
- Use session context to track: organization, resource, action (create, update, get, delete), and query_object.
- If resource is selected, you must identify missing required fields and ask them all in one formatted follow-up.
- Format follow-up questions clearly with field labels.
- Use a friendly and helpful tone.

Always respond with a JSON object without extra text and descriptions:
{
  organization: string | null,
  resource: string | null,
  action: string | null,
  query_object: { [fieldName]: value },
  followup: string
}


Context:
- Available organizations: ${orgOptions}
- Available resources: ${resourceOptions.length ? resourceOptions : 'No resources available'}
- Selected resource fields: ${selectedFields.join(', ') || 'None yet'}
- Already provided values: ${JSON.stringify({ ...session, ...existingValues }, null, 2)}
- Current message: "${message}"

Objective:
-Ask to select which organization hi wants to interact or populate to create new resource.
-Once organization is provided, Ask What resources and what to do with the resource by asking the action.
-Once resource is selected, Ask for all missing fields in a formatted followup question for all missing fields.
-Base on the available resources populate what resources the prompt intended to use.
-Base on the prompt select action from Get, Create, Update, Delete
`;

    return [
        { role: "system", content: systemInstructions },
        ...session.history.slice(-10),
        { role: "user", content: message }
    ];
};

export const processDynamicChat = async (req, res) => {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
        return res.status(400).json({ error: "sessionId and message are required." });
    }

    const session = initSession(sessionId);
    session.history.push({ role: "user", content: message });

    try {
        // If resource is already selected, fetch its fields
        if (session.resource && session.resourceFields.length === 0) {
            const fields = await getResourceFields(session.resource);
            session.resourceFields = fields;
        }

        const prompt = await buildStructuredPrompt(session, message);

        const aiRes = await axios.post("http://127.0.0.1:11434/api/chat", {
            model: "mistral",
            messages: prompt,
            stream: false,
            options: {
                temperature: 0.5,
                top_p: 0.9,
                num_predict: 500
            }
        });

        const aiReply = aiRes.data.message.content.trim();
        let parsed;

        try {
            parsed = JSON.parse(aiReply);
        } catch (err) {
            return res.status(400).json({ error: "AI did not return valid JSON.", raw: aiReply });
        }

        // Update session from parsed response
        session.organization = parsed.organization || session.organization;
        session.resource = parsed.resource || session.resource;
        session.action = parsed.action || session.action;

        if (parsed.query_object) {
            for (const [key, val] of Object.entries(parsed.query_object)) {
                if (session.resourceFields.includes(key)) {
                    session.resourceValues[key] = val;
                }
            }
        }

        console.log(parsed, 'PARRSE')

        // Determine if ready to perform DB operation
        const allFieldsFilled = session.resourceFields.length > 0 &&
            session.resourceFields.every(f => session.resourceValues[f]);

        if (session.action && session.resource && allFieldsFilled && !session.confirmed) {
            // Compose confirmation message
            const summary = Object.entries(session.resourceValues)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join('\n');

            const followup = `You've selected to ${session.action} a ${session.resource} under "${session.organization}".\nHere are the details:\n${summary}\n\nReply "confirm" to proceed or let me know if you want to make changes.`;

            session.confirmed = true;

            session.history.push({ role: "assistant", content: followup });

            return res.json({
                session,
                message: followup,
                query_object: session.resourceValues,
                action: session.action,
                resource: session.resource,
                organization: session.organization
            });
        }

        if (message.trim().toLowerCase() === "confirm" && session.confirmed) {
            // Perform DB operation
            if (session.action === 'create') {
                const doc = new ResourceTag({
                    resourceType: session.resource,
                    values: Object.entries(session.resourceValues).map(([k, v]) => ({ fieldName: k, value: v })),
                    relationships: [],
                    resourceParent: null
                });
                await doc.save();
                return res.json({ message: `✅ ${session.resource} successfully created.`, data: doc });
            }

            // TODO: Add more DB operations (update, get, delete) as needed
        }

        // Add AI follow-up
        session.history.push({ role: "assistant", content: parsed.followup });

        res.json({
            session,
            message: parsed.followup,
            query_object: session.resourceValues,
            action: session.action,
            resource: session.resource,
            organization: session.organization
        });

    } catch (err) {
        console.error("AI or DB error:", err.message);
        return res.status(500).json({ error: "Failed to process prompt." });
    }
};
