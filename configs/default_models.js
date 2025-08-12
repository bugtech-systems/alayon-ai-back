export const default_models = [
   {
      model: 'alayon_template',
      from: 'mistral:latest',
      stream: false, // Set to true if you want streaming responses
      parameters: {
         temperature: 0.0,
         num_ctx: 4096
      },
      system: `Role: You are a template-driven action generator. Your outputs must be exact, deterministic, and strictly derived from the provided template and conversation context.

### Core Rules:
1. **Template Adherence**  
   - Use ONLY fields defined in the ""action_type"" template. Never invent fields.  
   - Maintain the exact template structure (including nested objects).  

2. **Placeholder Handling**  
   - Replace placeholders (""{{ params.x }}"", ""{{outputs.x }}"") **only** if the value exists in the conversation.  
   - Preserve the original placeholder string if no value is found (e.g., ""{{ params.user.email }} "" remains unchanged).  

3. **Parameter Extraction**  
   - Populate the ""parameters"" object with **raw extracted values** from the conversation.  
     - Example: If the conversation says "email to test@test.com", extract ""{ "user.email": "test@test.com" } "".  
   - Never modify or infer values. Exact matches only.  

4. **Field Constraints**  
   - If ""field_options"" are provided, the extracted value must match one of the options. Otherwise, set to ""null"".  
   - Validate string formats (e.g., email, URL) if specified in the template.  
 `,
      // template: '{{ if .System }}### SYSTEM: {{ .System }}{{ end }}\n\n### CONTEXT:\n{{ .Context }}\n\n### QUESTION:\n{{ .Prompt }}\n\n### ANSWER:\n{{ .Response }}',
      messages: [
         // Few-shot learning examples

      ]
   },
   {
      model: 'alayon_action',
      from: 'mistral:latest',
      stream: false, // Set to true if you want streaming responses
      system: `
      You are a deterministic action - selection engine.Analyze user prompts and conversation context to:
1. Strictly select ONLY from provided "allowed_templates" and "allowed_resource_names"
2. Refine prompts into token - efficient forms while preserving meaning
3. Detect execution triggers
4. Return validated JSON output
5. Strictly select resource type

# Core Rules
1. ** Selection Protocol **
   - Match prompts EXCLUSIVELY to provided templates and resource_names
      - For partial matches:
- Confidence 1 - 2: Require clarification
   - Confidence 3 - 5: Select best match
      - Never invent / assume values outside context

2. ** Prompt Refinement **
   - Remove filler words("could you", "please")
      - Replace pronouns with nouns("it" → "the invoice")
      - Compress lists to arrays("A, B and C" →["A", "B", "C"])
      - Maintain ALL original intent / details

3. ** Trigger Detection **
   | Trigger Type | Detection Pattern | Config Format |
   | -----------------| --------------------------------| --------------------|
   | IMMEDIATE | (default)                      | {} |
   | COUNTDOWN | "in X [seconds/minutes/hours]" | { "delay_seconds": N } |
   | SCHEDULED | "at [time]" / "on [date]" | { "datetime": ISO } |
   | RECURRING | "every [interval]" | { "cron": "rule" } |

3. ** Resource Type **
- config: Require for setup resource or new resource collection
   - resource: Require for resource record (default)
      - connect: Require for relating resources to each other
`,
      parameters: {
         temperature: 0.1,
         num_ctx: 4096
      },
      messages: []
   }

]

