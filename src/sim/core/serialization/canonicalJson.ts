/**
 * Deterministic ("canonical") JSON serialization.
 *
 * Plain `JSON.stringify` preserves object key insertion order, which is
 * usually fine — but WorldState is assembled incrementally across many
 * independent modules and ticks, so two states that are semantically equal
 * are NOT guaranteed to have been built with identical key insertion order.
 * `canonicalStringify` recursively sorts object keys so that semantically
 * equal states always serialize to byte-identical strings — a requirement
 * for reliable save/load, replay hashing, and network snapshot diffing.
 */
export function canonicalStringify(value: unknown): string {
  return stringifyValue(value);
}

function stringifyValue(value: unknown): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonicalStringify: non-finite number is not JSON-serializable: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "undefined") {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyValue(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stringifyValue(obj[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`canonicalStringify: unsupported value type "${typeof value}"`);
}

export function canonicalParse<T>(json: string): T {
  return JSON.parse(json) as T;
}
