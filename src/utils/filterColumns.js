import { addDays, endOfDay, startOfDay } from "date-fns";
import {
  and,
  or,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  ilike,
  notIlike,
  inArray,
  notInArray,
  sql,
  not,
} from "drizzle-orm";
import { isEmpty as isEmptyHelper } from "./helpers.js"; // implement a tiny isEmpty helper if needed

/**
 * filterColumns
 * - table: Drizzle table object (e.g. resourceTags)
 * - filters: array of { id, operator, value, variant }
 * - joinOperator: "and" | "or"
 * - fields: optional metadata array describing primary columns (e.g. [{field_name, data_type, is_primary, has_filter}])
 */
export function filterColumns({ table, filters = [], joinOperator = "and", fields = [] }) {
  const joinFn = joinOperator === "and" ? and : or;
  if (!filters || !Array.isArray(filters) || filters.length === 0) return undefined;

  const conditions = filters.map((filter) => {
    // determine if filter.id is a primary column (exists in fields metadata as is_primary)
    const isPrimaryMeta = Array.isArray(fields)
      ? fields.find((f) => (f.is_primary || f.has_filter || f.is_searchable) && f.field_name === filter.id)
      : undefined;

    // column: if primary metadata exists and table has that column, use column; otherwise treat as JSON attribute
    const column = isPrimaryMeta && table[filter.id] ? table[filter.id] : undefined;
    const jsonExpr = !column ? sql`${table.attributes} ->> ${filter.id}` : undefined;

    const operator = (isPrimaryMeta && isPrimaryMeta.data_type === "enum") ? "eq" : filter.operator;

    // helper to parse date numbers/strings to Date
    const makeDateStart = (v) => {
      const d = new Date(Number(v));
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const makeDateEnd = (v) => {
      const d = new Date(Number(v));
      d.setHours(23, 59, 59, 999);
      return d;
    };

    const colOrJson = column || jsonExpr;

    switch (operator) {
      case "iLike":
      case "ilike":
        return (filter.variant === "text" || typeof filter.value === "string")
          ? ilike(colOrJson, `%${filter.value}%`)
          : undefined;

      case "notILike":
      case "notIlike":
        return (filter.variant === "text" || typeof filter.value === "string")
          ? notIlike(colOrJson, `%${filter.value}%`)
          : undefined;

      case "eq":
        if (filter.variant === "date" || filter.variant === "dateRange") {
          const date = makeDateStart(filter.value);
          const end = makeDateEnd(filter.value);
          return and(gte(colOrJson, date), lte(colOrJson, end));
        }
        return eq(colOrJson, filter.value);

      case "ne":
        if (filter.variant === "date" || filter.variant === "dateRange") {
          const date = makeDateStart(filter.value);
          const end = makeDateEnd(filter.value);
          return or(lt(colOrJson, date), gt(colOrJson, end));
        }
        return ne(colOrJson, filter.value);

      case "inArray":
        if (Array.isArray(filter.value)) return inArray(colOrJson, filter.value);
        return undefined;

      case "notInArray":
        if (Array.isArray(filter.value)) return notInArray(colOrJson, filter.value);
        return undefined;

      case "lt":
        if (filter.variant === "date") {
          return lt(colOrJson, makeDateEnd(filter.value));
        }
        return lt(colOrJson, filter.value);

      case "lte":
        if (filter.variant === "date") {
          return lte(colOrJson, makeDateEnd(filter.value));
        }
        return lte(colOrJson, filter.value);

      case "gt":
        if (filter.variant === "date") {
          return gt(colOrJson, makeDateStart(filter.value));
        }
        return gt(colOrJson, filter.value);

      case "gte":
        if (filter.variant === "date") {
          return gte(colOrJson, makeDateStart(filter.value));
        }
        return gte(colOrJson, filter.value);

      case "isBetween":
        if (Array.isArray(filter.value) && filter.value.length === 2) {
          const [a, b] = filter.value;
          const conds = [];
          if (filter.variant === "date") {
            if (a) conds.push(gte(colOrJson, makeDateStart(a)));
            if (b) conds.push(lte(colOrJson, makeDateEnd(b)));
          } else {
            if (a !== null && a !== undefined) conds.push(gte(colOrJson, Number(a)));
            if (b !== null && b !== undefined) conds.push(lte(colOrJson, Number(b)));
          }
          return conds.length ? and(...conds) : undefined;
        }
        return undefined;

      case "isRelativeToToday":
        if (filter.variant === "date" && typeof filter.value === "string") {
          const today = new Date();
          const [amountStr, unit] = filter.value.split(" ");
          const amount = Number.parseInt(amountStr);
          if (Number.isNaN(amount) || !unit) return undefined;
          let startDate, endDate;
          switch (unit) {
            case "days":
              startDate = startOfDay(addDays(today, amount));
              endDate = endOfDay(startDate);
              break;
            case "weeks":
              startDate = startOfDay(addDays(today, amount * 7));
              endDate = endOfDay(addDays(startDate, 6));
              break;
            case "months":
              startDate = startOfDay(addDays(today, amount * 30));
              endDate = endOfDay(addDays(startDate, 29));
              break;
            default:
              return undefined;
          }
          return and(gte(colOrJson, startDate), lte(colOrJson, endDate));
        }
        return undefined;

      case "isEmpty":
        return isEmptyHelper(colOrJson);

      case "isNotEmpty":
        return not(isEmptyHelper(colOrJson));

      case "json_contains":
        // for JSONB containment: column @> value
        return sql`${colOrJson}::jsonb @> ${JSON.stringify(filter.value)}::jsonb`;

      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  });

  const valid = conditions.filter(Boolean);
  return valid.length ? joinFn(...valid) : undefined;
}
