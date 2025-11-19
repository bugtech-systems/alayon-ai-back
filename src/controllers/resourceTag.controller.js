// src/routes/resourceRoutes.js
import express from "express";
import * as resourceService from "../services/resourceTag.service.js";
import resourceQueryService from "../services/resourceQuery.service.js";
import { validateFilters } from "../utils/filterBuilder.js";
import { validateAndProcessQuery, parseResourceQuery } from "../utils/queryParser.js";

const router = express.Router();

/**
 * Standardizes the resource response format
 */
const formatResourceResponse = (resource) => {
  if (!resource) return null;

  return {
    id: resource.id,
    resource_type: resource.resource_type,
    resource_name: resource.resource_name,
    tenant_id: resource.tenant_id,
    resource_parent_id: resource.resource_parent_id,
    attributes: resource.attributes || {},
    relationships: resource.relationships || [],
    meta: {
      is_deleted: resource.is_deleted,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
    },
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
  
  if (filters && filters.length > 0) {
    const validation = validateFilters(filters);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: { 
          status: 400, 
          message: validation.error 
        } 
      });
    }
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
    const { resource_name, attributes, tenant_id, resource_parent_id, relationships } = req.body;

    if (!resource_name) {
      return res.status(400).json({ 
        error: { 
          status: 400, 
          message: "resource_name is required" 
        } 
      });
    }
    
    if (!attributes || typeof attributes !== "object") {
      return res.status(400).json({ 
        error: { 
          status: 400, 
          message: "attributes object is required" 
        } 
      });
    }

    const resource = await resourceService.createResource({
      resource_name,
      attributes,
      tenant_id,
      resource_parent_id,
      relationships
    });

    // Clear cache for this resource type to ensure fresh data
    resourceQueryService.clearCache(`resources:${resource_name}`);

    return res.status(201).json({
      data: formatResourceResponse(resource),
      message: "Resource created successfully"
    });
  } catch (error) {
    console.error("Resource creation error:", error);
    
    // Handle specific validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: {
          status: 400,
          message: error.message,
          details: error.details
        }
      });
    }
    
    if (error.name === "DuplicateError") {
      return res.status(409).json({
        error: {
          status: 409,
          message: "Resource with unique field value already exists",
          details: error.details
        }
      });
    }

    return res.status(500).json({
      error: {
        status: 500,
        message: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
    });
  }
});


// === Get All Resources (with query parameters) ===
router.get("/", async (req, res) => {
  try {
    const processedQuery = validateAndProcessQuery(req.query);
    const result = await resourceQueryService.getResources(processedQuery);


    const formattedData = result.data.map(formatResourceResponse);

    return res.status(200).json({
      data: formattedData,
      meta: {
        pagination: {
          page: result.pagination.page,
          per_page: result.pagination.perPage,
          total: result.pagination.total,
          page_count: result.pagination.pageCount,
          has_next: result.pagination.page < result.pagination.pageCount,
          has_prev: result.pagination.page > 1
        },
        filters: processedQuery.filters.length > 0 ? {
          applied: processedQuery.filters.length,
          join_operator: processedQuery.joinOperator
        } : undefined
      }
    });
  } catch (error) {
    console.error("Get resources error:", error);
    
    if (error.message.includes('validation failed')) {
      return res.status(400).json({
        error: {
          status: 400,
          message: error.message
        }
      });
    }

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
    const { idOrName } = req.params;
    const { include_relationships } = req.query;
    
    let resource;
    
    if (isNaN(idOrName)) {
      // Search by resource name - use query service for consistency
      const result = await resourceQueryService.getResources({
        page: 1,
        perPage: 1,
        resourceName: idOrName,
        filters: [
          {
            id: "resource_name",
            operator: "eq",
            value: idOrName,
            variant: "text"
          }
        ]
      });
      resource = result.data[0] || null;
    } else {
      // Search by ID
      resource = await resourceService.getById(Number(idOrName));
    }

    if (!resource) {
      return res.status(404).json({ 
        error: { 
          status: 404, 
          message: "Resource not found" 
        } 
      });
    }

    // Include relationships if requested
    if (include_relationships) {
      const relationshipTypes = Array.isArray(include_relationships) 
        ? include_relationships 
        : include_relationships.split(',');
      
      const relationships = await resourceQueryService.getResourcesRelationships(
        [resource.id], 
        relationshipTypes
      );
      resource.relationships = relationships[resource.id] || [];
    }

    return res.status(200).json({
      data: formatResourceResponse(resource)
    });
  } catch (error) {
    console.error("Get resource error:", error);
    return res.status(500).json({ 
      error: { 
        status: 500, 
        message: "Internal server error" 
      } 
    });
  }
});

