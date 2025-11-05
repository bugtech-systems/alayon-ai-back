// ModelDeployer.js (Drizzle version)
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { db } from "../config/db.js"; // Drizzle instance
import { aiPresets, messages } from "../db/schema.js"; // drizzle schemas
import * as expressionEvaluator from "./expressionEvaluator.js";
import { resolveConfig } from "../utils/parameterResolver.js";
import { generateExecutionId, parseToString } from "../utils/helpers.js";
import { DEFAULT_MODELS } from "../config/default_models.js";
import { ActionEngine } from "./actionEngine.service.js";
import { eq, and, asc } from "drizzle-orm";

export class ModelDeployer {
  /**
   * Generate a base Modelfile with system instructions, schema, and training data
   */
  
//   # CURRENT SETTINGS - ALREADY WELL OPTIMIZED
// PARAMETER temperature 0.1        # Perfect for consistent template responses
// PARAMETER top_k 40               # Good balance for quality/speed
// PARAMETER top_p 0.7              # Works well with top_k
// PARAMETER num_ctx 4096           # Enough for system prompt + conversation
// PARAMETER num_predict 512        # Limits responses to reasonable length
// PARAMETER repeat_penalty 1.1     # Prevents repetition in templates
// PARAMETER num_thread 8           # Good for 8-core CPUs
// PARAMETER num_batch 512          # Balanced memory/performance
  
  
  static async generateBaseModelfile(model, trainingFile) {
    const actionEngine = new ActionEngine();

    const parameters = [
      model.parameters?.temperature !== undefined &&
        `PARAMETER temperature ${model.parameters.temperature}`,
      model.parameters?.num_ctx !== undefined &&
        `PARAMETER num_ctx ${model.parameters.num_ctx}`,
      model.parameters?.top_p !== undefined &&
        `PARAMETER top_p ${model.parameters.top_p}`,
        `PARAMETER top_k 40`,
        `PARAMETER num_thread 8`,
        `PARAMETER num_batch 512`,
        `PARAMETER repeat_penalty 1.1`

    ]
      .filter(Boolean)
      .join("\n");

    let executionId = generateExecutionId();

    const baseContext = {
      params: {},
      outputs: {},
      executionId,
    };

    if (model.pre_hooks) {
      await actionEngine.processHooks(model.pre_hooks, baseContext);
    }

    const newModel = expressionEvaluator.evaluatePlaceholders(
      resolveConfig(model, baseContext),
      baseContext
    );

    const newSystemInstruction = expressionEvaluator.evaluatePlaceholders(
      model.system_instruction,
      baseContext
    );

    return (
      "\nFROM " +
      model.base_model +
      '\nSYSTEM """\n' +
      newSystemInstruction +
      "\n\n## BEHAVIOR RULES:\n1. Always use the CONTEXT object as a reference for facts.\n2. Never echo the context object directly in the response.\n3. Respond STRICTLY in JSON format that matches the provided schema.\n4. Missing/unknown values → return \"null\".\n5. Enum fields → ONLY allowed values or \"null\".\n6. Do not add extra fields.\n7. Required fields must always be present.\n\nJSON SCHEMA:\n" +
      JSON.stringify(newModel?.output_schema, null, 2) +
      '\n"""\n\n# Training parameters\n' +
      parameters +
      "\n\n# Training data\n" +
      trainingFile +
      "\n    "
    ).trim();
  }

  /**
   * Convert training dataset into proper Modelfile MESSAGE format
   */
  static async createTrainingMessages(trainingData) {
    const messages = [];

    for (const example of trainingData) {
      if (example.context) {
        messages.push(
          `MESSAGE assistant """CONTEXT: ${parseToString(example.context)}"""`
        );
      }

      messages.push(`MESSAGE user """${parseToString(example.user)}"""`);
      messages.push(`MESSAGE assistant """${parseToString(example.assistant)}"""`);
      messages.push("");
    }

    return messages.join("\n").trim();
  }

