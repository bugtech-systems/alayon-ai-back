import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  real,
  date,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
// import * as schema_1 from './schema.js';


/* =====================
   ENUM DEFINITIONS
===================== */
export const toolTypeEnum = pgEnum("tool_type", [
  "SMS",
  "EMAIL",
  "API_CALL",
  "AI_ACTION",
  "DB_OPERATION",
  "DB_QUERY",
  "SCRIPT",
  "COMPOSITE",
  "SPEAK",
]);

export const resourceTypeEnum = pgEnum("resource_type", [
  "config",
  "resource",
  "connection",
  "execution",
  "tag",
]);

export const triggerTypeEnum = pgEnum("trigger_type", [
  "IMMEDIATE",
  "SCHEDULED",
  "RECURRING",
  "COUNTDOWN",
]);

export const auditStatusEnum = pgEnum("audit_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
  "context",
]);

export const relationshipTypeEnum = pgEnum("relationship_type", [
  "resource",
  "config",
]);
/* =====================
   TABLES
===================== */

// ResourceTag table
export const resourceTags = pgTable(
  "resource_tags",
  {
    id: serial("id").primaryKey(),
    position: integer("position").default(0),
    tenant_id: integer("tenant_id"), // nullable for top-level tenants
    resource_type: resourceTypeEnum("resource_type").notNull().default("resource"),
    resource_name: varchar("resource_name", { length: 255 }).notNull(),
    attributes: jsonb("attributes").default({}),
    resource_parent_id: integer("resource_parent_id"),
    is_deleted: boolean("is_deleted").default(false),
    ai_description: text("ai_description"),
    ai_example_queries: jsonb("ai_example_queries").default([]),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  }
);

// ResourceRelationship table
export const resourceRelationships = pgTable(
  "resource_relationships",
  {
    id: serial("id").primaryKey(),
    tenant_id: integer("tenant_id")
      .references(() => resourceTags.id, { onDelete: "cascade" })
      .notNull(),
    relationship_type: relationshipTypeEnum("relationship_type")
      .notNull()
      .default("resource"),
    source_resource_id: integer("source_resource_id").notNull(),
    target_resource_id: integer("target_resource_id").notNull(),
    relationship_name: varchar("relationship_name", { length: 100 }).notNull(),
    attributes: jsonb("attributes").default({}),
    start_at: timestamp("start_at"),
    end_at: timestamp("end_at"),
    is_active: boolean("is_active").default(true),
    is_deleted: boolean("is_deleted").default(false),
    metadata: jsonb("metadata").default({}),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  }
);

// ResourceField table
export const resourceFields = pgTable("resource_fields", {
  id: serial("id").primaryKey(),
  position: integer("position").default(0),
  resource_tag_id: integer("resource_tag_id").notNull(),
  field_name: varchar("field_name", { length: 255 }).notNull(),
  data_type: varchar("data_type", { length: 50 }).notNull(),
  description: text("description"),
  label: text("label"),
  options_resource_type: varchar("options_resource_type", { length: 255 }),
  validation: text("validation"),
  is_required: boolean("is_required").default(false),
  is_deleted: boolean("is_deleted").default(false),
  is_column: boolean("is_column").default(false),
  has_filter: boolean("has_filter").default(false),
  is_hidden: boolean("is_hidden").default(false),
  is_searchable: boolean("is_searchable").default(false),
  is_sortable: boolean("is_sortable").default(false),
  is_unique: boolean("is_unique").default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// AuditLogs table
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    action_type: varchar("action_type", { length: 255 }).notNull(),
    status: auditStatusEnum("status").default("PENDING").notNull(),
    executed_at: timestamp("executed_at"),
    completed_at: timestamp("completed_at"),
    initiator: varchar("initiator", { length: 255 }),
    target_entity: varchar("target_entity", { length: 255 }),
    target_id: varchar("target_id", { length: 255 }),
    execution_id: varchar("execution_id", { length: 255 }),
    request_data: jsonb("request_data").default({}),
    response_data: jsonb("response_data").default({}),
    context: jsonb("context").default({}),
    error_details: text("error_details"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    status_idx: index("audit_logs_status_idx").on(table.status),
    executed_at_idx: index("audit_logs_executed_at_idx").on(table.executed_at),
  })
);