// === Advanced Resource Query ===
router.post("/search", validateQueryParams, validateFilterParams, async (req, res) => {
  try {
    const {
      page = 1,
      perPage = 20,
      filterFlag,
      filters = [],
      joinOperator = "and",
      sort = [],
      include_relationships = []
    } = req.body;

    const input = {
      page: parseInt(page),
      perPage: parseInt(perPage),
      filterFlag,
      filters,
      joinOperator,
      sort
    };

    let result;
    
    if (include_relationships.length > 0) {
      const relationshipTypes = Array.isArray(include_relationships) 
        ? include_relationships 
        : [include_relationships];
      result = await resourceQueryService.getResourcesWithRelationships(input, relationshipTypes);
    } else {
      result = await resourceQueryService.getResources(input);
    }

    const formattedData = result.data.map(formatResourceResponse);

    return res.status(200).json({
      data: formattedData,
      meta: {
        pagination: {
          page: result.pagination.page,
          per_page: result.pagination.perPage,
          total: result.pagination.total,
          page_count: result.pagination.pageCount,
          has_next: result.pagination.page < result.pagination.pageCount,
          has_prev: result.pagination.page > 1
        },
        filters: filters.length > 0 ? {
          applied: filters.length,
          join_operator: joinOperator
        } : undefined
      }
    });
  } catch (error) {
    console.error("Query resources error:", error);
    return res.status(500).json({
      error: {
        status: 500,
        message: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
    });
  }
});

// === Get Resources by Type ===
router.get("/type/:type", validateQueryParams, async (req, res) => {
  try {
    const { type } = req.params;
    const { 
      page = 1, 
      perPage = 20, 
      tenant_id,
      include_relationships 
    } = req.query;

    const result = await resourceQueryService.getResourcesByType(type, {
      page: parseInt(page),
      perPage: parseInt(perPage),
      tenantId: tenant_id,
      includeRelationships: include_relationships ? 
        (Array.isArray(include_relationships) ? include_relationships : [include_relationships]) 
        : []
    });

    const formattedData = result.data.map(formatResourceResponse);

    return res.status(200).json({
      data: formattedData,
      meta: {
        resource_type: type,
        pagination: {
          page: result.pagination.page,
          per_page: result.pagination.perPage,
          total: result.pagination.total,
          page_count: result.pagination.pageCount,
          has_next: result.pagination.page < result.pagination.pageCount,
          has_prev: result.pagination.page > 1
        }
      }
    });
  } catch (error) {
    console.error("Get by type error:", error);
    return res.status(500).json({ 
      error: { 
        status: 500, 
        message: "Internal server error" 
      } 
    });
  }
});

// === Search Resources ===
router.get("/search/:term", validateQueryParams, async (req, res) => {
  try {
    const { term } = req.params;
    const { 
      page = 1, 
      perPage = 20, 
      tenant_id,
      resource_types,
      search_fields 
    } = req.query;

    const resourceTypes = resource_types ? 
      (Array.isArray(resource_types) ? resource_types : resource_types.split(',')) 
      : [];

    const searchFields = search_fields ? 
      (Array.isArray(search_fields) ? search_fields : search_fields.split(',')) 
      : ['resource_name', 'attributes'];

    const result = await resourceQueryService.searchResources(term, {
      page: parseInt(page),
      perPage: parseInt(perPage),
      tenantId: tenant_id,
      resourceTypes,
      searchFields
    });

    const formattedData = result.data.map(formatResourceResponse);

    return res.status(200).json({
      data: formattedData,
      meta: {
        search_term: term,
        pagination: {
          page: result.pagination.page,
          per_page: result.pagination.perPage,
          total: result.pagination.total,
          page_count: result.pagination.pageCount,
          has_next: result.pagination.page < result.pagination.pageCount,
          has_prev: result.pagination.page > 1
        },
        search: {
          resource_types: resourceTypes,
          search_fields: searchFields
        }
      }
    });
  } catch (error) {
    console.error("Search resources error:", error);
    return res.status(500).json({ 
      error: { 
        status: 500, 
        message: "Internal server error" 
      } 
    });
  }
});

// === Update Resource ===
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { attributes, relationships } = req.body;

    if (!attributes || typeof attributes !== "object") {
      return res.status(400).json({ 
        error: { 
          status: 400, 
          message: "attributes object is required" 
        } 
      });
    }

    const updated = await resourceService.updateResource(Number(id), {
      attributes,
      relationships
    });

    if (!updated) {
      return res.status(404).json({ 
        error: { 
          status: 404, 
          message: "Resource not found" 
        } 
      });
    }

    // Clear cache for this resource
    resourceQueryService.clearCache(`resources:${updated.resource_name}`);

    return res.status(200).json({
      data: formatResourceResponse(updated),
      message: "Resource updated successfully"
    });
  } catch (error) {
    console.error("Update error:", error);
    
    // Handle specific validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: {
          status: 400,
          message: error.message,
          details: error.details
        }
      });
    }
    
    if (error.name === "DuplicateError") {
      return res.status(409).json({
        error: {
          status: 409,
          message: "Resource with unique field value already exists",
          details: error.details
        }
      });
    }

    return res.status(500).json({ 
      error: { 
        status: 500, 
        message: "Internal server error" 
      } 
    });
  }
});

