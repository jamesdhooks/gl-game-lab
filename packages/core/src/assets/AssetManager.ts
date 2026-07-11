import { EventBus, createEventToken } from '../events/EventBus.js';

const assetValueIdentity = Symbol('GLGameLabAssetValue');
const assetOptionsIdentity = Symbol('GLGameLabAssetOptions');

export interface AssetType<Value, Options = unknown> {
  readonly id: string;
  readonly [assetValueIdentity]: Value;
  readonly [assetOptionsIdentity]: Options;
}

export interface AssetRequest<Value, Options = unknown> {
  readonly id: string;
  readonly type: AssetType<Value, Options>;
  readonly source: string;
  readonly options?: Options;
}

export interface AssetLoaderContext {
  readonly signal: AbortSignal;
  load<Value, Options>(request: AssetRequest<Value, Options>): Promise<Value>;
}

export interface AssetLoader<Value, Options = unknown> {
  readonly id: string;
  readonly type: AssetType<Value, Options>;
  canLoad(request: AssetRequest<Value, Options>): boolean;
  load(context: AssetLoaderContext, request: AssetRequest<Value, Options>): Value | Promise<Value>;
  dispose?(value: Value): void | Promise<void>;
}

export type AssetState = 'loading' | 'ready' | 'failed' | 'unloading';

export interface AssetSnapshot {
  readonly id: string;
  readonly typeId: string;
  readonly source: string;
  readonly loaderId: string;
  readonly state: AssetState;
  readonly references: number;
}

export interface AssetLifecycleEvent {
  readonly asset: AssetSnapshot;
  readonly error?: unknown;
}

export const AssetLoadingEvent = createEventToken<AssetLifecycleEvent>('engine.asset-loading');
export const AssetReadyEvent = createEventToken<AssetLifecycleEvent>('engine.asset-ready');
export const AssetFailedEvent = createEventToken<AssetLifecycleEvent>('engine.asset-failed');
export const AssetUnloadedEvent = createEventToken<AssetLifecycleEvent>('engine.asset-unloaded');

export interface AssetManagerOptions {
  readonly releaseUnused?: boolean;
  readonly events?: EventBus;
}

type UnknownAssetType = AssetType<unknown, unknown>;
type UnknownAssetRequest = AssetRequest<unknown, unknown>;
type UnknownAssetLoader = AssetLoader<unknown, unknown>;

interface AssetRecord {
  readonly request: UnknownAssetRequest;
  readonly optionsKey: string;
  readonly loader: UnknownAssetLoader;
  readonly controller: AbortController;
  readonly dependencies: AssetLease<unknown>[];
  readonly dependencyLoads: Promise<unknown>[];
  state: AssetState;
  references: number;
  value: unknown;
  promise: Promise<unknown>;
}

export function createAssetType<Value, Options = unknown>(id: string): AssetType<Value, Options> {
  const normalized = normalizeId(id, 'Asset type');
  return Object.freeze({ id: normalized }) as AssetType<Value, Options>;
}

export class AssetLease<Value> {
  private released = false;

  constructor(
    readonly id: string,
    readonly typeId: string,
    private readonly asset: Value,
    private readonly releaseAsset: () => Promise<void>,
  ) {}

  get value(): Value {
    if (this.released) throw new Error(`Asset lease has been released: ${this.id}`);
    return this.asset;
  }

  get isReleased(): boolean {
    return this.released;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await this.releaseAsset();
  }
}

export class AssetGroup {
  private readonly leases = new Map<string, GroupLease>();
  private readonly pending = new Map<string, GroupLoad>();
  private released = false;

  constructor(
    readonly id: string,
    private readonly manager: AssetManager,
  ) {}

