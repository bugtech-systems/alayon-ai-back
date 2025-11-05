// Deep merge utility function
/**
 * Deep merge objects and arrays of objects.
 * - Objects are merged recursively.
 * - Arrays of objects are merged element by element (by index).
 * - Other arrays are concatenated (default behavior).
 */
export function deepMerge(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    // ✅ Always replace arrays
    return [...source];
  }

  if (target instanceof Object && source instanceof Object && !Array.isArray(source)) {
    const result = { ...target };

    for (const key in source) {
      if (key in target) {
        result[key] = deepMerge(target[key], source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }

    return result;
  }

  // Fallback: overwrite if source is defined
  return source !== undefined ? source : target;
}


export function mapResourceTypes(rows) {
  const resourceMap = new Map();

  for (const row of rows) {
    const resource = row.resource_tags;
    const field = row.resource_fields;

    if (!resourceMap.has(resource.id)) {
      resourceMap.set(resource.id, {
        ...resource,
        fields: []
      });
    }

    if (field && !field.isDeleted) {
      resourceMap.get(resource.id).fields.push(field);
    }
  }

  return Array.from(resourceMap.values());
}

export function mapSingleResource(rows) {
  const mapped = mapResourceTypes(rows);
  return mapped.length ? mapped[0] : null;
}
