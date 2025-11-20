// src/routes/actions.js
import express from "express";
import { db } from "../config/db.js";
import { actionTemplates, actionTriggers } from "../db/schema.js";
import { ActionEngine } from "../services/actionEngine.service.js";
import { findActionTemplateByName, findActionTemplates } from "../services/actionTemplate.service.js";
import { eq } from "drizzle-orm";
import contextManager from "../services/contextManager.js";
import { default_actions } from "../config/default_actions.js";
import { AIService } from "../services/aiService.js";



const router = express.Router();


// ✅ Create template
router.post("/", async (req, res) => {
  try {
    const [template] = await db
      .insert(actionTemplates)
      .values({
        ...req.body,
        tenant_id: req.tenantId || null,
      created_at: new Date(),
      updated_at: new Date()
      })
      .returning();
    res.status(201).json(template);
  } catch (err) {
  console.log(err, 'ERROR')
    res.status(400).json({ error: err.message });
  }
});

// ✅ Execute template
router.post("/:template_name/execute", async (req, res) => {
  try {
          const { parameters: rawParams = {} } = req.body;

  
    const template = await findActionTemplateByName(req.params.template_name, req.tenantId);
    if (!template) return res.status(404).json({ message: "Template not found" });
    let session = await contextManager.getSession(req.sessionId, req.tenantId);

console.log(req.sessionId, session.session_id, 'SESSS')
        const parameters = {...req.body, ...req.body.parameters, session_id: session.session_id, ...rawParams };
        const validationErrors = [];

        // 2. Build a parameter definition map for easier lookup
        const paramMap = {};
        for (const p of template.parameters) {
            paramMap[p.field_name] = p;
        }

        // 3. Check for missing required parameters
        const missingRequiredParams = template.parameters
            .filter(p => p.is_required && (parameters[p.field_name] === undefined || parameters[p.field_name] === null || parameters[p.field_name] === ''))
            .map(p => p.field_name);

        if (missingRequiredParams.length > 0) {
            validationErrors.push({
                type: 'MISSING_REQUIRED',
                message: 'Missing required parameters',
                details: missingRequiredParams
            });
        }

        // 4. Check for parameters not defined in the template
        const allowedParamNames = Object.keys(paramMap);
        const extraParams = Object.keys(parameters).filter(
            paramName => !allowedParamNames.includes(paramName)
        );
  /*       if (extraParams.length > 0) {
            validationErrors.push({
                type: 'EXTRA_PARAMETERS',
                message: 'Parameters not allowed by template',
                details: extraParams
            });
        }
 */
        // 5. Validate type, allowed values, and regex pattern
        const typeErrors = [];
        const allowedValueErrors = [];
        const regexErrors = [];

        for (const [name, value] of Object.entries(parameters)) {
            const def = paramMap[name];
            if (!def) continue; // skip if not in template

            // a) Type validation
            if (def.type) {
                let isValidType = true;
                switch (def.type) {
                    case 'string':
                        isValidType = typeof value === 'string';
                        break;
                    case 'number':
                        isValidType = typeof value === 'number' && !isNaN(value);
                        break;
                    case 'boolean':
                        isValidType = typeof value === 'boolean';
                        break;
                    case 'array':
                        isValidType = Array.isArray(value);
                        break;
                    default:
                        break; // unknown type, skip
                }
                if (!isValidType) {
                    typeErrors.push({ parameter: name, expected: def.type, received: typeof value });
                }
            }

            // b) Allowed values check
            if (def.allowed_values && Array.isArray(def.allowed_values)) {
                if (!def.allowed_values.includes(value)) {
                    allowedValueErrors.push({ parameter: name, value, allowed: def.allowed_values });
                }
            }

            // c) Regex pattern check
            if (def.regex_pattern) {
                const pattern = new RegExp(def.regex_pattern);
                if (!pattern.test(value)) {
                    regexErrors.push({ parameter: name, value, pattern: def.regex_pattern });
                }
            }
        }

        if (typeErrors.length > 0) {
            validationErrors.push({ type: 'INVALID_TYPE', message: 'Invalid parameter type(s)', details: typeErrors });
        }
        if (allowedValueErrors.length > 0) {
            validationErrors.push({ type: 'INVALID_VALUE', message: 'Value not in allowed list', details: allowedValueErrors });
        }
        if (regexErrors.length > 0) {
            validationErrors.push({ type: 'INVALID_FORMAT', message: 'Value does not match required pattern', details: regexErrors });
        }

        // 6. Apply default values for missing optional parameters
        for (const paramDef of template.parameters) {
            if (parameters[paramDef.field_name] === undefined && paramDef.default_value !== undefined) {
                parameters[paramDef.field_name] = paramDef.default_value;
            }
        }

        // 7. Return all validation errors if present
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Parameter validation failed',
                validationErrors
            });
        }





























    // session = await contextManager.addSessionState(req.sessionId, { tenant_id: req.tenantId });


    
  
    
    
    const trigger = await db
      .insert(actionTriggers)
      .values({
        action_template_id: template.id,
        tool_type: template.tool_type,
        parameters,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning();


const actionEngine = new ActionEngine(session);





    let result = null;
    if (trigger[0].trigger_type !== "IMMEDIATE") {
      // schedule (not implemented)
    } else {
      result = await actionEngine.execute(template, parameters);
    }


    // if(parameters.message){
    //     if(result?.result?.message){
    //           await contextManager.addChat(req.sessionId, 'user', parameters.message);
    //         let newSession = await contextManager.addChat(req.sessionId, 'assistant', result?.result?.message);
    //           console.log(newSession, 'SSSESSH')
    //     }
    // }

    let newSession = await contextManager.getSession(req.sessionId, req.tenantId);

  // console.log(result, 'HELLO WORLD', parameters)

    return res.json({...result, session: newSession});
  } catch (err) {
  console.log(err, 'ERR')
   return res.status(400).json({ error: err.message });
  }
});

