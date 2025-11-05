import { db } from "../config/db.js";
import {resourceTags, actionTemplates} from "./schema.js";
import { sql, and, or, eq, ilike, gt, lt, asc, desc, count } from "drizzle-orm";

/**
 * Recursively build WHERE conditions
 */
export function buildConditions(table, where) {
  if (!where) return undefined;
  const conditions = [];

  for (const [field, value] of Object.entries(where)) {
    // Handle nested AND
    if (field.toLowerCase() === "and" && Array.isArray(value)) {
      const subConds = value.map((cond) => buildConditions(table, cond)).filter(Boolean);
      if (subConds.length) conditions.push(and(...subConds));
    }

    // Handle nested OR
    else if (field.toLowerCase() === "or" && Array.isArray(value)) {
      const subConds = value.map((cond) => buildConditions(table, cond)).filter(Boolean);
      if (subConds.length) conditions.push(or(...subConds));
    }

    // Handle JSON field (attributes)
else if (field === "attributes" && typeof value === "object") {
  for (const [jsonKey, cond] of Object.entries(value)) {
    const scalarColumn = sql`${table.attributes} ->> ${jsonKey}`;
    const arrayColumn = sql`${table.attributes} -> ${jsonKey}`;

    if (typeof cond === "object") {
      if (cond.like) conditions.push(ilike(scalarColumn, `%${cond.like}%`));
      if (cond.eq) conditions.push(sql`${scalarColumn} = ${cond.eq}`);
      if (cond.gt) conditions.push(sql`${scalarColumn}::int > ${cond.gt}`);
      if (cond.lt) conditions.push(sql`${scalarColumn}::int < ${cond.lt}`);
      // ✅ contains (string inside JSON array)
      if (cond.contains) {
        conditions.push(sql`${cond.contains} = ANY(SELECT jsonb_array_elements_text(${arrayColumn}))`);
      }
    } else {
      conditions.push(sql`${scalarColumn} = ${cond}`);
    }
  }
}

    // Handle normal column
    else if (table[field]) {
      if (typeof value === "object") {
        if (value.like) conditions.push(ilike(table[field], `%${value.like}%`));
        if (value.eq) conditions.push(eq(table[field], value.eq));
        if (value.gt) conditions.push(gt(table[field], value.gt));
        if (value.lt) conditions.push(lt(table[field], value.lt));
      } else {
        conditions.push(eq(table[field], value));
      }
    }
  }


console.log(conditions, 'CONDSS ')

  return conditions.length ? and(...conditions) : undefined;
}

/**
 * Dynamic read with filters, sorting, and pagination
 */
export async function dynamicRead(config, context) {
  const { model, query = {} } = config;
  let models = { resourceTags, actionTemplates};
  const table = models[model];
  if (!table) throw new Error(`Unknown model: ${model}`);


  const where = buildConditions(models[model], {
    ...query.where,
    /* tenant_id: context.tenant_id, // always enforce tenant scope */
  });
  
  

  // Sorting
  let orderBy = [asc(table.created_at)];
  if (query.sort && Array.isArray(query.sort)) {
    orderBy = query.sort.map((s) => {
      if (!table[s.field]) return asc(table.created_at);
      return s.desc ? desc(table[s.field]) : asc(table[s.field]);
    });
  }

  // Pagination
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 10;
  const offset = (page - 1) * perPage;

  // Query
  const data = await db
    .select()
    .from(table)
    .where(where)
    .orderBy(...orderBy)
    .limit(perPage)
    .offset(offset);

  // Total count
  const totalResult = await db
    .select({ count: count() })
    .from(table)
    .where(where);

  const total = totalResult[0]?.count ?? 0;
  const pageCount = Math.ceil(total / perPage);

  return { data, total, page, pageCount };
}