  async load<Value, Options>(request: AssetRequest<Value, Options>): Promise<Value> {
    if (this.released) throw new Error(`Asset group has been released: ${this.id}`);
    const existing = this.leases.get(request.id);
    if (existing) {
      assertGroupRequest(this.id, existing.request, existing.optionsKey, request);
      return existing.lease.value as Value;
    }
    const pending = this.pending.get(request.id);
    if (pending) {
      assertGroupRequest(this.id, pending.request, pending.optionsKey, request);
      return pending.promise as Promise<Value>;
    }

    const optionsKey = stableOptionsKey(request.options);
    const promise = this.manager.load(request).then(async (lease) => {
      if (this.released) {
        await lease.release();
        throw new Error(`Asset group was released while loading: ${this.id}`);
      }
      this.leases.set(request.id, {
        request: request as UnknownAssetRequest,
        optionsKey,
        lease: lease as AssetLease<unknown>,
      });
      return lease.value;
    }).finally(() => {
      if (this.pending.get(request.id)?.promise === promise) this.pending.delete(request.id);
    });
    this.pending.set(request.id, {
      request: request as UnknownAssetRequest,
      optionsKey,
      promise: promise as Promise<unknown>,
    });
    return promise;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    const failures: unknown[] = [];
    const pendingResults = await Promise.allSettled([...this.pending.values()].map((load) => load.promise));
    for (const result of pendingResults) {
      if (result.status === 'rejected' && !isReleasedDuringLoadError(result.reason)) failures.push(result.reason);
    }
    for (const entry of [...this.leases.values()].reverse()) {
      try {
        await entry.lease.release();
      } catch (error) {
        failures.push(error);
      }
    }
    this.pending.clear();
    this.leases.clear();
    if (failures.length > 0) throw aggregateAssetFailures(`Asset group ${this.id} release failed`, failures);
  }
}

interface GroupLease {
  readonly request: UnknownAssetRequest;
  readonly optionsKey: string;
  readonly lease: AssetLease<unknown>;
}

interface GroupLoad {
  readonly request: UnknownAssetRequest;
  readonly optionsKey: string;
  readonly promise: Promise<unknown>;
}

export class AssetManager {
  readonly events: EventBus;
  private readonly releaseUnused: boolean;
  private readonly typeTokens = new Map<string, UnknownAssetType>();
  private readonly loadersByType = new Map<string, UnknownAssetLoader[]>();
  private readonly loaderIds = new Set<string>();
  private readonly records = new Map<string, AssetRecord>();
  private destroyed = false;

  constructor(options: AssetManagerOptions = {}) {
    this.releaseUnused = options.releaseUnused ?? false;
    this.events = options.events ?? new EventBus();
  }

  registerLoader<Value, Options>(loader: AssetLoader<Value, Options>): this {
    this.assertUsable();
    const id = normalizeId(loader.id, 'Asset loader');
    if (id !== loader.id) throw new Error('Asset loader id cannot contain surrounding whitespace');
    this.registerType(loader.type);
    if (this.loaderIds.has(id)) throw new Error(`Asset loader is already registered: ${id}`);
    this.loaderIds.add(id);
    const loaders = this.loadersByType.get(loader.type.id) ?? [];
    loaders.push(loader as unknown as UnknownAssetLoader);
    this.loadersByType.set(loader.type.id, loaders);
    return this;
  }

  createGroup(id: string): AssetGroup {
    this.assertUsable();
    return new AssetGroup(normalizeId(id, 'Asset group'), this);
  }

  async load<Value, Options>(request: AssetRequest<Value, Options>): Promise<AssetLease<Value>> {
    return this.loadFrom(request, []);
  }

  get<Value, Options>(type: AssetType<Value, Options>, id: string): Value {
    const value = this.tryGet(type, id);
    if (value === undefined) throw new Error(`Asset is not ready: ${id}`);
    return value;
  }

  tryGet<Value, Options>(type: AssetType<Value, Options>, id: string): Value | undefined {
    this.registerType(type);
    const record = this.records.get(id);
    if (!record || record.state !== 'ready') return undefined;
    this.assertRecordType(record, type);
    return record.value as Value;
  }

  snapshot(id: string): AssetSnapshot | undefined {
    const record = this.records.get(id);
    return record ? snapshot(record) : undefined;
  }

  snapshots(): readonly AssetSnapshot[] {
    return [...this.records.values()].map(snapshot);
  }

