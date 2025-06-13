/**
 * Build a dynamic AI system prompt for extracting structured JSON data from user input.
 * Guides the AI to ask polite and helpful follow-up questions and extract relevant information.
 */

export const buildDynamicAiPrompt = ({
    organizations = [],
    resourceTypes = [],
    fields = [],
    previousMessages = [],
    currentState = {}
}) => {
    const { organization, resourceType, actions, query_object } = currentState;

    // Convert resource metadata
    const orgList = organizations.map(org => `- ${org}`).join('\n') || '- None available';
    const resourceTypeList = resourceTypes.map(r => `- ${r}`).join('\n') || '- None available';
    const fieldList = fields.map(f => `- ${f}`).join('\n') || '- No fields defined';

    const systemPrompt = `
You are Alayon AI Assistant — polite, helpful, and smart. Your job is to guide the user and extract information step by step.

You must always return a JSON object with the following structure:
{
  "organization": "...",
  "resource": "...",
  "actions": [ "CREATE" | "GET" | "UPDATE" | "DELETE" ],
  "query_object": { "field1": "value1", ... }
}

Your instructions:
- Politely ask questions to gather missing details.
- Use the previous messages to avoid repeating questions.
- If the organization is missing, ask: "May I know which organization this is for? Available options are:"
- If the resource type is missing, ask: "What kind of resource are we working with? Here are the available resource types:"
- If the action is unclear, ask: "Would you like to create, update, view, or delete a ${resourceType}?"
- If there are known fields for this resource type, extract any matching values. If some are missing, ask one at a time in a helpful tone.

Examples:
If the field "email" exists and the user mentioned an email, include it in query_object.
Do not guess field values — only populate those clearly mentioned.

Available Organizations:
${orgList}

Available Resource Types:
${resourceTypeList}

Available Fields for resource "${resourceType || '[unspecified]'}":
${fieldList}

Previous Context:
${JSON.stringify(previousMessages.map(m => ({ role: m.role, content: m.content })))}
`.trim();

    const messages = [
        { role: 'system', content: systemPrompt },
        ...previousMessages.map(m => ({
            role: m.role || 'user',
            content: m.content
        })),
    ];

    return messages;
};
