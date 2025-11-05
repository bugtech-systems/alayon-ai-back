// src/routes/resourceRoutes.js
import express from "express";
import { eq, and, ilike, inArray } from 'drizzle-orm';
import { db } from '../config/db.js'; // Drizzle ORM instance
import { resourceTags, resourceFields } from '../db/schema.js';
import * as resourceService from "../services/resourceTag.service.js";


const router = express.Router();

/**
 * Standardizes the resource response format
 */
const formatResourceResponse = (resource, connection) => {
    if (!resource) return null;

    const formatRelationships = (relationships, direction) => {
        const formatted = {};

        relationships?.forEach(rel => {
            const relatedResource =
                direction === "incoming" ? rel.source_resource : rel.target_resource;

            if (!relatedResource) return;

            // Apply connection filter (if provided)
            if (
                connection &&
                String(relatedResource.resource_name).toLowerCase() !==
                    String(connection).toLowerCase()
            ) {
                return;
            }

            const key = relatedResource.resource_name;
            if (!formatted[key]) {
                formatted[key] = [];
            }

            formatted[key].push({
                id: relatedResource.id,
                resource_type: "resource",
                resource_name: relatedResource.resource_name,
                position: relatedResource.position,
                attributes: { ...relatedResource.attributes },
                is_deleted: relatedResource.is_deleted,
                is_active: relatedResource.is_active,
                created_at: relatedResource.created_at,
                updated_at: relatedResource.updated_at,
                relationship_attributes: {
                    ...rel.attributes,
                    created_at: rel.created_at,
                    updated_at: rel.updated_at,
                    direction
                }
            });
        });

        return formatted;
    };

    // Merge incoming & outgoing into one grouped object
    const incoming = formatRelationships(resource.incoming_relationships, "incoming");
    const outgoing = formatRelationships(resource.outgoing_relationships, "outgoing");

    const relationships = {};
    [incoming, outgoing].forEach(group => {
        if (group) {
            for (const key in group) {
                if (!relationships[key]) relationships[key] = [];
                relationships[key].push(...group[key]);
            }
        }
    });
    
    

    return {
        id: resource.id,
        resource_type: "resource",
        resource_name: resource.resource_name,
        tenant_id: resource.tenant_id,
        position: resource.position,
        attributes: { ...resource.attributes },
        relationships: connection ? relationships : {},
        meta: {
            is_deleted: resource.is_deleted,
            is_active: resource.is_active,
            created_at: resource.created_at,
            updated_at: resource.updated_at
        }
    };
};

/**
 * Validation middleware for query parameters
 */
const validateQueryParams = (req, res, next) => {
  const { page, perPage } = req.query;
  
  if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
    return res.status(400).json({ 
      error: { 
        status: 400, 
        message: "page must be a positive integer" 
      } 
    });
  }
  
  if (perPage && (isNaN(parseInt(perPage)) || parseInt(perPage) < 1 || parseInt(perPage) > 100)) {
    return res.status(400).json({ 
      error: { 
        status: 400, 
        message: "perPage must be between 1 and 100" 
      } 
    });
  }
  
  next();
};

/**
 * Validation middleware for filter parameters
 */
const validateFilterParams = (req, res, next) => {
  const { filters, joinOperator } = req.body;
  
  if (filters && !Array.isArray(filters)) {
    return res.status(400).json({ 
      error: { 
        status: 400, 
        message: "filters must be an array" 
      } 
    });
  }
  
  if (joinOperator && !['and', 'or'].includes(joinOperator)) {
    return res.status(400).json({ 
      error: { 
        status: 400, 
        message: "joinOperator must be 'and' or 'or'" 
      } 
    });
  }
  
  next();
};



