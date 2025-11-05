/**
 * Build a structured prompt for Ollama AI
 * Supports system instructions, session context, history, and the latest user message.
 * 
 * @param {Object} options
 * @param {string} options.systemInstructions - System role / high-level rules
 * @param {Object} options.context - Session context key/value pairs (from Redis)
 * @param {Array} options.history - Previous messages [{ role, content }]
 * @param {string} options.userMessage - The current user input
 * 
 * @returns {string} - A concatenated prompt for the AI model
 */
// promptBuilder.js
export default function buildPrompt({ systemInstructions, context, history, message, schema }) {
  let prompt = "";

  // 🔹 System instructions (from Modelfile SYSTEM section)
  if (systemInstructions) {
    prompt += `### System Instructions\n${systemInstructions.trim()}\n\n`;
  }
  
  
// 🔹 Dynamic context (key-value pairs, used as reference but not rigid template)
if (context && Object.keys(context).length > 0) {
  prompt += `### Context Reference\n`;
  for (const [key, value] of Object.entries(context)) {
    let displayValue;

    if (typeof value === "object") {
      try {
        displayValue = JSON.stringify(value, null, 2); // pretty-print JSON
      } catch {
        displayValue = String(value); // fallback
      }
    } else {
      displayValue = String(value);
    }

    prompt += `- ${key}: ${displayValue}\n`;
  }
  prompt += "\n";
}

  // 🔹 Previous conversation history (role-based)
  if (history && history.length > 0) {
    prompt += `### Conversation History\n`;
    history.forEach((msg) => {
      prompt += `[${msg.role.toUpperCase()}]: ${msg.content}\n`;
    });
    prompt += "\n";
  }

  // 🔹 Current user message
  prompt += `### Current User Message\nUSER: ${message}\n\n`;

  // 🔹 Expected output format aligned to schema from Modelfile
  if (schema) {
    prompt += `### Expected Output\nRespond STRICTLY in JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\n`;
    prompt += `RULES:\n`;
    prompt += `1. All required fields MUST be present.\n`;
    prompt += `2. Use "null" for unknown/missing values (do not hallucinate).\n`;
    prompt += `3. Enum values must be from predefined options or null.\n`;
    prompt += `4. Never add extra fields.\n`;
  }

  return prompt.trim();
}