  /**
   * Extract training data from database messages
   */
  static async getTrainingData(model) {
    const modelMessages = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.ai_preset_id, model.id), eq(messages.is_training_candidate, true))
      )
      .orderBy(asc(messages.id));

    const trainingData = [];
    const defaultMess =
      DEFAULT_MODELS.find((a) => a.name === model.name)?.messages || [];
    const combinedMessages = [...defaultMess, ...modelMessages];

    if (combinedMessages.length) {
      for (let i = 0; i < combinedMessages.length; i++) {
        if (
          combinedMessages[i].role === "user" &&
          combinedMessages[i + 1]?.role === "assistant"
        ) {
          const context =
            combinedMessages[i - 1]?.role === "assistant" &&
            combinedMessages[i - 1].name
              ? combinedMessages[i - 1].content
              : null;

          trainingData.push({
            user: combinedMessages[i].content,
            assistant: combinedMessages[i + 1].content,
            ...(context ? { context } : {}),
            confidence: combinedMessages[i + 1].confidence_score,
          });

          i++; // skip paired assistant
        }
      }
    }

    return trainingData;
  }

  /**
   * Deploy a model by generating its Modelfile and calling Ollama
   */
  static async deployModel(modelId, trx = db) {
    const [model] = await trx
      .select()
      .from(aiPresets)
      .where(eq(aiPresets.id, modelId));

    if (!model) throw new Error("Model not found");

    const trainingData = await this.getTrainingData(model);
    let trainingMessage = "";

    if (trainingData.length > 1) {
      trainingMessage = await this.createTrainingMessages(trainingData);
    }

    const modelfile = await this.generateBaseModelfile(model, trainingMessage);
    return this.deployFromModelfile(model.model_name, modelfile);
  }

  static async removeFromModel(modelId, trx = db) {
    const [model] = await trx
      .select()
      .from(aiPresets)
      .where(eq(aiPresets.id, modelId));

    if (!model) throw new Error("Model not found");

    try {
      await this.cleanupModelFiles(model.model_name);
      return await this.executeOllamaCommand("rm", model.model_name);
    } catch (error) {
      throw new Error(`Failed to remove model: ${error.message}`);
    }
  }

  static async deployFromModelfile(modelName, modelfile) {
    try {
      await this.prepareModelDirectory(modelName, modelfile);
      return await this.executeOllamaCommand("create", modelName, [
        "-f",
        path.join("./tuner", "models", modelName, "Modelfile"),
      ]);
    } catch (error) {
      await this.cleanupModelFiles(modelName).catch(console.error);
      throw new Error(`Failed to deploy model: ${error.message}`);
    }
  }

  // ------------------ Helpers ------------------

  static async prepareModelDirectory(modelName, modelfile) {
    const dirPath = path.join("./tuner", "models", modelName);
    await fs.mkdir(dirPath, { recursive: true });

    const filename = path.join(dirPath, "Modelfile");
    await fs.writeFile(filename, modelfile);

    console.log(`Prepared model files for ${modelName} at ${filename}`);
    return filename;
  }

  static async cleanupModelFiles(modelName) {
    try {
      const dirPath = path.join("./tuner", "models", modelName);
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`Cleaned up model files for ${modelName}`);
    } catch (error) {
      console.error(`Error cleaning up files for ${modelName}:`, error);
      throw error;
    }
  }

  static async executeOllamaCommand(command, modelName, additionalArgs = []) {
    return new Promise((resolve, reject) => {
      const args = [command, modelName, ...additionalArgs];
      console.log(`Executing: ollama ${args.join(" ")}`);

      const ollama = spawn("ollama", args, {
        stdio: "inherit",
        shell: true,
      });

      ollama.on("error", (err) => {
        console.error(`Ollama ${command} error:`, err);
        reject(err);
      });

      ollama.on("close", (code) => {
        if (code === 0) {
          console.log(
            `Successfully executed ollama ${command} for ${modelName}`
          );
          resolve(
            `Model ${modelName} ${
              command === "create" ? "deployed" : "removed"
            }`
          );
        } else {
          const error = new Error(`Ollama ${command} failed with code ${code}`);
          console.error(error.message);
          reject(error);
        }
      });
    });
  }
}
