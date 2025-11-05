import { db } from "../config/db.js";
import { resourceTags, resourceFields, actionTemplates, resourceRelationships } from "../db/schema.js";
import { eq, ne, ilike, and, sql, desc } from "drizzle-orm";
import { sanitizePhoneNumber } from "../utils/helpers.js";
import { mapResourceTypes, mapSingleResource, deepMerge } from "../utils/mappers.js";




// === Fetchers ===

export async function getResourceTypes(excludeOrganizations = false) {
  const rows = await db
    .selectDistinct({ resource_name: resourceTags.resource_name })
    .from(resourceTags)
    .where(and(eq(resourceTags.is_deleted, false), eq(resourceTags.resource_type, "config")));

  const typeNames = rows.map(r => r.resource_name);
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
        ilike(resourceTags.resource_name, "organizations"),
        ne(resourceTags.resource_type, "config"),
        eq(resourceTags.is_deleted, false)
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
        ilike(resourceTags.resource_name, "organizations"),
        eq(resourceTags.resource_type, "resource"),
        eq(resourceTags.is_deleted, false),
        sql`${resourceTags.attributes} ->> 'gsmNumber' = ${clean}`
      )
    );

  return rows[0] || null;
}

// === Fields ===

export async function getFieldsByResourceType(resourceType, tenant_id) {
  const row = await db
    .select()
    .from(resourceTags)
    .leftJoin(resourceFields, eq(resourceFields.resource_tag_id, resourceTags.id))
    .where(
      and(
        eq(resourceTags.resource_type, "config"),
        eq(resourceTags.resource_name, resourceType),
        ...(tenant_id ? [eq(resourceTags.tenant_id, tenant_id)] : []),
        eq(resourceTags.is_deleted, false)
      )
    )
    // .limit(1);


  return mapResourceTypes(row)[0]?.fields || [];
}

export async function validateFields(resourceType, values, tenant_id) {
  const definedFields = await getFieldsByResourceType(resourceType, tenant_id);
  
  const validKeys = definedFields.map(f => f.field_name);
  const filtered = {};

  for (const key of Object.keys(values)) {
    if (validKeys.includes(key)) {
      filtered[key] = values[key];
    }
  }

  return {
    values: filtered,
    missingFields: definedFields.filter(f => !(f.field_name in values)),
  };
}

// === Mutators ===

