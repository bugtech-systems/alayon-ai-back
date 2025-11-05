// src/utils/queryParser.js
import { ConsoleLogWriter } from "drizzle-orm";
import { validateFilters, normalizeFilters, sanitizeFilters } from "./filterBuilder.js";

/**
 * Parse query parameters for resource queries
 */
export function parseResourceQuery(query) {
  const {
    page = 1,
    per_page = 20,
    search,
    sort,
    include_relationships,
    filter_flag,
    join_operator = 'and',
    ...filterParams
  } = query;

  // Parse pagination
  const parsedPage = Math.max(1, parseInt(page));
  const parsedPerPage = Math.min(100, Math.max(1, parseInt(per_page)));

  // Parse filters from query parameters
  const filters = parseFiltersFromQuery(filterParams);

  // Parse sort
  const parsedSort = parseSortParameter(sort);

  // Parse relationships
  const parsedRelationships = parseRelationshipsParameter(include_relationships);

  return {
    page: parsedPage,
    perPage: parsedPerPage,
    searchTerm: search,
    filterFlag: filter_flag,
    joinOperator: join_operator,
    filters,
    sort: parsedSort,
    includeRelationships: parsedRelationships
  };
}

/**
 * Parse filters from query parameters
 * Supports multiple filter formats:
 * 1. Simple: ?status=active&age=25
 * 2. Advanced: ?filters=[{"id":"status","operator":"eq","value":"active"}]
 * 3. Mixed: ?status=active&filters=[...]
 */
function parseFiltersFromQuery(queryParams) {
  const filters = [];

  // Check if advanced filters are provided as JSON
  if (queryParams.filters) {
    try {
      const advancedFilters = typeof queryParams.filters === 'string' 
        ? JSON.parse(queryParams.filters) 
        : queryParams.filters;
      
      if (Array.isArray(advancedFilters)) {
        filters.push(...advancedFilters);
      }
    } catch (error) {
      console.error('Error parsing filters JSON:', error);
      throw new Error(`Invalid filters JSON: ${error.message}`);
    }
  }

  // Parse simple filters from remaining query parameters
  for (const [key, value] of Object.entries(queryParams)) {
    if (key === 'filters') continue; // Already processed
    
    // Skip pagination and other reserved parameters
    const reservedParams = ['page', 'per_page', 'perPage', 'search', 'sort', 'include_relationships', 'filter_flag', 'join_operator'];
    if (reservedParams.includes(key)) {
      continue;
    }

    // Handle special operators with colon syntax: field:operator=value
    if (key.includes(':')) {
      const [field, operator] = key.split(':');
      filters.push(createFilterFromSimpleParam(field, operator, value));
    } else {
      // Default to equals operator
      filters.push(createFilterFromSimpleParam(key, 'eq', value));
    }
  }

  return filters;
}

/**
 * Create a filter object from simple query parameters
 */
function createFilterFromSimpleParam(field, operator, value) {
  const filter = {
    id: field,
    operator: operator
  };

  // Auto-detect variant for JSON fields
  if (field.startsWith('attributes.')) {
    // For JSON fields, always treat as text for simple queries
    filter.variant = 'text';
    filter.value = String(value);
  } else {
    // Parse value based on type for regular fields
    if (value === 'true' || value === 'false') {
      filter.value = value === 'true';
      filter.variant = 'boolean';
    } else if (!isNaN(value) && value !== '') {
      filter.value = Number(value);
      filter.variant = 'number';
    } else if (value.includes(',')) {
      // Handle array values
      filter.value = value.split(',').map(v => v.trim());
      filter.variant = 'text';
      filter.operator = 'inArray';
    } else {
      filter.value = value;
      filter.variant = 'text';
    }
  }

  return filter;
}


/**
 * Parse sort parameter
 * Formats:
 * - field:asc,field2:desc
 * - [{"id":"field","desc":true}]
 */
function parseSortParameter(sort) {
  if (!sort) return [];

  try {
    // JSON format
    if (sort.startsWith('[')) {
      const parsed = JSON.parse(sort);
      return Array.isArray(parsed) ? parsed : [];
    }

    // String format: field:asc,field2:desc
    return sort.split(',').map(sortItem => {
      const [field, direction = 'asc'] = sortItem.split(':');
      return {
        id: field.trim(),
        desc: direction.trim().toLowerCase() === 'desc'
      };
    });
  } catch (error) {
    console.warn('Invalid sort parameter:', error);
    return [];
  }
}

/**
 * Parse relationships parameter
 */
function parseRelationshipsParameter(relationships) {
  if (!relationships) return [];
  
  if (Array.isArray(relationships)) {
    return relationships;
  }
  
  if (typeof relationships === 'string') {
    return relationships.split(',').map(r => r.trim());
  }
  
  return [];
}

/**
 * Validate and process query parameters
 */
export function validateAndProcessQuery(query) {
  const parsedQuery = parseResourceQuery(query);
  // Sanitize filters
  const sanitizedFilters = sanitizeFilters(parsedQuery.filters);
  
  
  // Validate filters
  const validation = validateFilters(sanitizedFilters);
  if (!validation.valid) {
    throw new Error(`Query validation failed: ${validation.error}`);
  }
  
  // Normalize filters
  const normalizedFilters = normalizeFilters(sanitizedFilters);
  
  return {
    ...parsedQuery,
    filters: normalizedFilters
  };
}

export default {
  parseResourceQuery,
  validateAndProcessQuery
};