// ActionTemplate table
export const actionTemplates = pgTable("action_templates", {
  id: serial("id").primaryKey(),

  // Basic info
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Output & context mapping
  output_as: varchar("output_as", { length: 255 }),
  context_as: varchar("context_as", { length: 255 }),
  output_template: jsonb("output_template").default({}),
  context_template: jsonb("context_template").default({}),

  // Tool execution
  tool_type: toolTypeEnum("tool_type").default("DB_OPERATION"),
  config: jsonb("config").default({}),
  conditions: jsonb("conditions").default({}),
  // Hooks (arrays of objects, not single objects)
  pre_hooks: jsonb("pre_hooks").default([]),     // run before main execution
  post_hooks: jsonb("post_hooks").default([]),   // run after main execution
  success_hooks: jsonb("success_hooks").default([]), // triggered when execution succeeds
  error_hooks: jsonb("error_hooks").default([]),     // triggered when execution fails

  // Parameters & AI integration
  parameters: jsonb("parameters").default([]),

  // Flags & options
  is_active: boolean("is_active").default(true),
  is_chat_enabled: boolean("is_chat_enabled").default(true),
  is_sms_enabled: boolean("is_sms_enabled").default(false),
  is_default: boolean("is_default").default(false),

  // Associations
  resource_type: resourceTypeEnum("resource_type")
    .notNull()
    .default("resource"),
  tenant_id: integer("tenant_id").notNull(),

  // Timestamps
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});




// ActionTrigger table
export const actionTriggers = pgTable("action_triggers", {
  id: serial("id").primaryKey(),
  trigger_type: triggerTypeEnum("trigger_type").notNull().default("IMMEDIATE"),
  action_template_id: integer("action_template_id").notNull(),
  tool_type: toolTypeEnum("tool_type").default("DB_OPERATION"),
  trigger_config: jsonb("trigger_config").default({}),
  parameters: jsonb("parameters").default({}),
  next_execution: timestamp("next_execution"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// AiPreset table
export const aiPresets = pgTable("ai_presets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  model_name: varchar("model_name", { length: 255 }),
  base_model: varchar("base_model", { length: 255 }),
  version: varchar("version", { length: 50 }).default("1.0.0"),
  system_instruction: text("system_instruction").notNull(),
  prompt_instruction: text("prompt_instruction"),
  system_prompt: text("system_prompt"),
  pre_hooks: jsonb("pre_hooks").default({}),
  post_hooks: jsonb("post_hooks").default({}),
  metadata: jsonb("metadata").default({}),
  is_trainable: boolean("is_trainable").default(false),
  accuracy_threshold: real("accuracy_threshold").default(0.5),
  last_trained_at: date("last_trained_at"),
  context_window: integer("context_window"),
  is_active: boolean("is_active").default(true),
  output_schema: jsonb("output_schema").default({}),
  options: jsonb("options").default({}),
  parameters: jsonb("parameters").default({ temperature: 0.3, num_ctx: 4096, top_p: 40 }),
  anti_hallucination_rules: jsonb("anti_hallucination_rules").default([
    "If unsure, respond with 'I don't know'",
  ]),
  min_fine_tune_confidence: real("min_fine_tune_confidence").default(0.85),
  tenant_id: integer("tenant_id")
    .references(() => resourceTags.id, { onDelete: "cascade" })
    .notNull(),
});

// Conversation table
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  context: jsonb("context").default({}),
  metadata: jsonb("metadata").default({}),
  session_id: varchar("session_id", { length: 255 }),
  tenant_id: integer("tenant_id")
    .references(() => resourceTags.id, { onDelete: "cascade" })
    .notNull(),
  ai_preset_id: integer("ai_preset_id")
    .references(() => aiPresets.id, { onDelete: "cascade" })
    .notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  tread_id: integer("tread_id").notNull().default(0),
  role: messageRoleEnum("role").notNull(),
  name: varchar("name", { length: 255 }),
  content: jsonb("content").default({}),
  tokens: integer("tokens").default(0),
  confidence_score: real("confidence_score").default(0.7),
  is_training_candidate: boolean("is_training_candidate").default(false),
  conversation_id: integer("conversation_id"),
  tenant_id: integer("tenant_id"),
  ai_preset_id: integer("ai_preset_id"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});



export const users = schema_1.users;
export const bettings = schema_1.bettings;
export const draws = schema_1.draws;
export const combinations = schema_1.masterCombinations;







/* =====================
   RELATIONS
===================== */
export const resourceRelationshipRelations = relations(resourceRelationships, ({ one }) => ({
  tenant: one(resourceTags, {
    fields: [resourceRelationships.tenant_id],
    references: [resourceTags.id],
  }),
  source: one(resourceTags, {
    fields: [resourceRelationships.source_resource_id],
    references: [resourceTags.id],
  }),
  target: one(resourceTags, {
    fields: [resourceRelationships.target_resource_id],
    references: [resourceTags.id],
  }),
}));

export const resourceTagRelations = relations(resourceTags, ({ one, many }) => ({
  tenant: one(resourceTags, {
    fields: [resourceTags.tenant_id],
    references: [resourceTags.id],
  }),
  action_templates: many(actionTemplates),
  conversations: many(conversations),
  ai_presets: many(aiPresets),
}));

export const aiPresetRelations = relations(aiPresets, ({ one }) => ({
  tenant: one(resourceTags, {
    fields: [aiPresets.tenant_id],
    references: [resourceTags.id],
  }),
}));

export const conversationRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(resourceTags, {
    fields: [conversations.tenant_id],
    references: [resourceTags.id],
  }),
  messages: many(messages),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversation_id],
    references: [conversations.id],
  }),
}));