// === Soft Delete Resource ===
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { hard_delete = false } = req.query;

    // Get resource first to know its type for cache clearing
    const resource = await resourceService.getById(Number(id));
    if (!resource) {
      return res.status(404).json({ 
        error: { 
          status: 404, 
          message: "Resource not found" 
        } 
      });
    }

    const deleted = await resourceService.deleteResourceById(
      Number(id), 
      hard_delete === 'true'
    );

    // Clear cache for this resource type
    resourceQueryService.clearCache(`resources:${resource.resource_name}`);

    return res.status(200).json({
      data: {
        message: `Resource ${hard_delete === 'true' ? 'permanently' : 'soft'} deleted successfully`,
        resource: formatResourceResponse(deleted)
      }
    });
  } catch (error) {
    console.error("Delete error:", error);
    
    if (error.message?.includes('not found')) {
      return res.status(404).json({ 
        error: { 
          status: 404, 
          message: "Resource not found" 
        } 
      });
    }

    return res.status(500).json({ 
      error: { 
        status: 500, 
        message: "Internal server error" 
      } 
    });
  }
});

// === Get Filterable Fields ===
router.get("/meta/fields/:resourceType", async (req, res) => {
  try {
    const { resourceType } = req.params;
    const { tenant_id } = req.query;

    const filterableFields = await resourceQueryService.getFilterableFields(resourceType, tenant_id);

    return res.status(200).json({
      data: filterableFields,
      meta: {
        resource_type: resourceType,
        count: filterableFields.length
      }
    });
  } catch (error) {
    console.error("Get filterable fields error:", error);
    return res.status(500).json({ 
      error: { 
        status: 500, 
        message: "Internal server error" 
      } 
    });
  }
});

// === Cache Management ===
router.delete("/cache/clear", async (req, res) => {
  try {
    const { pattern } = req.query;
    
    resourceQueryService.clearCache(pattern);
    
    return res.status(200).json({
      data: {
        message: pattern ? `Cache cleared for pattern: ${pattern}` : "All cache cleared",
        cache_stats: resourceQueryService.getCacheStats()
      }
    });
  } catch (error) {
    console.error("Clear cache error:", error);
    return res.status(500).json({ 
      error: { 
        status: 500, 
        message: "Internal server error" 
      } 
    });
  }
});

// === Get Cache Stats ===
router.get("/cache/stats", async (req, res) => {
  try {
    const stats = resourceQueryService.getCacheStats();
    
    return res.status(200).json({
      data: stats
    });
  } catch (error) {
    console.error("Get cache stats error:", error);
    return res.status(500).json({ 
      error: { 
        status: 500, 
        message: "Internal server error" 
      } 
    });
  }
});

export default router;