export async function createResource(resourceType, values, options = {}) {
  // Validate fields
  // const { values: validatedValues } = await validateFields(
  //   resourceType,
  //   values,
  //   options.tenant_id
  // );

  const relationships = (options.relationships || []).filter(
    (r) => r.relationship_name && r.target_resource_id
  );



  // Insert new resource
  const [inserted] = await db
    .insert(resourceTags)
    .values({
      resource_type: 'resource',
      resource_name: resourceType,
      attributes: values || {},
      relationships: relationships || [],
      tenant_id: options.tenant_id,
      resource_parent_id: options.resource_parent || null,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning();

  // Create relationships
  if (relationships.length > 0) {
    await createRelationships({
      sourceResourceId: inserted.id,
      relationships,
      tenant_id: options.tenant_id,
    });
  }

  return inserted;
}

export async function updateResourceById(resourceId, updates, tenant_id) {
  const updateData = { updated_at: new Date() };

  // ✅ Attributes
  if (updates.values) {
    const { values } = await validateFields(
      updates.resource_type,
      updates.values,
      tenant_id
    );
    updateData.attributes = values;
  }

  // ✅ Relationships (legacy JSON column)
  let relationships = [];
  if (updates.relationships) {
    relationships = updates.relationships.filter(
      (r) => r.relationship_name && r.target_resource_id
    );
    updateData.relationships = relationships;
  }

  // ✅ Update resourceTags row
  const [updated] = await db
    .update(resourceTags)
    .set(updateData)
    .where(eq(resourceTags.id, resourceId))
    .returning();

  if (!updated) return null;

  // ✅ Sync relationships table
  if (relationships.length > 0) {
    // Clear old relationships for this resource (to replace fully)
    await db
      .delete(resourceRelationships)
      .where(
        and(
          eq(resourceRelationships.source_resource_id, resourceId),
          eq(resourceRelationships.tenant_id, tenant_id)
        )
      );

    // Insert fresh relationships
    for (const rel of relationships) {
      await db.insert(resourceRelationships).values({
        source_resource_id: resourceId,
        target_resource_id: rel.target_resource_id,
        relationship_name: rel.relationship_name || rel.relationship_type,
        tenant_id,
        attributes: rel.attributes || null,
        start_at: rel.start_at || null,
        end_at: rel.end_at || null,
        is_active: rel.is_active !== false,
        metadata: rel.metadata || {},
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  return updated;
}


export async function deleteResourceById(resourceId) {
  await db.update(resourceTags).set({ is_deleted: true }).where(eq(resourceTags.id, resourceId));
  return { id: resourceId, deleted: true };
}

export async function getAll(type, tenant_id) {
  return await db
    .select()
    .from(resourceTags)
    .where(
      and(
        eq(resourceTags.resource_type, "resource"),
        eq(resourceTags.resource_name, type),
        eq(resourceTags.is_deleted, false),
        eq(resourceTags.tenant_id, tenant_id)
      )
    );
}

export async function getById(idOrName) {

  const rows = await db
    .select()
    .from(resourceTags)
    .where(
      typeof idOrName === "number"
        ? eq(resourceTags.id, idOrName)
        : eq(resourceTags.resource_name, idOrName)
    );


  return typeof idOrName === "number" ? rows[0] || null : rows || null;
}


export async function create(data) {
  const [newResource] = await db
    .insert(resourceTags)
    .values({ ...data, created_at: new Date(), updated_at: new Date() })
    .returning();
  return newResource;
}

export async function update(id, updates) {
  // First, get the current record
  const [current] = await db
    .select()
    .from(resourceTags)
    .where(eq(resourceTags.id, id))
    .limit(1);

  if (!current) {
    throw new Error(`Resource tag with id ${id} not found`);
  }

  // Deep merge the updates with the current record, preserving nested objects
  const mergedUpdates = deepMerge(current, updates);

  const [updated] = await db
    .update(resourceTags)
    .set(mergedUpdates)
    .where(eq(resourceTags.id, id))
    .returning();

  return updated;
}

export async function remove(id) {
  await db.update(resourceTags).set({ is_deleted: true }).where(eq(resourceTags.id, id));
}


  // 🔎 Get single resource by id or resource_name with relationships
  export async function getResourceById(identifier, tenant_id, { include_parent = false } = {}) {
    let whereClause;

    if (/^\d+$/.test(identifier)) {
      whereClause = and(eq(resourceTags.tenant_id, tenant_id), eq(resourceTags.is_deleted, false), eq(resourceTags.id, Number(identifier)), );
    } else {
      whereClause = and(eq(resourceTags.tenant_id, tenant_id), eq(resourceTags.is_deleted, false), eq(resourceTags.resource_name, identifier));
    }

    const [resource] = await db
      .select()
      .from(resourceTags)
      .where(whereClause);

    if (!resource) return null;

    // Fetch outgoing + incoming relationships
    const outgoing = await db
      .select({
        id: resourceRelationships.id,
        relationship_name: resourceRelationships.relationship_name,
        target_resource: resourceTags,
      })
      .from(resourceRelationships)
      .leftJoin(resourceTags,   and(
      eq(resourceRelationships.target_resource_id, resourceTags.id),
      eq(resourceTags.is_deleted, false) // ✅ moved into join
    ))
      .where(
        and(
          eq(resourceRelationships.source_resource_id, resource.id),
          eq(resourceRelationships.tenant_id, tenant_id),
          eq(resourceRelationships.is_deleted, false)
        )
      );

    const incoming = await db
      .select({
        id: resourceRelationships.id,
        relationship_name: resourceRelationships.relationship_name,
        source_resource: resourceTags,
      })
      .from(resourceRelationships)
      .leftJoin(resourceTags,   and(
      eq(resourceRelationships.target_resource_id, resourceTags.id),
      eq(resourceTags.is_deleted, false) // ✅ moved into join
    ))
      .where(
        and(
          eq(resourceRelationships.target_resource_id, resource.id),
          eq(resourceRelationships.tenant_id, tenant_id),
          eq(resourceRelationships.is_deleted, false)
        )
      );

    return {
      ...resource,
      incoming_relationships: incoming,
      outgoing_relationships: outgoing,
      relationships: {
        outgoing,
        incoming
        },
    };
  }

  // 🔎 Get all resources by type (config parent or "organizations")
// 🔎 Get all resources by type (config parent or "organizations")
export async function getResourcesByType(identifier, tenant_id) {
  let parent_id;

  if (/^\d+$/.test(identifier)) {
    parent_id = Number(identifier);
  } else {
    const [parentResource] = await db
      .select({ id: resourceTags.id })
      .from(resourceTags)
      .where(
        and(
          eq(resourceTags.is_deleted, false),
          eq(resourceTags.resource_type, "config"),
          tenant_id ? eq(resourceTags.tenant_id, tenant_id) : sql`TRUE`,
          ilike(resourceTags.resource_name, identifier)
        )
      );

    if (!parentResource) return [];
    parent_id = parentResource.id;
  }

  const resources = await db
    .select()
    .from(resourceTags)
    .where(
      and(
        eq(resourceTags.resource_type, "resource"),
        identifier !== "organizations"
          ? eq(resourceTags.resource_parent_id, parent_id)
          : eq(resourceTags.resource_name, "organizations"),
        eq(resourceTags.is_deleted, false),
        tenant_id && identifier !== "organizations"
          ? eq(resourceTags.tenant_id, tenant_id)
          : sql`TRUE`
      )
    )
    .orderBy(desc(resourceTags.created_at));

  if (!resources.length) return [];

  // 🔗 Fetch relationships for each resource (incoming + outgoing)
const enrichedResources = await Promise.all(
  resources.map(async (resource) => {
    const outgoing = await db
      .select({
        id: resourceRelationships.id,
        relationship_name: resourceRelationships.relationship_name,
        target_resource: resourceTags,
      })
      .from(resourceRelationships)
      .leftJoin(
        resourceTags,
        and(
          eq(resourceRelationships.target_resource_id, resourceTags.id),
          eq(resourceTags.is_deleted, false) // ✅ exclude deleted tags
        )
      )
      .where(
        and(
          eq(resourceRelationships.source_resource_id, resource.id),
          eq(resourceRelationships.is_deleted, false) // ✅ exclude deleted relationships
          // eq(resourceRelationships.tenant_id, tenant_id), // optional if you want tenant isolation
        )
      );

    const incoming = await db
      .select({
        id: resourceRelationships.id,
        relationship_name: resourceRelationships.relationship_name,
        source_resource: resourceTags,
      })
      .from(resourceRelationships)
      .leftJoin(
        resourceTags,
        and(
          eq(resourceRelationships.source_resource_id, resourceTags.id),
          eq(resourceTags.is_deleted, false) // ✅ exclude deleted tags
        )
      )
      .where(
        and(
          eq(resourceRelationships.target_resource_id, resource.id),
          eq(resourceRelationships.is_deleted, false) // ✅ exclude deleted relationships
          // eq(resourceRelationships.tenant_id, tenant_id),
        )
      );

    return {
      ...resource,
      incoming_relationships: incoming,
      outgoing_relationships: outgoing,
      relationships: { incoming, outgoing },
    };
  })
);


  return enrichedResources;
}

export const getOrganizationById = async (id) => {
    const org = await db.select().from(resourceTags).where(eq(resourceTags.id, id));

    return org[0];
};


export async function createRelationships({ 
  sourceResourceId, 
  relationships, 
  tenant_id, 
  transaction = db 
}) {
  if (!sourceResourceId) {
    throw new Error('Source resource ID is required');
  }

  if (!Array.isArray(relationships)) {
    throw new Error('Relationships must be an array');
  }

  const results = [];
  for (const rel of relationships) {
    if (!rel.target_resource_id || (!rel.relationship_name && !rel.relationship_type)) {
      throw new Error('Each relationship requires target_resource_id and relationship_name');
    }

    // Check if target resource exists
    const [targetExists] = await transaction
      .select()
      .from(resourceTags)
      .where(
        and(
          eq(resourceTags.id, rel.target_resource_id),
          eq(resourceTags.tenant_id, tenant_id),
          eq(resourceTags.is_deleted, false)
        )
      )
      .limit(1);

    if (!targetExists) {
      throw new Error(
        `Target resource ${rel.target_resource_id} not found for this tenant`
      );
    }

    // Insert relationship
    const [inserted] = await transaction
      .insert(resourceRelationships)
      .values({
        source_resource_id: sourceResourceId,
        target_resource_id: rel.target_resource_id,
        relationship_name: rel.relationship_name || rel.relationship_type,
        tenant_id,
        attributes: rel.attributes || null,
        start_at: rel.start_at || null,
        end_at: rel.end_at || null,
        is_active: rel.is_active !== false,
        metadata: rel.metadata || {},
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();

    results.push(inserted);
  }

  return results;
}


