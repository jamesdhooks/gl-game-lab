import type { ComponentType } from '../ecs/Component.js';
import type { Entity } from '../ecs/Entity.js';
import { assertJsonValue, type JsonValue } from './Json.js';

export interface SerializationWriteContext {
  entityId(entity: Entity): string;
}

export interface SerializationReadContext {
  entity(id: string): Entity;
}

export interface SchemaMigration {
  readonly from: number;
  migrate(data: JsonValue): JsonValue;
}

export interface ComponentSchema<Value> {
  readonly type: ComponentType<Value>;
  readonly version: number;
  readonly migrations?: readonly SchemaMigration[];
  encode(value: Value, context: SerializationWriteContext): JsonValue;
  decode(data: JsonValue, context: SerializationReadContext): Value;
}

export interface SerializedComponent {
  readonly type: string;
  readonly version: number;
  readonly data: JsonValue;
}

type UnknownComponentSchema = ComponentSchema<unknown>;

export class ComponentSchemaRegistry {
  private readonly entries = new Map<string, UnknownComponentSchema>();

  register<Value>(schema: ComponentSchema<Value>): this {
    validateVersion(schema.version, `Component schema ${schema.type.id}`);
    validateMigrations(schema.type.id, schema.version, schema.migrations ?? []);
    const existing = this.entries.get(schema.type.id);
    if (existing && existing !== schema) {
      throw new Error(`Component schema is already registered: ${schema.type.id}`);
    }
    this.entries.set(schema.type.id, schema as UnknownComponentSchema);
    return this;
  }

  get(typeId: string): UnknownComponentSchema | undefined {
    return this.entries.get(typeId);
  }

  schemas(): readonly UnknownComponentSchema[] {
    return [...this.entries.values()].sort((left, right) => left.type.id.localeCompare(right.type.id));
  }

  encode<Value>(schema: ComponentSchema<Value>, value: Value, context: SerializationWriteContext): SerializedComponent {
    const data = schema.encode(value, context);
    assertJsonValue(data, `${schema.type.id}.data`);
    return Object.freeze({ type: schema.type.id, version: schema.version, data });
  }

  decode(serialized: SerializedComponent, context: SerializationReadContext): {
    readonly type: ComponentType<unknown>;
    readonly value: unknown;
  } {
    const schema = this.entries.get(serialized.type);
    if (!schema) throw new Error(`No component schema is registered for ${serialized.type}`);
    validateVersion(serialized.version, `Serialized component ${serialized.type}`);
    if (serialized.version > schema.version) {
      throw new Error(
        `Serialized component ${serialized.type} version ${serialized.version} is newer than supported version ${schema.version}`,
      );
    }
    let data = serialized.data;
    for (let version = serialized.version; version < schema.version; version += 1) {
      const migration = schema.migrations?.find((candidate) => candidate.from === version);
      if (!migration) throw new Error(`Missing migration for ${serialized.type} version ${version}`);
      data = migration.migrate(data);
      assertJsonValue(data, `${serialized.type}.migration-${version}`);
    }
    return { type: schema.type, value: schema.decode(data, context) };
  }
}

function validateVersion(version: number, label: string): void {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error(`${label} version must be a positive integer`);
}

function validateMigrations(typeId: string, version: number, migrations: readonly SchemaMigration[]): void {
  const byVersion = new Map<number, SchemaMigration>();
  for (const migration of migrations) {
    validateVersion(migration.from, `Migration for ${typeId}`);
    if (migration.from >= version) throw new Error(`Migration for ${typeId} starts at current or future version`);
    if (byVersion.has(migration.from)) throw new Error(`Duplicate migration for ${typeId} version ${migration.from}`);
    byVersion.set(migration.from, migration);
  }
  for (let from = 1; from < version; from += 1) {
    if (!byVersion.has(from)) throw new Error(`Missing migration for ${typeId} version ${from}`);
  }
}
