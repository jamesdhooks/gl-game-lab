import { assertJsonValue, requireJsonObject, requireJsonString, type JsonValue } from './Json.js';
import type { SchemaMigration } from './SchemaRegistry.js';

export interface SaveSchema<State> {
  readonly id: string;
  readonly version: number;
  readonly migrations?: readonly SchemaMigration[];
  encode(state: State): JsonValue;
  decode(data: JsonValue): State;
}

export interface SaveSnapshot {
  readonly format: 'gl-game-lab.save';
  readonly gameId: string;
  readonly schema: string;
  readonly version: number;
  readonly data: JsonValue;
}

export interface RestoredSave<State> {
  readonly gameId: string;
  readonly state: State;
}

export class SaveSnapshotCodec<State> {
  constructor(private readonly schema: SaveSchema<State>) {
    const id = normalizeId(schema.id, 'Save schema');
    if (id !== schema.id) throw new Error('Save schema id cannot contain surrounding whitespace');
    validateVersion(schema.version, `Save schema ${schema.id}`);
    validateMigrations(schema.id, schema.version, schema.migrations ?? []);
  }

  create(gameId: string, state: State): SaveSnapshot {
    const normalizedGameId = normalizeId(gameId, 'Game');
    const data = this.schema.encode(state);
    assertJsonValue(data, `${this.schema.id}.data`);
    return Object.freeze({
      format: 'gl-game-lab.save',
      gameId: normalizedGameId,
      schema: this.schema.id,
      version: this.schema.version,
      data,
    });
  }

  restore(input: unknown): RestoredSave<State> {
    const snapshot = parseSnapshot(input);
    if (snapshot.schema !== this.schema.id) {
      throw new Error(`Save schema mismatch: expected ${this.schema.id}, received ${snapshot.schema}`);
    }
    if (snapshot.version > this.schema.version) {
      throw new Error(
        `Save version ${snapshot.version} is newer than supported version ${this.schema.version}`,
      );
    }
    let data = snapshot.data;
    for (let version = snapshot.version; version < this.schema.version; version += 1) {
      const migration = this.schema.migrations?.find((candidate) => candidate.from === version);
      if (!migration) throw new Error(`Missing save migration for ${this.schema.id} version ${version}`);
      data = migration.migrate(data);
      assertJsonValue(data, `${this.schema.id}.migration-${version}`);
    }
    return Object.freeze({ gameId: snapshot.gameId, state: this.schema.decode(data) });
  }
}

function parseSnapshot(input: unknown): SaveSnapshot {
  assertJsonValue(input);
  const object = requireJsonObject(input, 'save');
  if (object.format !== 'gl-game-lab.save') throw new Error('Unsupported save snapshot format');
  const gameId = requireJsonString(object.gameId, 'save.gameId');
  const schema = requireJsonString(object.schema, 'save.schema');
  if (typeof object.version !== 'number' || !Number.isSafeInteger(object.version) || object.version < 1) {
    throw new Error('Save version must be a positive integer');
  }
  if (object.data === undefined) throw new Error('Save snapshot has no data');
  return { format: 'gl-game-lab.save', gameId, schema, version: object.version, data: object.data };
}

function normalizeId(id: string, label: string): string {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error(`${label} id cannot be empty`);
  return normalized;
}

function validateVersion(version: number, label: string): void {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error(`${label} version must be a positive integer`);
}

function validateMigrations(id: string, version: number, migrations: readonly SchemaMigration[]): void {
  const byVersion = new Map<number, SchemaMigration>();
  for (const migration of migrations) {
    validateVersion(migration.from, `Save migration for ${id}`);
    if (migration.from >= version) throw new Error(`Save migration for ${id} starts at current or future version`);
    if (byVersion.has(migration.from)) throw new Error(`Duplicate save migration for ${id} version ${migration.from}`);
    byVersion.set(migration.from, migration);
  }
  for (let from = 1; from < version; from += 1) {
    if (!byVersion.has(from)) throw new Error(`Missing save migration for ${id} version ${from}`);
  }
}