  async evict(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return false;
    if (record.references > 0) throw new Error(`Asset is still referenced: ${id}`);
    await this.disposeRecord(record);
    return true;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const record of this.records.values()) record.controller.abort('Asset manager destroyed');
    await Promise.allSettled([...this.records.values()].map((record) => record.promise));
    let firstFailure: unknown;
    for (const record of [...this.records.values()].reverse()) {
      try {
        await this.disposeRecord(record, true);
      } catch (error) {
        firstFailure ??= error;
      }
    }
    this.records.clear();
    if (firstFailure !== undefined) throw firstFailure;
  }

  private async loadFrom<Value, Options>(
    request: AssetRequest<Value, Options>,
    ancestry: readonly string[],
  ): Promise<AssetLease<Value>> {
    this.assertUsable();
    const normalized = normalizeRequest(request);
    const optionsKey = stableOptionsKey(normalized.options);
    this.registerType(normalized.type);
    if (ancestry.includes(normalized.id)) {
      throw new Error(`Asset dependency cycle: ${[...ancestry, normalized.id].join(' -> ')}`);
    }

    let record = this.records.get(normalized.id);
    if (record) {
      this.assertCompatibleRequest(record, normalized, optionsKey);
    } else {
      const loader = this.resolveLoader(normalized);
      record = {
        request: normalized as UnknownAssetRequest,
        optionsKey,
        loader,
        controller: new AbortController(),
        dependencies: [],
        dependencyLoads: [],
        state: 'loading',
        references: 0,
        value: undefined,
        promise: Promise.resolve(undefined),
      };
      this.records.set(normalized.id, record);
      this.events.emit(AssetLoadingEvent, { asset: snapshot(record) });
      record.promise = this.performLoad(record, [...ancestry, normalized.id]);
    }

    const value = await record.promise as Value;
    if (this.destroyed || record.state !== 'ready') throw new Error(`Asset did not become ready: ${normalized.id}`);
    record.references += 1;
    return new AssetLease(normalized.id, normalized.type.id, value, () => this.releaseRecord(record as AssetRecord));
  }

  private async performLoad(record: AssetRecord, ancestry: readonly string[]): Promise<unknown> {
    const context: AssetLoaderContext = {
      signal: record.controller.signal,
      load: async <Value, Options>(request: AssetRequest<Value, Options>): Promise<Value> => {
        const dependencyLoad = this.loadFrom(request, ancestry).then((lease) => {
          record.dependencies.push(lease as AssetLease<unknown>);
          return lease.value;
        });
        record.dependencyLoads.push(dependencyLoad);
        return dependencyLoad;
      },
    };
    try {
      const value = await record.loader.load(context, record.request);
      await Promise.all(record.dependencyLoads);
      if (value === undefined) throw new Error(`Asset loader ${record.loader.id} returned undefined`);
      if (record.controller.signal.aborted) throw abortError(record.controller.signal.reason);
      record.value = value;
      record.state = 'ready';
      this.events.emit(AssetReadyEvent, { asset: snapshot(record) });
      return value;
    } catch (error) {
      record.state = 'failed';
      this.events.emit(AssetFailedEvent, { asset: snapshot(record), error });
      this.records.delete(record.request.id);
      await Promise.allSettled(record.dependencyLoads);
      try {
        await releaseDependencies(record.dependencies);
      } catch (cleanupError) {
        throw aggregateAssetFailures(`Asset ${record.request.id} load and cleanup failed`, [error, cleanupError]);
      }
      throw error;
    }
  }

  private async releaseRecord(record: AssetRecord): Promise<void> {
    if (record.references > 0) record.references -= 1;
    if (!this.destroyed && this.releaseUnused && record.references === 0 && record.state === 'ready') {
      await this.disposeRecord(record);
    }
  }

  private async disposeRecord(record: AssetRecord, force = false): Promise<void> {
    if (!force && record.references > 0) throw new Error(`Asset is still referenced: ${record.request.id}`);
    if (record.state === 'loading') {
      record.controller.abort('Asset evicted while loading');
      try {
        await record.promise;
      } catch {
        return;
      }
    }
    if (record.state !== 'ready') {
      this.records.delete(record.request.id);
      return;
    }
    record.state = 'unloading';
    const unloading = snapshot(record);
    const failures: unknown[] = [];
    try {
      await record.loader.dispose?.(record.value);
    } catch (error) {
      failures.push(error);
    }
    try {
      await releaseDependencies(record.dependencies);
    } catch (error) {
      failures.push(error);
    }
    this.records.delete(record.request.id);
    this.events.emit(AssetUnloadedEvent, { asset: unloading });
    if (failures.length > 0) {
      throw aggregateAssetFailures(`Asset ${record.request.id} disposal failed`, failures);
    }
  }

  private resolveLoader(request: UnknownAssetRequest): UnknownAssetLoader {
    const loaders = this.loadersByType.get(request.type.id) ?? [];
    const loader = loaders.find((candidate) => candidate.canLoad(request));
    if (!loader) throw new Error(`No asset loader accepts ${request.id} (${request.type.id})`);
    return loader;
  }

  private registerType(type: UnknownAssetType): void {
    const existing = this.typeTokens.get(type.id);
    if (existing && existing !== type) throw new Error(`Asset type id belongs to another token: ${type.id}`);
    if (!existing) this.typeTokens.set(type.id, type);
  }

  private assertRecordType<Value, Options>(record: AssetRecord, type: AssetType<Value, Options>): void {
    if (record.request.type !== type) throw new Error(`Asset ${record.request.id} was loaded with another type`);
  }

  private assertCompatibleRequest(
    record: AssetRecord,
    request: UnknownAssetRequest,
    optionsKey: string,
  ): void {
    this.assertRecordType(record, request.type);
    if (record.request.source !== request.source) {
      throw new Error(`Asset ${request.id} was already requested from another source`);
    }
    if (record.optionsKey !== optionsKey) {
      throw new Error(`Asset ${request.id} was already requested with different options`);
    }
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Asset manager has been destroyed');
  }
}

