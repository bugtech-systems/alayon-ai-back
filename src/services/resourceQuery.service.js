// src/services/ResourceQueryService.js
import { db } from "../config/db.js";
import { resourceTags, resourceRelationships } from "../db/schema.js";
import { eq, and, ilike, asc, desc, count } from "drizzle-orm";
import { filterColumns } from "../utils/filterBuilder.js";

class ResourceQueryService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 60000; // 60 seconds cache TTL
  }

  /**
   * Simple in-memory cache implementation
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCached(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Main resources query function
   */
  async getResources(input) {
    const cacheKey = `resources:${JSON.stringify(input)}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const offset = (input.page - 1) * input.perPage;
      const advancedTable = 
        input.filterFlag === "advancedFilters" || 
        input.filterFlag === "commandFilters";

      // Define fields for filterColumns - primary columns from resourceTags
      const primaryFields = [
        {
          field_name: 'id',
          data_type: 'string',
          is_primary: true,
          has_filter: true,
          is_searchable: true
        },
        {
          field_name: 'resource_name',
          data_type: 'string', 
          is_primary: true,
          has_filter: true,
          is_searchable: true
        },
        {
          field_name: 'resource_type',
          data_type: 'string',
          is_primary: true,
          has_filter: true,
          is_searchable: true
        },
        {
          field_name: 'tenant_id',
          data_type: 'string',
          is_primary: true,
          has_filter: true,
          is_searchable: true
        },
        {
          field_name: 'resource_parent_id',
          data_type: 'string',
          is_primary: true,
          has_filter: true,
          is_searchable: true
        },
        {
          field_name: 'created_at',
          data_type: 'date',
          is_primary: true,
          has_filter: true,
          is_searchable: true
        },
        {
          field_name: 'updated_at',
          data_type: 'date',
          is_primary: true,
          has_filter: true,
          is_searchable: true
        },
        {
          field_name: 'is_deleted',
          data_type: 'boolean',
          is_primary: true,
          has_filter: true,
          is_searchable: true
        }
      ];

      // Build advanced filters if present
      const advancedWhere = input.filters?.length > 0 
        ? filterColumns({
            table: resourceTags,
            filters: input.filters,
            joinOperator: input.joinOperator || 'and',
            fields: primaryFields
          })
        : undefined;

      // Build base conditions
      const baseConditions = [
        // eq(resourceTags.resource_type, "resource"),
        // eq(resourceTags.is_deleted, false)
      ];

      // Add resource name filter if provided (only for non-advanced filters)
      if (input.resourceName && !advancedTable) {
        baseConditions.push(ilike(resourceTags.resource_name, `%${input.resourceName}%`));
      }

      // Add tenant filter if provided
      if (input.tenantId) {
        baseConditions.push(eq(resourceTags.tenant_id, input.tenantId));
      }

      // Combine all conditions
      const whereConditions = [
        and(...baseConditions),
        advancedWhere
      ].filter(Boolean);



      const where = whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0];

      // Handle sorting with safe defaults
      const orderBy = this.buildOrderBy(input.sort);

      const { data, total } = await db.transaction(async (tx) => {
        // Main query
        const dataQuery = tx
          .select()
          .from(resourceTags)
          .limit(input.perPage)
          .offset(offset)
          .orderBy(...orderBy);

        if (where) {
          dataQuery.where(where);
        }

        const data = await dataQuery;

        // Count query
        const countQuery = tx
          .select({ count: count() })
          .from(resourceTags);

        if (where) {
          countQuery.where(where);
        }

        const total = await countQuery.execute().then((res) => res[0]?.count ?? 0);

        return { data, total };
      });

      const pageCount = Math.ceil(total / input.perPage);
      
      const result = { 
        data, 
        pageCount,
        total,
        pagination: {
          page: input.page,
          perPage: input.perPage,
          total,
          pageCount
        }
      };

      // Cache the result
      this.setCached(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error("Error fetching resources:", error);
      return { 
        data: [], 
        pageCount: 0, 
        total: 0,
        pagination: {
          page: input.page,
          perPage: input.perPage,
          total: 0,
          pageCount: 0
        }
      };
    }
  }

  /**
   * Helper function to build orderBy conditions
   */
  buildOrderBy(sortConfig = []) {
    if (!sortConfig || sortConfig.length === 0) {
      return [desc(resourceTags.created_at)]; // Default sort by creation date
    }

    return sortConfig.map((item) => {
      // Handle regular column sorting
      const column = resourceTags[item.id];
      if (!column) {
        console.warn(`Invalid sort column: ${item.id}`);
        return desc(resourceTags.created_at);
      }

      return item.desc ? desc(column) : asc(column);
    });
  }

  /**
   * Extended function to get resources with relationships
   */
  async getResourcesWithRelationships(input, includeRelationships = []) {
    const result = await this.getResources(input);
    
    if (includeRelationships.length > 0 && result.data.length > 0) {
      const resourceIds = result.data.map(r => r.id);
      const relationships = await this.getResourcesRelationships(resourceIds, includeRelationships);
      
      // Attach relationships to resources
      result.data = result.data.map(resource => ({
        ...resource,
        relationships: relationships[resource.id] || []
      }));
    }

    return result;
  }

  /**
   * Helper function to fetch relationships
   */
  async getResourcesRelationships(resourceIds, relationshipTypes = []) {
    if (resourceIds.length === 0) return {};

    const relationships = await db
      .select({
        id: resourceRelationships.id,
        source_resource_id: resourceRelationships.source_resource_id,
        target_resource_id: resourceRelationships.target_resource_id,
        relationship_name: resourceRelationships.relationship_name,
        attributes: resourceRelationships.attributes,
      })
      .from(resourceRelationships)
      .where(
        and(
          eq(resourceRelationships.source_resource_id, resourceIds),
          eq(resourceRelationships.is_deleted, false),
          relationshipTypes.length > 0 
            ? eq(resourceRelationships.relationship_name, relationshipTypes)
            : undefined
        )
      );

    // Group by source resource ID
    return relationships.reduce((acc, rel) => {
      const sourceId = rel.source_resource_id;
      if (!acc[sourceId]) {
        acc[sourceId] = [];
      }
      acc[sourceId].push(rel);
      return acc;
    }, {});
  }

  /**
   * Get resources by specific type with enhanced filtering
   */
  async getResourcesByType(resourceType, options = {}) {
    const {
      page = 1,
      perPage = 20,
      tenantId,
      filters = [],
      sort = [],
      includeRelationships = []
    } = options;

    const input = {
      page: parseInt(page),
      perPage: parseInt(perPage),
      resourceName: resourceType,
      tenantId,
      filters: [
        {
          id: "resource_name",
          operator: "eq",
          value: resourceType,
          variant: "text"
        },
        ...filters
      ],
      joinOperator: "and",
      sort
    };

    if (includeRelationships.length > 0) {
      return this.getResourcesWithRelationships(input, includeRelationships);
    }

    return this.getResources(input);
  }

  /**
   * Search resources with simple text search across multiple fields
   */
  async searchResources(searchTerm, options = {}) {
    const {
      page = 1,
      perPage = 20,
      tenantId,
      resourceTypes = [],
      searchFields = ['resource_name', 'attributes']
    } = options;

    const searchFilters = [];

    // Add search term filters
    if (searchTerm && searchTerm.trim()) {
      const searchConditions = [];
      
      if (searchFields.includes('resource_name')) {
        searchConditions.push({
          id: "resource_name",
          operator: "iLike",
          value: `%${searchTerm}%`,
          variant: "text"
        });
      }

      if (searchFields.includes('attributes')) {
        // This would need to be adapted based on your attribute structure
        searchConditions.push({
          id: "attributes",
          operator: "iLike", 
          value: `%${searchTerm}%`,
          variant: "text"
        });
      }

      if (searchConditions.length > 0) {
        searchFilters.push(...searchConditions);
      }
    }

    // Add resource type filters if specified
    if (resourceTypes.length > 0) {
      searchFilters.push({
        id: "resource_name",
        operator: "inArray",
        value: resourceTypes,
        variant: "text"
      });
    }

    const input = {
      page: parseInt(page),
      perPage: parseInt(perPage),
      tenantId,
      filters: searchFilters,
      joinOperator: "or", // Use OR for search across multiple fields
      sort: options.sort || [{ id: "created_at", desc: true }]
    };

    return this.getResources(input);
  }

  /**
   * Utility function to get available filter fields for a resource type
   */
  async getFilterableFields(resourceName, tenantId) {
    try {
      // This would typically fetch from your resource configuration
      const baseFields = [
        { field_name: 'resource_name', data_type: 'string', label: 'Resource Name', is_primary: true },
        { field_name: 'created_at', data_type: 'date', label: 'Created At', is_primary: true },
        { field_name: 'updated_at', data_type: 'date', label: 'Updated At', is_primary: true },
      ];

      // Add dynamic attributes from your resource config
      const resourceConfig = await this.getResourceTypeConfig(resourceName, tenantId);
      if (resourceConfig?.fields) {
        resourceConfig.fields.forEach(field => {
          if (field.is_filterable !== false) {
            baseFields.push({
              field_name: field.field_name,
              data_type: field.data_type,
              label: field.label || field.field_name,
              is_primary: false
            });
          }
        });
      }

      return baseFields;
    } catch (error) {
      console.error("Error getting filterable fields:", error);
      return [];
    }
  }

  /**
   * Get resource type configuration (placeholder - implement based on your schema)
   */
  async getResourceTypeConfig(resourceName, tenantId) {
    // This should be implemented based on your resource configuration schema
    // For now, returning a stub implementation
    try {
      const config = await db
        .select()
        .from(resourceTags)
        .where(
          and(
            eq(resourceTags.resource_type, "config"),
            eq(resourceTags.resource_name, resourceName),
            eq(resourceTags.is_deleted, false),
            tenantId ? eq(resourceTags.tenant_id, tenantId) : undefined
          )
        )
        .limit(1);

      return config[0] || null;
    } catch (error) {
      console.error("Error fetching resource type config:", error);
      return null;
    }
  }

  /**
   * Clear cache for specific patterns or all cache
   */
  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
export default new ResourceQueryService();

// Also export class for testing purposes
export { ResourceQueryService };