import express from 'express';
import { eq, and, ilike, inArray } from 'drizzle-orm';
import { db } from '../config/db.js'; // Drizzle ORM instance
import { resourceTags, resourceFields } from '../db/schema.js';
import { mapResourceTypes, mapSingleResource } from '../utils/mappers.js';

const router = express.Router();

/**
 * Create a new resource type
 */
router.post('/', async (req, res) => {
  const { resource_name, fields } = req.body;

  if (!resource_name) return res.status(400).json({ error: 'resource_name is required' });

  try {
    const existing_resource = await db
      .select()
      .from(resourceTags)
      .where(
        and(
          eq(resourceTags.tenant_id, req.tenantId),
          eq(resourceTags.resource_type, 'config'),
          ilike(resourceTags.resource_name, resource_name)
        )
      );

    if (existing_resource.length > 0) {
      return res.status(409).json({
        error: 'Resource with this name already exists',
        existing_resource: existing_resource[0],
      });
    }

    const inserted_resource = await db
      .insert(resourceTags)
      .values({
        resource_name: resource_name.toLowerCase(),
        resource_type: 'config',
        tenant_id: req.tenantId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();

    const resource_id = inserted_resource[0].id;

    if (fields && fields.length > 0) {
      await db.insert(resourceFields).values(
        fields.map((f) => ({
          ...f,
          resource_tag_id: resource_id,
          resource_parent_id: req.tenantId,
          created_at: new Date(),
          updated_at: new Date(),
        }))
      );
    }

    const full_resource = await db
      .select()
      .from(resourceTags)
      .where(eq(resourceTags.id, resource_id))
      .leftJoin(resourceFields, eq(resourceFields.resource_tag_id, resourceTags.id));

    res.status(201).json(mapSingleResource(full_resource));
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * Get all resource types
 */
router.get('/', async (req, res) => {
  try {
    const resource_types = await db
      .select()
      .from(resourceTags)
      .leftJoin(resourceFields, eq(resourceFields.resource_tag_id, resourceTags.id))
      .where(
        and(
          eq(resourceTags.resource_type, 'config'),
          eq(resourceTags.is_deleted, false),
          req.tenantId ? eq(resourceTags.tenant_id, req.tenantId) : undefined
        )
      );

    res.json(mapResourceTypes(resource_types));
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * Get a resource type by ID or name
 */
router.get('/:identifier', async (req, res) => {
  const { identifier } = req.params;

  if (!identifier) return res.status(400).json({ error: 'identifier required' });

  let condition;
  if (/^\d+$/.test(identifier)) {
    condition = eq(resourceTags.id, Number(identifier));
  } else {
    condition = ilike(resourceTags.resource_name, identifier);
  }

  try {
    const resource = await db
      .select()
      .from(resourceTags)
      .leftJoin(resourceFields, eq(resourceFields.resource_tag_id, resourceTags.id))
      .where(
        and(
          condition,
          eq(resourceTags.resource_type, 'config'),
          eq(resourceTags.is_deleted, false),
          req.tenant_id ? eq(resourceTags.tenant_id, req.tenant_id) : undefined
        )
      );

    if (!resource.length) return res.status(404).json({ message: 'Resource Not Found!' });

    res.json(mapSingleResource(resource));
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * Update a resource type
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { fields, ...resource_data } = req.body;

  try {
    const [resource] = await db
      .select()
      .from(resourceTags)
      .where(eq(resourceTags.id, Number(id)));

    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    // ✅ Always update updated_at
    await db
      .update(resourceTags)
      .set({
        ...resource_data,
        tenant_id: req.tenantId,
        updated_at: new Date(),
      })
      .where(eq(resourceTags.id, Number(id)));

    if (fields && fields.length > 0) {
      // Existing fields for this resource
      const existing_fields = await db
        .select()
        .from(resourceFields)
        .where(eq(resourceFields.resource_tag_id, Number(id)));

      const existing_ids = existing_fields.map((f) => f.id);
      const incoming_ids = fields.filter((f) => f.id).map((f) => f.id);
      const ids_to_delete = existing_ids.filter((fid) => !incoming_ids.includes(fid));

      if (ids_to_delete.length > 0) {
        await db.delete(resourceFields).where(inArray(resourceFields.id, ids_to_delete));
      }

      // Upsert incoming fields
      for (const f of fields) {
        const baseField = {
          position: f.position,
          field_name: f.field_name,
          data_type: f.data_type,
          description: f.description || null,
          label: f.label || null,
          options_resource_type: f.options_resource_type || null,
          validation: f.validation || null,
          is_required: f.is_required ?? false,
          is_deleted: f.is_deleted ?? false,
          is_column: f.is_column ?? false,
          has_filter: f.has_filter ?? false,
          is_hidden: f.is_hidden ?? false,
          is_searchable: f.is_searchable ?? false,
          is_sortable: f.is_sortable ?? false,
          is_unique: f.is_unique ?? false,
          is_disabled: f.is_disabled ?? false,
          default_value: f.default_value || null,
          resource_parent_id: f.resource_parent_id || null,
          updated_at: new Date(),
        };

        if (f.id) {
          await db
            .update(resourceFields)
            .set(baseField)
            .where(eq(resourceFields.id, f.id));
        } else {
          await db.insert(resourceFields).values({
            ...baseField,
            resource_tag_id: Number(id),
            created_at: new Date(),
          });
        }
      }
    }

    const updated_resource_rows = await db
      .select()
      .from(resourceTags)
      .leftJoin(resourceFields, eq(resourceFields.resource_tag_id, resourceTags.id))
      .where(eq(resourceTags.id, Number(id)));

    // ✅ Map rows → single object with fields[]
    res.json(mapSingleResource(updated_resource_rows));
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


/**
 * Delete a resource type
 */
router.delete('/:id', async (req, res) => {
  try {
    const resource_id = Number(req.params.id);

    await db.transaction(async (tx) => {
      await tx
        .update(resourceTags)
        .set({ is_deleted: true })
        .where(eq(resourceTags.id, resource_id));

      await tx
        .update(resourceFields)
        .set({ is_deleted: true })
        .where(eq(resourceFields.resource_tag_id, resource_id));
    });

    res.json({ message: 'Resource type and associated fields deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