async function releaseDependencies(dependencies: AssetLease<unknown>[]): Promise<void> {
  const failures: unknown[] = [];
  for (const dependency of [...dependencies].reverse()) {
    try {
      await dependency.release();
    } catch (error) {
      failures.push(error);
    }
  }
  dependencies.length = 0;
  if (failures.length > 0) throw aggregateAssetFailures('Asset dependency release failed', failures);
}

function normalizeRequest<Value, Options>(request: AssetRequest<Value, Options>): AssetRequest<Value, Options> {
  const id = normalizeId(request.id, 'Asset');
  if (id !== request.id) throw new Error('Asset id cannot contain surrounding whitespace');
  const source = request.source.trim();
  if (source.length === 0) throw new Error(`Asset ${id} source cannot be empty`);
  return request.options === undefined
    ? { id, type: request.type, source }
    : { id, type: request.type, source, options: request.options };
}

function snapshot(record: AssetRecord): AssetSnapshot {
  return Object.freeze({
    id: record.request.id,
    typeId: record.request.type.id,
    source: record.request.source,
    loaderId: record.loader.id,
    state: record.state,
    references: record.references,
  });
}

function normalizeId(id: string, label: string): string {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error(`${label} id cannot be empty`);
  return normalized;
}

function abortError(reason: unknown): Error {
  return new Error('Asset load aborted', { cause: reason });
}

function assertGroupRequest<Value, Options>(
  groupId: string,
  existing: UnknownAssetRequest,
  existingOptionsKey: string,
  request: AssetRequest<Value, Options>,
): void {
  if (existing.type !== request.type) {
    throw new Error(`Asset group ${groupId} already owns ${request.id} with another type`);
  }
  if (existing.source.trim() !== request.source.trim()) {
    throw new Error(`Asset group ${groupId} already owns ${request.id} from another source`);
  }
  if (existingOptionsKey !== stableOptionsKey(request.options)) {
    throw new Error(`Asset group ${groupId} already owns ${request.id} with different options`);
  }
}

function stableOptionsKey(value: unknown): string {
  return stableValueKey(value, new Set<object>());
}

function stableValueKey(value: unknown, ancestors: Set<object>): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return `boolean:${value}`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Asset request options must contain finite numbers');
    return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
  }
  if (typeof value !== 'object') {
    throw new Error(`Asset request options contain unsupported ${typeof value} value`);
  }
  if (ancestors.has(value)) throw new Error('Asset request options cannot contain cycles');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `array:[${value.map((entry) => stableValueKey(entry, ancestors)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Asset request options must use plain objects and arrays');
    }
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `object:{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableValueKey(entry, ancestors)}`).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function aggregateAssetFailures(message: string, failures: readonly unknown[]): unknown {
  return failures.length === 1 ? failures[0] : new AggregateError(failures, message);
}

function isReleasedDuringLoadError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Asset group was released while loading:');
}