// === Create Resource ===
router.post("/", async (req, res) => {
  try {
    const { resource_name, attributes, relationships } = req.body;

    if (!resource_name) {
      return res.status(400).json({ error: { status: 400, message: "resource_name is required" } });
    }
    if (!attributes || typeof attributes !== "object") {
      return res.status(400).json({ error: { status: 400, message: "attributes object is required" } });
    }
    
    
      let parentResource = await resourceService.getResourcesByType(resource_name, req.tenantId);
   
      // const parentResource = await db
      //     .select()
      //     .from(resourceTags)
      //     .where(and(eq(resourceTags.resource_name, resource_name), eq(resourceTags.resource_type, "config"), eq(resourceTags.tenant_id, req.tenantId)))
          // .returning();
    
  console.log(parentResource, 'PARENT', attributes)    

    const resource = await resourceService.createResource(resource_name, attributes, {
      relationships,
      resource_parent: parentResource[0]?.id,
      tenant_id: req.tenantId
    });


  console.log(resource, 'RESOURCE')

    return res.status(201).json(formatResourceResponse(resource));
  } catch (error) {
    console.error("Resource creation error:", error);
    return res.status(500).json({
      error: {
        status: 500,
        message: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
    });
  }
});

// === Get Resource by ID or Name ===
router.get("/:idOrName", async (req, res) => {
  try {
    const resource = await resourceService.getById(
      isNaN(req.params.idOrName) ? req.params.idOrName : Number(req.params.idOrName)
    );

    if (!resource) {
      return res.status(404).json({ error: { status: 404, message: "Resource not found" } });
    }
    
    let newResource;
    
    // Check if formattedResources is an array
    if (Array.isArray(resource)) {
        console.log('It is an array!');
        newResource = resource.map(formatResourceResponse);
    } else {
        newResource = formatResourceResponse(resource);
        console.log('Not an array');
    }


    return res.status(200).json(newResource);
  } catch (error) {
    console.error("Get error:", error);
    return res.status(500).json({ error: { status: 500, message: "Internal server error" } });
  }
});

// === Get Resources by Type ===
router.get("/type/:type", async (req, res) => {
  try {
    const resources = await resourceService.getAll(req.params.type, req.tenantId);
    const formatted = resources.map(formatResourceResponse);

    return res.status(200).json({
      data: formatted,
      meta: { count: formatted.length },
    });
  } catch (error) {
    console.error("Get by type error:", error);
    return res.status(500).json({ error: { status: 500, message: "Internal server error" } });
  }
});

// === Update Resource ===
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await resourceService.update(Number(id), req.body);

    if (!updated) {
      return res.status(404).json({ error: { status: 404, message: "Resource not found" } });
    }

    return res.status(200).json(formatResourceResponse(updated));
  } catch (error) {
    console.error("Update error:", error);
    return res.status(500).json({ error: { status: 500, message: "Internal server error" } });
  }
});

// === Soft Delete Resource ===
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await resourceService.deleteResourceById(Number(id));

    return res.status(200).json({
      data: {
        message: "Resource deleted successfully",
        ...deleted,
      },
    });
  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({ error: { status: 500, message: "Internal server error" } });
  }
});



// ✅ Get resources by type
router.get("/type/:typeId/:relationship", async (req, res, next) => {
  try {
    const resources = await resourceService.getResourcesByType(req.params.typeId, req.tenantId);
    const formattedResources = resources.map((r) =>
      formatResourceResponse(r, req.params.relationship)
    );

    res.status(200).json({
      data: formattedResources,
      meta: { count: formattedResources.length },
    });
  } catch (error) {
    next(error);
  }
});

// ✅ Get resource by id or resource_name
router.get("/:id/:relationship", async (req, res, next) => {
  try {
  
    const resource = await resourceService.getResourceById(req.params.id, req.tenantId);
    if (!resource) {
      return res.status(404).json({
        error: { status: 404, message: "Resource not found" },
      });
    }
    res.status(200).json(formatResourceResponse(resource, req.params.relationship));
  } catch (error) {
    next(error);
  }
});




export default router;