router.get("/clear", async (req, res) => {
  contextManager.clearAllSessions();
  res.json({"message": "Session cleared!"});
});


// ✅ Get all
router.get("/", async (req, res) => {
  const rows = await findActionTemplates(null, req.tenantId);
  // Build a Set of existing IDs from DB rows
  const existingIds = new Set(rows.map(r => r.id));
  // Only include defaults that don’t conflict
  const merged = [
    ...rows,
    ...default_actions.filter(d => !existingIds.has(d.id))
  ];

  res.json(merged);
  });

// ✅ Get single
router.get("/:name", async (req, res) => {
  const template = await findActionTemplateByName(req.params.name, req.tenantId);
  if (!template) return res.status(404).json({ error: "Not found" });
  res.json(template);
});

// ✅ Update
router.put("/:id", async (req, res) => {
  try {
  
    const template = await findActionTemplateByName(req.params.name, req.tenantId);
  
    if (!template)  {
       const [template] = await db
      .insert(actionTemplates)
      .values({
        ...req.body,
        id: Number(req.params.id),
        tenant_id: req.tenantId || null,
        created_at: new Date(req.body.created_at || null),
        updated_at: new Date()
      })
      .returning();
    } 

  
  
    const [updated] = await db
      .update(actionTemplates)
      .set({
        ...req.body,
        tenant_id: req.tenantId || null,
        created_at: new Date(req.body.created_at || null),
        updated_at: new Date()
      })
      .where(eq(actionTemplates.id, Number(req.params.id)))
      .returning();
    res.json(updated);
  } catch (err) {
  console.log(err, 'ERRORR')
    res.status(400).json({ error: err.message });
  }
});

// ✅ Delete
router.delete("/:id", async (req, res) => {
  await db.delete(actionTemplates).where(eq(actionTemplates.id, Number(req.params.id)));
  res.json({ message: "Deleted" });
});


/**
 * ✅ Chat endpoint
 */
router.post("/chat", async (req, res) => {
  try {
    const { sender, message, model, useAI = false } = req.body;
     
const aiService = new AIService(req.sessionId, model);
await aiService.init();

// Flow-based responses (recommended for consistent booking flow)
// const result1 = await aiService.query("I want to book water delivery");
// Response: "Great! Let's get your water delivery scheduled. Are you looking for a one-time delivery or recurring subscription?"

// const result2 = await aiService.query("one-time delivery");
// Response: "Okay, one-time delivery! What type of water would you like? We have: 5-gallon Mineral Water (₱50), 5-gallon Purified Water (₱45), 1-gallon Bottled Water (₱25), 3-gallon Premium Water (₱120)"

// AI-based responses (for complex queries)
const result = await aiService.query(message, { useAI });
// AI-generated response about referrals

// Get current state
const state = aiService.getConversationState();

    // const userId = 'customer_123';
    
    // Process customer messages
    // const messages = [
    //     "Hi, I need water delivery",
    //     "Subscription",
    //     "Mineral water", 
    //     "2 containers",
    //     "Juan Dela Cruz",
    //     "456 Pine Street, Mandaue City",
    //     "09171234567",
    //     "ASAP"
    // ];
        // await runAlayonDemo();
        // const result = await assistant.processMessage(sender, message);
        // console.log(`Customer: ${message}`);
        // console.log(`Assistant: ${result.response}`);
        // console.log('---');

    // Get conversation history
    // const history = assistant.getUserHistory(sender);
    // console.log(`Conversation history: ${history.length} messages`)


    return res.status(200).json({
        result,
      state
    });
  } catch (error) {
    console.log(error, "CHAT ERROR");
    res.status(400).json({ success: false, details: error?.details });
  }
});





export default router;
