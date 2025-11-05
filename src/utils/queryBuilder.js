import { eq, ne, gt, lt, gte, lte, like, ilike, isNotNull, exists, sql, and, or, inArray } from "drizzle-orm";
import { resourceTags, actionTemplates, resourceRelationships, resourceFields } from "../db/schema.js";

// --- Schema registry ---
const schemas = { resourceTags, actionTemplates, resourceRelationships, resourceFields };

export function getSchema(tableName) {
  const schema = schemas[tableName];
  if (!schema) return resourceTags;
  return schema;
}

// --- Determine if object contains operators ---
function isOperatorObject(obj) {
  if (!obj || typeof obj !== "object") return false;
  const operators = [
    "eq","ne","gt","lt","gte","lte","like","ilike","contains","array_contains","notNull","exists"
  ];
  return Object.keys(obj).some(k => operators.includes(k));
}

// --- Resolve columns or nested JSONB paths ---
function resolveColumn(schema, fieldKey, forceJson = false) {
  if (fieldKey.includes(".")) {
    const [root, ...jsonPath] = fieldKey.split(".");
    const column = schema[root];
    if (!column) throw new Error(`Column "${root}" not found in schema`);

    let expr = sql`${column}`;
    jsonPath.forEach((p, i) => {
      const isLast = i === jsonPath.length - 1;

      if (isLast) {
        expr = forceJson
          ? sql`${expr}->${p}`   // ✅ keep JSONB
          : sql`${expr}->>${p}`; // ✅ extract text
      } else {
        expr = sql`${expr}->${p}`;
      }
    });

    return { column: expr, type: forceJson ? "jsonb" : "text" };
  }

  return { column: schema[fieldKey], type: "jsonb" };
}

// --- Build individual filter ---
function buildFilter(column, op, value, columnType = "text") {
  switch (op) {
    // Normal comparisons (work on both normal + extracted JSONB text)
    case "eq":
      return sql`${column} = ${value}`;
    case "ne":
      return sql`${column} <> ${value}`;
    case "gt":
      return sql`${column} > ${value}`;
    case "lt":
      return sql`${column} < ${value}`;
    case "gte":
      return sql`${column} >= ${value}`;
    case "lte":
      return sql`${column} <= ${value}`;
    case "like":
      return sql`${column} LIKE ${'%' + value + '%'}`;
    case "ilike":
      return sql`${column} ILIKE ${'%' + value + '%'}`;

    // JSONB operators
    case "contains":
      return sql`${column} @> ${JSON.stringify(value)}::jsonb`;
    case "array_contains":
      return sql`${column} @> ${JSON.stringify([value])}::jsonb`;

    case "notNull":
      return sql`${column} IS NOT NULL`;

    default:
      throw new Error(`Unsupported operator: ${op}`);
  }
}

 

// --- Recursive conditions builder ---
export function buildConditions(schema, conditions, parentPath = []) {
  if (!conditions || typeof conditions !== "object") return null;

  if (conditions.or) {
    return or(...conditions.or.map(c => buildConditions(schema, c, parentPath)));
  }

  if (conditions.and) {
    return and(...conditions.and.map(c => buildConditions(schema, c, parentPath)));
  }

  const filters = [];

  for (const [key, value] of Object.entries(conditions)) {
    const currentPath = [...parentPath, key];

if (isOperatorObject(value)) {
  for (const [op, v] of Object.entries(value)) {
    const { column } = resolveColumn(schema, currentPath.join("."), ["contains", "array_contains"].includes(op));
    filters.push(buildFilter(column, op, v));
  }
}   else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Nested object → recursive
      filters.push(buildConditions(schema, value, currentPath));
    } else {
      // Primitive → default eq
      const { column, type } = resolveColumn(schema, currentPath.join("."));
      filters.push(eq(column, value));
    }
  }

  return filters.length === 1 ? filters[0] : and(...filters);
}



// --- Fully dynamic query builder with relationship alias mapping ---
// --- Fully dynamic query builder with relationship alias mapping ---
export async function dynamicQuery(db, tableName, options = {}) {
  const { select = ["*"], where = {}, orderBy = [], limit, offset, relationships = [] } = options;

  const schema = getSchema(tableName);

  // Dynamic select
  const selectedFields =
    select[0] === "*"
      ? undefined
      : select.reduce((acc, key) => {
          acc[key] = schema[key];
          return acc;
        }, {});

  // Build conditions
  const condition = Object.keys(where).length > 0 ? buildConditions(schema, where) : undefined;

  // --- Base query ---
  let query = db.select(selectedFields || undefined).from(schema);

  if (condition) query = query.where(condition);
  if (orderBy.length > 0) {
    orderBy.forEach((o) => {
      const { column } = resolveColumn(schema, o.field);
      query = query.orderBy(o.direction === "desc" ? sql`${column} DESC` : sql`${column} ASC`);
    });
  }
  if (limit) query = query.limit(limit);
  if (offset) query = query.offset(offset);

  // Execute query first
  let rows = await query;

  // --- Relationship handling ---
// --- Relationship handling ---
for (const rel of relationships) {
  const relSchema = getSchema(rel.model);

  const localKeys = rows.map(r => r[rel.localKey]);

  if (localKeys.length === 0) {
    // Nothing to relate
    rows = rows.map(r => ({ ...r, [rel.alias]: [] }));
    continue;
  }

  // Fetch related rows safely with inArray()
  const relRows = await db
    .select()
    .from(relSchema)
    .where(inArray(relSchema[rel.foreignKey], localKeys));

  // Group related rows by foreign key
  const grouped = relRows.reduce((acc, row) => {
    const fk = row[rel.foreignKey];
    if (!acc[fk]) acc[fk] = [];
    acc[fk].push(row);
    return acc;
  }, {});

  // Attach to main rows
  rows = rows.map(r => ({
    ...r,
    [rel.alias]: grouped[r[rel.localKey]] || []
  }));
}

  return rows;
}




