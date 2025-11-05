// src/utils/filterBuilder.js
import { addDays, endOfDay, startOfDay } from "date-fns";
import {
  and,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  not,
  notIlike,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

/**
 * Check if a column value is empty
 */
function isEmpty(column) {
  return or(
    eq(column, null),
    eq(column, ""),
    eq(column, "null"),
    eq(column, "undefined")
  );
}

/**
 * Get the appropriate column reference for filtering
 * Handles both regular columns and JSONB attributes
 */
function getColumnReference(table, fieldName, fields = []) {
  // Check if this is a primary field
  const isPrimary = fields.find(field => 
    field.field_name === fieldName && field.is_primary
  );
  
  if (isPrimary) {
    return table[fieldName];
  }
  
  // Handle JSONB attributes with nested paths
  if (fieldName.startsWith('attributes.')) {
    const jsonPath = fieldName.replace('attributes.', '');
    return sql`${table.attributes}->>${jsonPath}`;
  }
  
  // Default to table column
  return table[fieldName];
}

/**
 * Main filter function for dynamic resource queries
 */
export function filterColumns({
  table,
  filters,
  joinOperator,
  fields = []
}) {
  const joinFn = joinOperator === "and" ? and : or;

  const conditions = filters.map((filter) => {
    const column = getColumnReference(table, filter.id, fields);
    
    let operator = filter.operator;
    
    // Debug logging
    // console.log('Filter processing:', {
    //   field: filter.id,
    //   operator: filter.operator,
    //   value: filter.value,
    //   variant: filter.variant,
    //   isJSON: filter.id.startsWith('attributes.')
    // });

    switch (operator) {
      case "iLike":
        return filter.variant === "text" && typeof filter.value === "string"
          ? ilike(column, `%${filter.value}%`)
          : undefined;

      case "notILike":
        return filter.variant === "text" && typeof filter.value === "string"
          ? notIlike(column, `%${filter.value}%`)
          : undefined;

      case "eq":
        if (filter.variant === "boolean" && typeof filter.value === "string") {
          return eq(column, filter.value === "true");
        }
        if (filter.variant === "date" || filter.variant === "dateRange") {
          const date = new Date(Number(filter.value));
          date.setHours(0, 0, 0, 0);
          const end = new Date(date);
          end.setHours(23, 59, 59, 999);
          return and(gte(column, date), lte(column, end));
        }
        // Special handling for JSON string values
        if (filter.id.startsWith('attributes.')) {
          return eq(column, String(filter.value));
        }
        return eq(column, filter.value);

      case "ne":
        if (filter.variant === "boolean" && typeof filter.value === "string") {
          return ne(column, filter.value === "true");
        }
        if (filter.variant === "date" || filter.variant === "dateRange") {
          const date = new Date(Number(filter.value));
          date.setHours(0, 0, 0, 0);
          const end = new Date(date);
          end.setHours(23, 59, 59, 999);
          return or(lt(column, date), gt(column, end));
        }
        // Special handling for JSON string values
        if (filter.id.startsWith('attributes.')) {
          return ne(column, String(filter.value));
        }
        return ne(column, filter.value);

      case "inArray":
        if (Array.isArray(filter.value)) {
          // For JSON fields, convert all values to strings
          const values = filter.id.startsWith('attributes.') 
            ? filter.value.map(v => String(v))
            : filter.value;
          return inArray(column, values);
        }
        return undefined;

      case "notInArray":
        if (Array.isArray(filter.value)) {
          // For JSON fields, convert all values to strings
          const values = filter.id.startsWith('attributes.') 
            ? filter.value.map(v => String(v))
            : filter.value;
          return notInArray(column, values);
        }
        return undefined;

      case "lt":
        return filter.variant === "number" || filter.variant === "range"
          ? lt(column, filter.value)
          : filter.variant === "date" && typeof filter.value === "string"
            ? lt(
              column,
              (() => {
                const date = new Date(Number(filter.value));
                date.setHours(23, 59, 59, 999);
                return date;
              })(),
            )
            : undefined;

      case "lte":
        return filter.variant === "number" || filter.variant === "range"
          ? lte(column, filter.value)
          : filter.variant === "date" && typeof filter.value === "string"
            ? lte(
              column,
              (() => {
                const date = new Date(Number(filter.value));
                date.setHours(23, 59, 59, 999);
                return date;
              })(),
            )
            : undefined;

      case "gt":
        return filter.variant === "number" || filter.variant === "range"
          ? gt(column, filter.value)
          : filter.variant === "date" && typeof filter.value === "string"
            ? gt(
              column,
              (() => {
                const date = new Date(Number(filter.value));
                date.setHours(0, 0, 0, 0);
                return date;
              })(),
            )
            : undefined;

      case "gte":
        return filter.variant === "number" || filter.variant === "range"
          ? gte(column, filter.value)
          : filter.variant === "date" && typeof filter.value === "string"
            ? gte(
              column,
              (() => {
                const date = new Date(Number(filter.value));
                date.setHours(0, 0, 0, 0);
                return date;
              })(),
            )
            : undefined;

      case "isBetween":
        if (
          (filter.variant === "date" || filter.variant === "dateRange") &&
          Array.isArray(filter.value) &&
          filter.value.length === 2
        ) {
          return and(
            filter.value[0]
              ? gte(
                column,
                (() => {
                  const date = new Date(Number(filter.value[0]));
                  date.setHours(0, 0, 0, 0);
                  return date;
                })(),
              )
              : undefined,
            filter.value[1]
              ? lte(
                column,
                (() => {
                  const date = new Date(Number(filter.value[1]));
                  date.setHours(23, 59, 59, 999);
                  return date;
                })(),
              )
              : undefined,
          );
        }

        if (
          (filter.variant === "number" || filter.variant === "range") &&
          Array.isArray(filter.value) &&
          filter.value.length === 2
        ) {
          const firstValue =
            filter.value[0] && filter.value[0].trim() !== ""
              ? Number(filter.value[0])
              : null;
          const secondValue =
            filter.value[1] && filter.value[1].trim() !== ""
              ? Number(filter.value[1])
              : null;

          if (firstValue === null && secondValue === null) {
            return undefined;
          }

          if (firstValue !== null && secondValue === null) {
            return eq(column, firstValue);
          }

          if (firstValue === null && secondValue !== null) {
            return eq(column, secondValue);
          }

          return and(
            firstValue !== null ? gte(column, firstValue) : undefined,
            secondValue !== null ? lte(column, secondValue) : undefined,
          );
        }
        return undefined;

      case "isRelativeToToday":
        if (
          (filter.variant === "date" || filter.variant === "dateRange") &&
          typeof filter.value === "string"
        ) {
          const today = new Date();
          const [amount, unit] = filter.value.split(" ") ?? [];
          let startDate;
          let endDate;

          if (!amount || !unit) return undefined;

          switch (unit) {
            case "days":
              startDate = startOfDay(addDays(today, Number.parseInt(amount)));
              endDate = endOfDay(startDate);
              break;
            case "weeks":
              startDate = startOfDay(
                addDays(today, Number.parseInt(amount) * 7),
              );
              endDate = endOfDay(addDays(startDate, 6));
              break;
            case "months":
              startDate = startOfDay(
                addDays(today, Number.parseInt(amount) * 30),
              );
              endDate = endOfDay(addDays(startDate, 29));
              break;
            default:
              return undefined;
          }

          return and(gte(column, startDate), lte(column, endDate));
        }
        return undefined;

      case "isEmpty":
        return isEmpty(column);

      case "isNotEmpty":
        return not(isEmpty(column));

      default:
        console.warn(`Unsupported operator: ${filter.operator}`);
        return undefined;
    }
  });

  const validConditions = conditions.filter(
    (condition) => condition !== undefined,
  );


  return validConditions.length > 0 ? joinFn(...validConditions) : undefined;
}

/**
 * Simplified filter builder for common use cases
 */
export function buildSimpleFilters(table, filters = {}) {
  const conditions = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    const column = table[key];
    if (!column) continue;

    if (Array.isArray(value)) {
      conditions.push(inArray(column, value));
    } else if (typeof value === 'string' && value.includes('%')) {
      conditions.push(ilike(column, value));
    } else {
      conditions.push(eq(column, value));
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Build search conditions across multiple fields
 */
export function buildSearchConditions(table, searchTerm, searchFields = []) {
  if (!searchTerm || searchFields.length === 0) {
    return undefined;
  }

  const searchConditions = searchFields.map(field => {
    const column = table[field];
    if (!column) return undefined;
    
    return ilike(column, `%${searchTerm}%`);
  }).filter(Boolean);

  return searchConditions.length > 0 ? or(...searchConditions) : undefined;
}

/**
 * Build date range conditions
 */
export function buildDateRangeConditions(table, dateField, startDate, endDate) {
  const conditions = [];
  
  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    conditions.push(gte(table[dateField], start));
  }
  
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(table[dateField], end));
  }
  
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Validate filter structure
 */
export function validateFilters(filters) {
  if (!Array.isArray(filters)) {
    return { valid: false, error: "Filters must be an array" };
  }

  for (const filter of filters) {
    if (!filter.id || !filter.operator) {
      return { 
        valid: false, 
        error: "Each filter must have 'id' and 'operator' properties" 
      };
    }

    if (filter.value === undefined || filter.value === null) {
      return { 
        valid: false, 
        error: `Filter '${filter.id}' must have a value` 
      };
    }

    // Validate operator
    const validOperators = [
      'iLike', 'notILike', 'eq', 'ne', 'inArray', 'notInArray',
      'lt', 'lte', 'gt', 'gte', 'isBetween', 'isRelativeToToday',
      'isEmpty', 'isNotEmpty'
    ];

    if (!validOperators.includes(filter.operator)) {
      return { 
        valid: false, 
        error: `Invalid operator '${filter.operator}' for filter '${filter.id}'` 
      };
    }
  }

  return { valid: true };
}

/**
 * Transform frontend filters to database filters
 */
export function transformFilters(frontendFilters, fieldMappings = {}) {
  return frontendFilters.map(filter => {
    const transformed = { ...filter };
    
    // Apply field mappings
    if (fieldMappings[filter.id]) {
      transformed.id = fieldMappings[filter.id];
    }
    
    // Transform value based on operator
    if (filter.operator === 'isBetween' && Array.isArray(filter.value)) {
      transformed.value = filter.value.map(val => {
        if (typeof val === 'string' && !isNaN(Date.parse(val))) {
          return new Date(val).getTime();
        }
        return val;
      });
    } else if (filter.variant === 'date' && typeof filter.value === 'string') {
      transformed.value = new Date(filter.value).getTime();
    }
    
    return transformed;
  });
}


export function normalizeFilters(filters) {
  if (!Array.isArray(filters)) return filters;

  return filters.map(filter => {
    const normalized = { ...filter };
    
    // Ensure variant is set based on operator if not provided
    if (!normalized.variant) {
      normalized.variant = inferVariant(normalized.operator, normalized.value);
    }
    
    // Normalize date values to timestamps
    if (normalized.variant === 'date' || normalized.variant === 'dateRange') {
      if (Array.isArray(normalized.value)) {
        normalized.value = normalized.value.map(val => 
          typeof val === 'string' ? new Date(val).getTime() : val
        );
      } else if (typeof normalized.value === 'string') {
        normalized.value = new Date(normalized.value).getTime();
      }
    }
    
    // Normalize boolean values
    if (normalized.variant === 'boolean' && typeof normalized.value === 'string') {
      normalized.value = normalized.value === 'true';
    }
    
    return normalized;
  });
}

export function sanitizeFilters(filters) {
  if (!Array.isArray(filters)) return filters;

  return filters.map(filter => {
    const sanitized = { ...filter };
    
    // Sanitize field name
    if (sanitized.id) {
      sanitized.id = sanitized.id.replace(/[^a-zA-Z0-9_.]/g, '');
    }
    
    // Sanitize operator
    if (sanitized.operator) {
      sanitized.operator = sanitized.operator.replace(/[^a-zA-Z]/g, '');
    }
    
    // Sanitize string values to prevent injection
    if (typeof sanitized.value === 'string') {
      // Basic XSS prevention - remove script tags and dangerous characters
      sanitized.value = sanitized.value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/[<>]/g, '');
    }
    
    return sanitized;
  });
}

export default {
  filterColumns,
  buildSimpleFilters,
  buildSearchConditions,
  buildDateRangeConditions,
  validateFilters,
  transformFilters,
  normalizeFilters,
  sanitizeFilters
};