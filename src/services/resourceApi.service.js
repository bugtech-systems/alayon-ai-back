// src/services/ResourceService.js
import { db } from "../config/db.js";
import { resourceTags, resourceFields, resourceRelationships } from "../db/schema.js";
import { eq, and, ilike, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

class ResourceService {
  async validateResourceAttributes(attributes, resourceName, tenantId, tx = db) {
    // 1. Find parent config resource
    const parentResource = await tx.query.resourceTags.findFirst({
      where: and(
        eq(resourceTags.resourceType, "config"),
        eq(resourceTags.isDeleted, false),
        ilike(resourceTags.resourceName, resourceName),
        tenantId ? eq(resourceTags.tenantId, tenantId) : undefined
      ),
      with: {
        fields: true, // requires a defined relation in drizzle config
      },
    });

    if (!parentResource) {
      throw new Error(`Parent config resource not found for name: ${resourceName}`);
    }

    const fieldDefinitions = parentResource.fields.reduce((acc, field) => {
      acc[field.fieldName] = {
        type: field.dataType,
        isRequired: field.isRequired,
        isUnique: field.isUnique,
      };
      return acc;
    }, {});

    const validationErrors = [];

    // Required fields
    const missing = Object.entries(fieldDefinitions)
      .filter(([_, def]) => def.isRequired)
      .filter(([name]) => attributes[name] === undefined)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw {
        name: "ValidationError",
        message: `Missing required fields: ${missing.join(", ")}`,
      };
    }

    // Type validation
    for (const [fieldName, value] of Object.entries(attributes)) {
      const def = fieldDefinitions[fieldName];
      if (!def) continue;
      let isValid = true;

      switch (def.type) {
        case "string":
          isValid = typeof value === "string";
          break;
        case "number":
          isValid = typeof value === "number";
          break;
        case "boolean":
          isValid = typeof value === "boolean";
          break;
        case "array":
          isValid = Array.isArray(value);
          break;
        case "object":
          isValid = typeof value === "object" && !Array.isArray(value);
          break;
      }

      if (!isValid) {
        validationErrors.push({ field: fieldName, expected: def.type, got: typeof value });
      }
    }

    if (validationErrors.length > 0) {
      throw {
        name: "ValidationError",
        details: validationErrors,
      };
    }

    // Unique checks
    for (const [fieldName, def] of Object.entries(fieldDefinitions)) {
      if (!def.isUnique) continue;
      const existing = await tx.query.resourceTags.findFirst({
        where: and(
          eq(resourceTags.resourceParentId, parentResource.id),
          eq(resourceTags.isDeleted, false),
          sql`${resourceTags.attributes}->>${fieldName} = ${attributes[fieldName]}`
        ),
      });
      if (existing) {
        throw {
          name: "DuplicateError",
          details: { field: fieldName, value: attributes[fieldName] },
        };
      }
    }

    return { parentResource, fieldDefinitions };
  }

  async createResource({ resource_name, attributes, tenant_id, resource_parent_id, relationships = [] }, tx = db) {
    const { parentResource } = await this.validateResourceAttributes(
      attributes,
      resource_name,
      tenant_id,
      tx
    );

    const [resource] = await tx.insert(resourceTags).values({
      resourceType: "resource",
      resourceName: resource_name,
      resourceParentId: resource_parent_id || parentResource.id,
      tenantId: tenant_id,
      attributes,
    }).returning();

    if (relationships.length > 0) {
      await this.createRelationships(resource.id, relationships, tenant_id, tx);
    }

    return resource;
  }

  async createRelationships(sourceResourceId, relationships, tenantId, tx = db) {
    for (const rel of relationships) {
      if (!rel.target_resource_id || !rel.relationship_name) {
        throw new Error("Invalid relationship payload");
      }

      const [target] = await tx
        .select()
        .from(resourceTags)
        .where(eq(resourceTags.id, rel.target_resource_id));

      if (!target) {
        throw new Error(`Target resource ${rel.target_resource_id} not found`);
      }

      await tx.insert(resourceRelationships).values({
        sourceResourceId,
        targetResourceId: rel.target_resource_id,
        relationshipName: rel.relationship_name,
        tenantId,
        attributes: rel.attributes || {},
        isActive: rel.isActive !== false,
      });
    }
  }
  

 async  getResourceTypeConfig(identifier, tenantId) {
  try {
    // aliases
    const outgoingTarget = alias(resourceTags, "outgoing_target");
    const incomingSource = alias(resourceTags, "incoming_source");
    const incomingRel = alias(resourceRelationships, "incoming_relationship");

    // base condition
    const conditions = [
      eq(resourceTags.resource_type, "config"),
      eq(resourceTags.resource_name, identifier),
      eq(resourceTags.is_deleted, false),
    ];
    if (tenantId) {
      conditions.push(eq(resourceTags.tenant_id, tenantId));
    }

    const rows = await db
      .select({
        resource: resourceTags,
        outgoing_relationship: resourceRelationships,
        outgoing_target: {
          id: outgoingTarget.id,
          name: outgoingTarget.resource_name,
          type: outgoingTarget.resource_type,
        },
        incoming_relationship: incomingRel,
        incoming_source: {
          id: incomingSource.id,
          name: incomingSource.resource_name,
          type: incomingSource.resource_type,
        },
      })
      .from(resourceTags)
      // outgoing
      .leftJoin(
        resourceRelationships,
        and(
          eq(resourceRelationships.source_resource_id, resourceTags.id),
          eq(resourceRelationships.is_deleted, false)
        )
      )
      .leftJoin(
        outgoingTarget,
        and(
          eq(resourceRelationships.target_resource_id, outgoingTarget.id),
          eq(outgoingTarget.is_deleted, false)
        )
      )
      // incoming
      .leftJoin(
        incomingRel,
        and(
          eq(incomingRel.target_resource_id, resourceTags.id),
          eq(incomingRel.is_deleted, false)
        )
      )
      .leftJoin(
        incomingSource,
        and(
          eq(incomingRel.source_resource_id, incomingSource.id),
          eq(incomingSource.is_deleted, false)
        )
      )
      .where(and(...conditions))
      .limit(1);

    return rows[0] || null;
  } catch (error) {
    console.error("Error in getResourceTypeConfig:", error);
    throw error;
  }
}



  
}

export default new ResourceService();
