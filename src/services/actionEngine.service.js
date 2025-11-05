import { db } from "../config/db.js";
import { actionTemplates, auditLogs } from "../db/schema.js";
import { sendEmail, sendSMS, sendSpeak } from "./communicationService.js";
import * as expressionEvaluator from "./expressionEvaluator.js";
import axios from "axios";
import contextManager from "./contextManager.js";
import { AIService } from "./aiService.js";
import { eq, or, sql } from "drizzle-orm";
import { buildConditions, dynamicQuery, getSchema } from "../utils/queryBuilder.js";

const generateExecutionId = () =>
  `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export class ActionEngine {
  constructor(session) {
    this.executionId = null;
    this.session = session;
  }

  async execute(temp, parameters = {}, triggerId = null) {
    const [template] = await db
      .select()
      .from(actionTemplates)
      .where(eq(actionTemplates.id, temp?.id));

    if (!template) throw new Error("Action template not found");

    this.executionId = generateExecutionId();

    let baseContext = {
      session: { ...this.session, tenant_id: template.tenant_id },
      params: parameters,
      outputs: {},
      executionId: this.executionId,
      conversation_id: this.session.conversation_id,
      tenant_id: template.tenant_id,
      session_id: this.session.session_id,
      context: this.session.context,
    };

    // Save initial session context
    // await contextManager.saveSession(this.session.session_id, baseContext);

    const [auditLog] = await db
      .insert(auditLogs)
      .values({
        actionTemplateId: template.id,
        actionTriggerId: triggerId,
        
        actionType: template.tool_type,
        status: "RUNNING",
        executedAt: new Date(),
        requestData: { parameters, template },
        executionId: this.executionId,
        context: baseContext,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();

    let result;
    try {
    

      // // Pre-hooks
      if (template.pre_hooks?.length) {
        await this.processHooks(template.pre_hooks, baseContext, template, "pre", auditLog.id);
      }
      
 
                
      baseContext = {
      ...baseContext,
      params: {...baseContext.params, ...parameters},
      };


      // Main action
      result = await this.executeAction(template, baseContext);





      // Finalize audit log
      await db.update(auditLogs).set({
        status: "COMPLETED",
        completedAt: new Date(),
        responseData: result,
        context: baseContext,
      }).where(eq(auditLogs.id, auditLog.id));

      // Output template mapping
      if (template.output_template && Object.keys(template.output_template).length) {
        result = await expressionEvaluator.resolvePlaceholders(
          template.output_template,
          { context: baseContext.context, outputs: baseContext.outputs, result }
        );
      }
      
  
      const mainKey = template.output_as || "main";
      baseContext.outputs[mainKey] = result;


      // Context template mapping
      if (template.context_as && (
        (template.context_template && Object.keys(template.context_template).length !== 0) ||
        (typeof template.context_template === "string" && String(template.context_template).trim())
      )) {
        const contextEval = await expressionEvaluator.resolvePlaceholders(
          template.context_template,
          { context: baseContext.context.context, outputs: baseContext.outputs, result }
        );
    
            const contextKey = await expressionEvaluator.resolvePlaceholders(
          template.context_as || template.output_as,
          { context: baseContext.context.context, outputs: baseContext.outputs, result }
        );
    
    
        baseContext.context[contextKey] = contextEval;
      }
      
      if(baseContext.session_id){
         await contextManager.saveContext(
         this.session.session_id, baseContext.context
        );
      }
      
      
            // // Post-hooks
      if (template.post_hooks?.length) {
        await this.processHooks(template.post_hooks, baseContext, template, "post", auditLog.id);
      }




      // // Success hooks
      // if (template.success_hooks?.length) {
      //   await this.processConditionalHooks(template.success_hooks, baseContext, result, true, auditLog.id);
      // }



    


      // Merge parameters
      baseContext.parameters = {
        ...baseContext.parameters,
        [mainKey]: parameters,
      };



  //  this.session.context = await contextManager.saveContext(
  //        this.session.session_id, baseContext.context
  //       );

        // await contextManager.saveSession(
        //  this.session.session_id, this.session
        // );
        

      // ✅ Final standardized response
      return {
        result,
        outputs: baseContext.outputs,
        context: baseContext.context,
        parameters: baseContext.parameters,
        session_id: this.session.session_id
      };

    } catch (error) {
      console.error("[ActionEngine] Error executing action", error);

      // // Error hooks
      // if (template.error_hooks?.length) {
      //   await this.processConditionalHooks(template.error_hooks, baseContext, error, false, auditLog.id);
      // }

      await db.update(auditLogs).set({
        status: "FAILED",
        completedAt: new Date(),
        errorDetails: error.message,
        context: baseContext,
      }).where(eq(auditLogs.id, auditLog.id));


      throw error?.response?.data || error;
    }
  }

  /**
   * Process hooks (supports nested hooks + gathers outputs/parameters/context + audit logs)
   */
async processHooks(hooks, context, parentTemplate, phase, parentAuditId) {
  for (const hook of hooks) {
    if (!hook.template) continue;

    const isNumber = !isNaN(Number(hook.template));
    const [hookTemplate] = await db
      .select()
      .from(actionTemplates)
      .where(
        isNumber
          ? eq(actionTemplates.id, Number(hook.template))
          : eq(actionTemplates.name, hook.template)
      );
  
 

    const [hookAudit] = await db.insert(auditLogs).values({
      actionTemplateId: hookTemplate.id,
      parentAuditId,
      actionType: hookTemplate.tool_type,
      status: "RUNNING",
      executedAt: new Date(),
      requestData: { hook, parentTemplate },
      executionId: this.executionId,
      context,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning();

    try {
    
    
    
      // -----------------------------
      // 1. Merge hook parameters into context.params FIRST
      // -----------------------------
      const hookParams = await expressionEvaluator.resolvePlaceholders(
        hook.parameters || {},
        context
      );
      context.params = { ...context.params, ...hookParams }; // 🔑 pre-hooks now see this


   if (!hookTemplate) continue;

    if (hookTemplate.conditions && !this.evaluateConditions(await expressionEvaluator.resolvePlaceholders(hookTemplate.conditions, context), context)) {
         continue;
      // return { status: "skipped", reason: "conditions_not_met", processed: false };
    }



      // -----------------------------
      // 2. Run pre-hooks (see merged params)
      // -----------------------------
      if (hookTemplate.pre_hooks?.length) {
        await this.processHooks(
          hookTemplate.pre_hooks,
          context,
          hookTemplate,
          "pre",
          hookAudit.id
        );
      }
      
      
      
      

      // -----------------------------
      // 3. Execute main hook
      // -----------------------------
      const hookResult = await this.executeAction(
        { ...hookTemplate, ...hook },
        { ...context, params: context.params } // 🔑 pass merged params
      );
      
      
      


      // -----------------------------
      // 4. Outputs & parameters
      // -----------------------------
      const outputKey =
        hook.output_as || hookTemplate.output_as || hookTemplate.name || `hook_${hookTemplate.id}`;
      const outputTemplate = hook.output_template || hookTemplate.output_template || {};
        // const outputEval = await expressionEvaluator.resolvePlaceholders(
        //   outputTemplate,
        //   { context: context.context, outputs: context.outputs, result: hookResult }
        // );
     context.outputs = { ...context.outputs, [outputKey]: hookResult };


     if ((hook.output_as || hookTemplate.output_as) && Object.keys(outputTemplate).length) {
        const outputEval = await expressionEvaluator.resolvePlaceholders(
          outputTemplate,
          { context: context.context, outputs: context.outputs, result: hookResult }
        );
        context.outputs = { ...context.outputs, [outputKey]: outputEval };
      } 

      // Keep params also under `parameters`
      context.parameters = { ...context.parameters, [outputKey]: hookParams };

      // Context mapping
      if (hook.context_as || hookTemplate.context_as) {
        const contextKey = await expressionEvaluator.resolvePlaceholders(
          hook.context_as || hookTemplate.context_as,
          { context: context.context, outputs: context.outputs, result: hookResult }
        );
        const contextTemplate = hook.context_template || hookTemplate.context_template || {};
        if (
          contextKey &&
          (Object.keys(contextTemplate).length ||
            (typeof contextTemplate === "string" && String(contextTemplate).trim()))
        ) {
          const contextEval = await expressionEvaluator.resolvePlaceholders(
            contextTemplate,
            { context: context.context, outputs: context.outputs, result: hookResult }
          );
          context.context[contextKey] = contextEval;
        }
      }
      if(this.session.session_id){
          await contextManager.saveContext(this.session.session_id, context.context);
      }



      // -----------------------------
      // 5. Run post-hooks (see merged params + outputs)
      // -----------------------------
      if (hookTemplate.post_hooks?.length) {
        await this.processHooks(
          hookTemplate.post_hooks,
          context,
          hookTemplate,
          "post",
          hookAudit.id
        );
      }

      // -----------------------------
      // 6. Run conditional success/error hooks
      // -----------------------------
      // if (hookTemplate.success_hooks?.length) {
      //   await this.processConditionalHooks(
      //     hookTemplate.success_hooks,
      //     context,
      //     hookResult,
      //     true,
      //     hookAudit.id
      //   );
      // }
      // if (hookTemplate.error_hooks?.length) {
      //   await this.processConditionalHooks(
      //     hookTemplate.error_hooks,
      //     context,
      //     hookResult,
      //     false,
      //     hookAudit.id
      //   );
      // }

      // -----------------------------
      // 7. Finalize audit
      // -----------------------------
      await db.update(auditLogs).set({
        status: "COMPLETED",
        completedAt: new Date(),
        responseData: hookResult,
        context,
      }).where(eq(auditLogs.id, hookAudit.id));



    } catch (err) {
      console.error(`[ActionEngine] Hook ${hook.template} failed`, err);

      await db.update(auditLogs).set({
        status: "FAILED",
        completedAt: new Date(),
        errorDetails: err.message,
        context,
      }).where(eq(auditLogs.id, hookAudit.id));

      if (hook.fatal) throw new Error(`Fatal hook failure: ${hook.template}`);
    }
  }
}




  async processConditionalHooks(hooks, context, resultOrError, isSuccess, parentAuditId) {
    for (const hook of hooks) {
      const conditionsMet = hook.conditions
        ? this.evaluateConditions(hook.conditions, { ...context.params, result: resultOrError })
        : true;

      if (!conditionsMet) continue;

      if (hook.message) {
        const message = await expressionEvaluator.evaluatePlaceholders(
          hook.message,
          { context, outputs: context.outputs, result: resultOrError }
        );
        context.outputs[isSuccess ? "success_message" : "error_message"] = message;
      }

      if (hook.template) {
        await this.processHooks([hook], context, {}, isSuccess ? "success" : "error", parentAuditId);
      }
    }
  }

  async executeAction(template, context) {

    if (
      template.conditions &&
      !this.evaluateConditions(await expressionEvaluator.resolvePlaceholders(template.conditions, context), context)
    ) { 
      return { status: "skipped", reason: "conditions_not_met", processed: false };
    }

    const resolvedConfigs = await expressionEvaluator.resolvePlaceholders(
      template.config,
      context
    );



    switch (template.tool_type) {
      case "SMS":
        return sendSMS(resolvedConfigs, context.params);
      case "EMAIL":
        return sendEmail(resolvedConfigs);
      case "API_CALL":
        return this.callAPI(resolvedConfigs, context);
      case "AI_ACTION":
        return this.callAI(resolvedConfigs, context.params);
      case "DB_OPERATION":
        return this.dbOperation(resolvedConfigs, context);
      case "COMPOSITE":
        return this.executeComposite(resolvedConfigs, context);
      case "SCRIPT":
        return this.executeScript(resolvedConfigs, context);
      case "SPEAK":
        return sendSpeak(resolvedConfigs, context);
      default:
        throw new Error(`Unsupported tool type: ${template.tool_type}`);
    }
  }

    evaluateConditions(conditions, context) {
    
      if (!conditions || typeof conditions !== "object") return true;
      if (conditions?.and) {
        return conditions.and.every((c) => this.evaluateConditions(c, context));
      }
      if (conditions?.or)
        return conditions.or.some((c) => this.evaluateConditions(c, context));
  


  
      if (conditions.field && conditions.operator) {

        
        
        const fieldValue = expressionEvaluator.getNestedValue(
          context,
          conditions.field
        );
        
        
        const compareValue = conditions.value;
  
        switch (conditions.operator) {
          case "eq":
            return fieldValue == compareValue;
          case "neq":
            return fieldValue != compareValue;
          case "gt":
            return fieldValue > compareValue;
          case "gte":
            return fieldValue >= compareValue;
          case "lt":
            return fieldValue < compareValue;
          case "lte":
            return fieldValue <= compareValue;
          case "is":
            return fieldValue <= compareValue;
          case "in":
            return (
              Array.isArray(compareValue) && compareValue.includes(fieldValue)
            );
            
          case "like":
            return String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());  
        // ✅ New operators
        case "exists":
          return fieldValue !== undefined && fieldValue !== null;
        case "not_exists":
          return fieldValue === undefined || fieldValue === null;
        case "defined": // alias for exists
          return fieldValue !== undefined;
        case "undefined":
          return fieldValue === undefined;
  
          default:
            return false;
        }
      }
      return true;
    }

  async callAPI(config, context) {
  
    const { tenant_id, session_id } = context;
    const { method, url, headers, body } = config;
    
    
    try {
    const response = await axios({
      method: method || "GET",
      url,
      data: body,
      headers: { session_id, tenant_id, ...headers  },
    })
    
      
      
       
     
     
    return response.data;
   } catch(err){
   
    return { message: 'Unable to create customer', error: err.message }
   }
  }
  async callAI(config, context) {
    


    const newMessage = await expressionEvaluator.resolvePlaceholders(
      config.message,
      context
    );


    const systemInstructions = await expressionEvaluator.resolvePlaceholders(
      config.system_prompt,
      context
    );
    


    


    const ai = await new AIService(
      context.session_id,
      config.model_name || `alayon_model_${context.tenant_id}`
    ).init();



    return ai.query(newMessage, {
      systemInstructions,
      context: { ...this.session.context, ...context },
      history: this.session.history,
    });
  }

async dbOperation(config, context) {
  const { tenant_id } = context;
  const { model, operation, query, data } = config;
  const schema = getSchema(model);
  const params = context.params || {};





  try {
    switch (operation) {
      case "create": {
        const createData = await expressionEvaluator.resolvePlaceholders(data, params);
        const [created] = await db
          .insert(schema)
          .values({
            ...createData,
            tenant_id,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning();

        // if relationship data is included
        if (data.relationships) {
          for (const rel of data.relationships) {
            const relSchema = getSchema(rel.model);
            await db.insert(relSchema).values(
              rel.records.map(r => ({
                ...r,
                created_at: new Date(),
                updated_at: new Date(),
              }))
            );
          }
        }
        return created;
      }
      
case "update": {
  // Resolve incoming values
  const updateData = await expressionEvaluator.resolvePlaceholders(
    data,
    context
  );

  // Build conditions
  const condition = buildConditions(
    schema,
    await expressionEvaluator.resolvePlaceholders(query.where, context)
  );

  // Separate attributes from other fields
  const { attributes: newAttrs, ...otherFields } = updateData;

  // Prepare set object with updated timestamp
  let setData = { ...otherFields, updated_at: new Date() };

  if (newAttrs && Object.keys(newAttrs).length > 0) {
    // Get current attributes first to merge with new ones
    const currentRecord = await db
      .select({ currentAttributes: schema.attributes })
      .from(schema)
      .where(condition)
      .limit(1);

    const currentAttrs = currentRecord[0]?.currentAttributes || {};
    
    // Merge new attributes with existing ones (new values override existing ones)
    const mergedAttributes = { ...currentAttrs, ...newAttrs };
    
    // Set the merged attributes
    setData.attributes = mergedAttributes;
  }











  // Perform update
  const [updated] = await db
    .update(schema)
    .set(setData)
    .where(condition)
    .returning();

  // Handle relationships if provided
  if (data.relationships) {
    for (const rel of data.relationships) {
      const relSchema = getSchema(rel.model);
      for (const r of rel.records) {
        await db
          .update(relSchema)
          .set({ ...r, updated_at: new Date() })
          .where(eq(relSchema.id, r.id));
      }
    }
  }

  return updated;
}


case "read": {
        const readQuery = await expressionEvaluator.resolvePlaceholders(query, params);
        
        
        const queryResult = readQuery.where
          ? await dynamicQuery(db, model, readQuery)
          : undefined;



        return queryResult;
      }

      case "delete": {
        const condition = buildConditions(schema, expressionEvaluator.resolvePlaceholders(query, params));
        return db.delete(schema).where(condition).returning();
      }

      default:
        throw new Error(`Unsupported DB operation: ${operation}`);
    }
  } catch (err) {
    console.error("DB Operation Error:", { operation, model, query, data, err });
    throw err;
  }
}

  async executeComposite(config, context) {
    return expressionEvaluator.evaluatePlaceholders(config || {}, context);
  }

  executeScript(config) {
    return { output: "Script executed" };
  }
}
