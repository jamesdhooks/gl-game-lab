export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject { readonly [key: string]: JsonValue; }
export interface JsonArray extends ReadonlyArray<JsonValue> {}

export function assertJsonValue(value: unknown, path = '$'): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`JSON number must be finite at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`JSON object must have a plain prototype at ${path}`);
    }
    for (const [key, entry] of Object.entries(value)) assertJsonValue(entry, `${path}.${key}`);
    return;
  }
  throw new Error(`Value is not JSON-compatible at ${path}`);
}

export function requireJsonObject(value: JsonValue, path: string): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`Expected JSON object at ${path}`);
  }
  return value as JsonObject;
}

export function requireJsonString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== 'string') throw new Error(`Expected string at ${path}`);
  return value;
}

export function requireJsonNumber(value: JsonValue | undefined, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Expected finite number at ${path}`);
  return value;
}

export function requireJsonBoolean(value: JsonValue | undefined, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Expected boolean at ${path}`);
  return value;
}