export const default_schema = {
   config: {
      resource_name: { type: 'string', required: true },
      fields: {
         type: 'array',
         required: true,
         itemSchema: {
            field_name: { type: 'string', required: true },
            data_type: { type: 'string', required: true },
            is_required: { type: 'boolean', default: false },
            is_unique: { type: 'boolean', default: false },
            // validations: { type: 'array', default: [] }
         }
      }
   },
   resource: {
      "resource-type": { type: 'string', default: 'resource' },
      "resource-name": { type: 'string', required: true },
      attributes: {
         type: 'object',
         required: true,
         schema: {
            name: { type: 'string', required: true },
            type: { type: 'string' },
            address: { type: 'string' }
         }
      },
      conditions: { type: 'array', default: [] }
   },
   relationship: {
      relationship_name: { type: 'string', required: true },
      source_resource_id: { type: 'number', required: true },
      target_resource_id: { type: 'number', required: true },
      relationship_type: {
         type: 'string',
         required: true,
         enum: ['config', 'reference', 'ownership']
      },
      aggregations: { type: 'array', default: [] }
   }
};



export const DEFAULT_MODELS = [
   {
      name: 'template_engine',
      model_name: "template_engine",
      base_model: 'mistral:latest',
      system_instruction: `Role: Template-driven action generator with strict output adherence

## Core Rules:
1. TEMPLATE COMPLIANCE
   - Use ONLY fields defined in the "action_type" template
   - Maintain exact template structure (including nested objects)

2. PLACEHOLDER HANDLING
   - Replace {{params.x}}/{{outputs.x}} ONLY when values exist
   - Preserve original placeholders when no match found

3. PARAMETER EXTRACTION
   - Populate "parameters" with raw conversation values
   - Never modify or infer values (exact matches only)
   
4. FIELD VALIDATION
   - Validate against "field_options" when provided
   - Enforce string formats (email, URL) when specified
`,
      output_schema: {
         action_type: "string (predefined template name)",
         parameters: "object (key-value pairs from config or conversation)",
         template_output: "object (template with values applied)",
         missing_fields: "string[] (required but missing fields)",
         confidence_score: "number (0-1)"
      },
      options: {
         action_type: ["Email", "SMS", "API_Call", "DB_Query", "Speak"]
      },
      parameters: {
         temperature: 0.2,
         num_ctx: 4096,
         //     num_predict: 512
      },
      anti_hallucination_rules: [
         "Never invent template fields",
         "Never invent resource_name value",
         "Preserve placeholder syntax when no match exists",
         "Reject ambiguous parameter extractions"
      ],
      messages: [
         // Email Template Use Cases
         {
            role: "user",
            content: "Send an email to jane.doe@company.com with subject 'Project Update' and body 'The deadline has been extended to Friday.'"
         },
         {
            role: "assistant",
            content: `{
      "action_type": "EMAIL",
      "parameters": {
        "to": "jane.doe@company.com",
        "subject": "Project Update",
        "body": "The deadline has been extended to Friday."
      },
      "template_output": {
        "to": "jane.doe@company.com",
        "subject": "Project Update",
        "body": "The deadline has been extended to Friday."
      },
      "missing_fields": [],
      "confidence": 5
    }`
         },
         {
            role: "user",
            content: "Speak a message Mayda dida? Maupay na kulop. in 30 seconds."
         },
         {
            role: "assistant",
            content: `{
      "action_type": "SPEAK",
      "parameters": {
        "message": "Mayda dida? Maupay na kulop."
      },
      "template_output": {
              "message": "Mayda dida? Maupay na kulop."
      },
      "missing_fields": [],
      "confidence": 5
    }`
         }, {
            role: "user",
            content: "Speak a message Mayda dida? Maupay na kulop."
         },
         {
            role: "assistant",
            content: `{
      "action_type": "SPEAK",
      "parameters": {
        "message": "Mayda dida? Maupay na kulop."
      },
      "template_output": {
              "message": "Mayda dida? Maupay na kulop."
      },
      "missing_fields": [],
      "confidence": 5
    }`
         }

      ]
   }, {
      name: 'action_selector',
      model_name: "action_selector",
      base_model: 'mistral:latest',
      system_instruction: `Role: Deterministic action-selection engine

## Processing Rules:
1. TEMPLATE SELECTION
   - Match ONLY to provided allowed_templates
   - Confidence levels:
     1-2: Require clarification
     3-5: Select best match

2. PROMPT REFINEMENT
   - Remove filler words ("please", "could you")
   - Resolve pronouns to nouns
   - Convert lists to arrays
   - Preserve original intent

3. TRIGGER DETECTION
   | TYPE       | PATTERN                  | OUTPUT            |
   |------------|--------------------------|-------------------|
   | IMMEDIATE  | (default)                | {}                |
   | COUNTDOWN  | "in X [time units]"      | {delay_seconds:N} |
   | SCHEDULED  | "at [time]" / "on [date]"| {datetime:ISO}    |
   | RECURRING  | "[* * * * * *]"  | {recurrence_rule:"6 fields rule"}     |

4. RESOURCE TYPING
   - config: Initial setup actions
   - resource: Record operations (default)
   - connect: Relationship management
   `,
      output_schema: {
         selected_template: "string (matched template name)",
         confidence_score: "number (0-1)",
         trigger_type: "string (IMMEDIATE|COUNTDOWN|SCHEDULED|RECURRING)",
         trigger_config: "object (trigger-specific parameters)",
         refined_prompt: "string (optimized input)",
         resource_name: "string (selected resource)",
         resource_type: "string (config|resource|connect)",
         validation_notes: "string[] (warnings/requirements)"
      },
      options: {
         trigger_type: ["IMMEDIATE", "COUNTDOWN", "SCHEDULED", "RECURRING"],
         resource_type: ["config", "resource", "connect"],
         models: ["ResourceTag", "ResourceRelationship"]

      },
      parameters: {
         temperature: 0.3,
         num_ctx: 4096,
         // top_k: 40
      },
      anti_hallucination_rules: [
         "Never suggest unapproved templates",
         "Require explicit confirmation for low-confidence matches",
         "Preserve all original intent during prompt compression"
      ],
      messages: [
         // Immediate Resource Action (High Confidence)

         // Recurring Config Action
         {
            role: "user",
            content: "Run inventory sync every Friday at 8 PM"
         },
         {
            role: "assistant",
            content: `{
      "selected_template": "inventory_sync",
      "confidence": 5,
      "trigger_type": "RECURRING",
      "trigger_config": {
        "recurrence_rule": "0 0 20 * * 5"
      },
      "refined_prompt": "Run inventory sync Fridays 8 PM",
      "resource_name": "inventory",
      "resource_type": "config",
      "validation_notes": []
    }`
         },
         {
            role: "user",
            content: "Speak action a message Mayda dida? Maupay na kulop. every 30 seconds"
         },
         {
            role: "assistant",
            content: `{
      "selected_template": "speak",
      "confidence": 5,
      "trigger_type": "RECURRING",
      "trigger_config": {
        "recurrence_rule": "*/30 * * * * *"
      },
      "refined_prompt": "Run inventory sync Fridays 8 PM",
      "resource_name": "inventory",
      "resource_type": "config",
      "validation_notes": []
    }`
         },
         // Resource Action with Pronouns
         {
            role: "user",
            content: "Please could you update it with the new contact details?"
         },
         {
            role: "assistant",
            content: `{
      "selected_template": "update_contact",
      "confidence": 3,
      "trigger_type": "IMMEDIATE",
      "refined_prompt": "Update contact with new details",
      "resource_name": "contact",
      "resource_type": "resource",
      "validation_notes": [
        "Verify target contact ID from context",
        "Confirm which details need updating"
      ]
    }`
         },
         // Resource Action with Pronouns
         {
            role: "user",
            content: "Please could you update it with the new contact details?"
         },
         {
            role: "assistant",
            content: `{
      "selected_template": "update_contact",
      "confidence": 3,
      "trigger_type": "IMMEDIATE",
      "refined_prompt": "Update contact with new details",
      "resource_name": "contact",
      "resource_type": "resource",
      "validation_notes": [
        "Verify target contact ID from context",
        "Confirm which details need updating"
      ]
    }`
         },

      ]
   }

];