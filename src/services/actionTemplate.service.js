// src/services/resourceTagService.js
import { db } from "../config/db.js";
import { resourceTags, actionTemplates } from "../db/schema.js";
import { eq, ilike, ne, and, sql } from "drizzle-orm";
import { sanitizePhoneNumber } from "../utils/helpers.js";

// === Fetchers ===

export async function getResourceTypes(excludeOrganizations = false) {
  const rows = await db
    .selectDistinct({ resourceName: resourceTags.resourceName })
    .from(resourceTags)
    .where(and(eq(resourceTags.isDeleted, false), eq(resourceTags.resourceType, "config")));

  const typeNames = rows.map(r => r.resourceName);
  return excludeOrganizations
    ? typeNames.filter(t => t.toLowerCase() !== "organizations")
    : typeNames;
}

export async function getOrganizations() {
  const rows = await db
    .select()
    .from(resourceTags)
    .where(
      and(
        ilike(resourceTags.resourceName, "organizations"),
        ne(resourceTags.resourceType, "config"),
        eq(resourceTags.isDeleted, false)
      )
    );

  return rows.map(r => r.attributes?.name || "Unnamed");
}

export async function getOrganizationsByNumber(num) {
  const clean = sanitizePhoneNumber(num);
  const rows = await db
    .select()
    .from(resourceTags)
    .where(
      and(
        ilike(resourceTags.resourceName, "organizations"),
        eq(resourceTags.resourceType, "resource"),
        eq(resourceTags.isDeleted, false),
        sql`${resourceTags.attributes} ->> 'phoneNumber' = ${clean}`
      )
    );

  return rows[0] || null;
}

// === Validators ===

export async function validateFields(resourceType, values) {
  const tag = await db
    .select()
    .from(resourceTags)
    .where(
      and(
        eq(resourceTags.resourceType, "config"),
        eq(resourceTags.resourceName, resourceType),
        eq(resourceTags.isDeleted, false)
      )
    )
    .limit(1);

  const definedFields = tag[0]?.fields || [];
  const validKeys = definedFields.map(f => f.fieldName);

  const filtered = {};
  for (const key of Object.keys(values)) {
    if (validKeys.includes(key)) {
      filtered[key] = values[key];
    }
  }

  return {
    values: filtered,
    missingFields: definedFields.filter(f => !(f.fieldName in values)),
  };
}

// === Mutators ===

export async function createResource(resourceType, values, options = {}) {
  const { values: validatedValues } = await validateFields(resourceType, values);
  const relationships = (options.relationships || []).filter(r => r.type && r.refType && r.refId);

  // Check existing
  const existing = await db
    .select()
    .from(resourceTags)
    .where(
      and(
        eq(resourceTags.resourceName, resourceType),
        sql`${resourceTags.attributes} @> ${JSON.stringify(validatedValues)}`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    const newRels = [...(current.relationships || []), ...relationships];
    const [updated] = await db
      .update(resourceTags)
      .set({ relationships: newRels })
      .where(eq(resourceTags.id, current.id))
      .returning();
    return updated;
  }

  // Insert new
  const [inserted] = await db
    .insert(resourceTags)
    .values({
      resourceType: "resource",
      resourceName: resourceType,
      attributes: validatedValues,
      relationships,
      resourceParentId: options.resourceParent || null,
      isDeleted: false,
    })
    .returning();

  return inserted;
}

export async function updateResourceById(resourceId, updates) {
  const updateData = {};

  if (updates.values) {
    const { values } = await validateFields(updates.resourceType, updates.values);
    updateData.attributes = values;
  }

  if (updates.relationships) {
    updateData.relationships = updates.relationships.filter(r => r.type && r.refType && r.refId);
  }

  const [updated] = await db
    .update(resourceTags)
    .set(updateData)
    .where(eq(resourceTags.id, resourceId))
    .returning();

  return updated;
}

export async function deleteResourceById(resourceId) {
  await db.update(resourceTags).set({ isDeleted: true }).where(eq(resourceTags.id, resourceId));
  return { id: resourceId, deleted: true };
}


export async function findActionTemplateByName(identifier) {
  try {
    let whereClause;

    // 🔎 Check if identifier is numeric → search by ID
    if (/^\d+$/.test(identifier)) {
      whereClause = eq(actionTemplates.id, Number(identifier));
    } else {
      // 🔎 Otherwise → search by name (case-insensitive)
      whereClause = ilike(actionTemplates.name, `%${identifier}%`);
    }

    // Step 1: Get action template
    const templateRows = await db
      .select()
      .from(actionTemplates)
      .where(whereClause)
      .limit(1);

    if (!templateRows.length) return null;
    const template = templateRows[0];


    return {
      ...template
    };
  } catch (err) {
    console.error("[findActionTemplate] Error:", err);
    throw err;
  }
}



export async function findActionTemplates(type, tenantId = null) {
  try {
    // if (!type) return null;

    let whereClause = [];

    // Chat-enabled filter
    if (type === "chat") {
      whereClause.push(eq(actionTemplates.is_chat_enabled, true));
    }

    // SMS-enabled filter
    if (type === "sms") {
      whereClause.push(eq(actionTemplates.is_sms_enabled, true));
    }

    // Tenant filter
    if (tenantId) {
      whereClause.push(eq(actionTemplates.tenant_id, tenantId));
    }


    const templates = await db
      .select({
      id: actionTemplates.id,
      name: actionTemplates.name,
      description: actionTemplates.description,
      conditions: actionTemplates.conditions,
      tool_type: actionTemplates.tool_type,
      parameters: actionTemplates.parameters,
      config: actionTemplates.config,
      pre_hooks: actionTemplates.pre_hooks,
      post_hooks: actionTemplates.post_hooks,
      output_as: actionTemplates.output_as,
      output_template: actionTemplates.output_template,
      context_as: actionTemplates.context_as,
      context_template: actionTemplates.context_template,
      updated_at: actionTemplates.updated_at
    })
      .from(actionTemplates)
      .where(and(...whereClause));

    return templates;
  } catch (err) {
    console.error("[findActionTemplates] Error:", err);
    throw err;
  }
}
