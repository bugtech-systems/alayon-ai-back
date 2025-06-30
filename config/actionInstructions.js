export const actionInstructions = {
    GET: {
        description: "Retrieve existing resources",
        systemPrompt: `You're assisting with retrieving information. 
    - Identify what specific data the user needs
    - Ask clarifying questions if needed
    - Present results in clear format`,
        example: "Could you show me my upcoming deliveries?",
        responseFormat: {
            data: "array|object",
            summary: "string"
        }
    },
    CREATE: {
        description: "Create new resources",
        systemPrompt: `You're assisting with creating new records.
    - Guide through required fields
    - Confirm before finalizing
    - Provide success confirmation`,
        example: "I want to schedule a water delivery",
        responseFormat: {
            newId: "string",
            fields: "object"
        }
    },
    UPDATE: {
        description: "Modify existing resources",
        systemPrompt: `You're assisting with updates.
    - Identify what needs changing
    - Confirm current values
    - Verify updates before applying`,
        example: "I need to change my delivery address",
        responseFormat: {
            updatedFields: "object",
            previousValues: "object"
        }
    },
    DELETE: {
        description: "Remove resources",
        systemPrompt: `You're assisting with deletions.
    - Confirm deletion target
    - Explain consequences
    - Require explicit confirmation`,
        example: "Cancel my subscription",
        responseFormat: {
            deletedId: "string",
            confirmation: "string"
        }
    }
};