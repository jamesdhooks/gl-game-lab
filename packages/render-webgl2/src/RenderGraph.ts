const resourceIdentity = Symbol('GLGameLabRenderResource');

export type RenderResourceLifetime = 'transient' | 'persistent' | 'external';

export interface RenderResource<Descriptor> {
  readonly id: string;
  readonly [resourceIdentity]: Descriptor;
}

export interface RenderResourceDefinition<Descriptor> {
  readonly descriptor: Descriptor;
  readonly lifetime?: RenderResourceLifetime;
}

export interface RenderPassContext<Resource, Descriptor> {
  resource(handle: RenderResource<Descriptor>): Resource;
}

export interface RenderPass<Resource, Descriptor> {
  readonly id: string;
  readonly reads?: readonly RenderResource<Descriptor>[];
  readonly writes?: readonly RenderResource<Descriptor>[];
  readonly before?: readonly string[];
  readonly after?: readonly string[];
  execute(context: RenderPassContext<Resource, Descriptor>): void;
}

export interface RenderResourceAllocator<Resource, Descriptor> {
  create(descriptor: Descriptor, id: string): Resource;
  destroy(resource: Resource, id: string): void;
}

interface ResourceRecord<Resource, Descriptor> {
  readonly handle: RenderResource<Descriptor>;
  readonly descriptor: Descriptor;
  readonly lifetime: RenderResourceLifetime;
  external: Resource | undefined;
  persistent: Resource | undefined;
}

interface RegisteredPass<Resource, Descriptor> {
  readonly pass: RenderPass<Resource, Descriptor>;
  readonly registrationOrder: number;
}

export class RenderGraph<Resource, Descriptor> {
  private readonly resources = new Map<string, ResourceRecord<Resource, Descriptor>>();
  private readonly passes = new Map<string, RegisteredPass<Resource, Descriptor>>();
  private compiled: readonly RenderPass<Resource, Descriptor>[] | undefined;
  private registrationOrder = 0;

  createResource(id: string, definition: RenderResourceDefinition<Descriptor>): RenderResource<Descriptor> {
    const normalized = normalizeId(id, 'Render resource');
    if (this.resources.has(normalized)) throw new Error(`Render resource already exists: ${normalized}`);
    const handle = Object.freeze({ id: normalized }) as RenderResource<Descriptor>;
    this.resources.set(normalized, {
      handle,
      descriptor: definition.descriptor,
      lifetime: definition.lifetime ?? 'transient',
      external: undefined,
      persistent: undefined,
    });
    this.compiled = undefined;
    return handle;
  }

  setExternal(handle: RenderResource<Descriptor>, resource: Resource): void {
    const record = this.requireResource(handle);
    if (record.lifetime !== 'external') {
      throw new Error(`Render resource ${handle.id} is not external`);
    }
    record.external = resource;
  }

  addPass(pass: RenderPass<Resource, Descriptor>): this {
    const id = normalizeId(pass.id, 'Render pass');
    if (this.passes.has(id)) throw new Error(`Render pass already exists: ${id}`);
    for (const resource of [...(pass.reads ?? []), ...(pass.writes ?? [])]) this.requireResource(resource);
    this.passes.set(id, {
      pass: { ...pass, id },
      registrationOrder: this.registrationOrder,
    });
    this.registrationOrder += 1;
    this.compiled = undefined;
    return this;
  }

  removePass(id: string): boolean {
    const removed = this.passes.delete(id);
    if (removed) this.compiled = undefined;
    return removed;
  }

  orderedPasses(): readonly RenderPass<Resource, Descriptor>[] {
    if (!this.compiled) this.compiled = this.compile();
    return this.compiled;
  }

  execute(allocator: RenderResourceAllocator<Resource, Descriptor>): void {
    const resources = new Map<string, Resource>();
    const transient: Array<{ readonly id: string; readonly value: Resource }> = [];
    try {
      for (const record of this.resources.values()) {
        if (record.lifetime === 'external') {
          if (record.external === undefined) throw new Error(`External render resource is not set: ${record.handle.id}`);
          resources.set(record.handle.id, record.external);
        } else if (record.lifetime === 'persistent') {
          record.persistent ??= allocator.create(record.descriptor, record.handle.id);
          resources.set(record.handle.id, record.persistent);
        } else {
          const value = allocator.create(record.descriptor, record.handle.id);
          resources.set(record.handle.id, value);
          transient.push({ id: record.handle.id, value });
        }
      }
      const context: RenderPassContext<Resource, Descriptor> = {
        resource: (handle) => {
          const value = resources.get(handle.id);
          if (value === undefined) throw new Error(`Render resource is unavailable: ${handle.id}`);
          return value;
        },
      };
      for (const pass of this.orderedPasses()) pass.execute(context);
    } finally {
      for (const entry of transient.reverse()) allocator.destroy(entry.value, entry.id);
    }
  }

  dispose(allocator: RenderResourceAllocator<Resource, Descriptor>): void {
    for (const record of this.resources.values()) {
      if (record.persistent !== undefined) {
        allocator.destroy(record.persistent, record.handle.id);
        record.persistent = undefined;
      }
      record.external = undefined;
    }
  }

  private compile(): readonly RenderPass<Resource, Descriptor>[] {
    const registered = [...this.passes.values()];
    const byId = new Map(registered.map((entry) => [entry.pass.id, entry]));
    const outgoing = new Map(registered.map((entry) => [entry.pass.id, new Set<string>()]));
    const incoming = new Map(registered.map((entry) => [entry.pass.id, 0]));
    const lastWriter = new Map<string, string>();

    const connect = (from: string, to: string): void => {
      if (!byId.has(from) || !byId.has(to)) {
        const missing = byId.has(from) ? to : from;
        throw new Error(`Render pass ordering references unknown pass ${missing}`);
      }
      const targets = outgoing.get(from);
      if (!targets || targets.has(to)) return;
      targets.add(to);
      incoming.set(to, (incoming.get(to) ?? 0) + 1);
    };

    for (const { pass } of registered) {
      for (const resource of pass.reads ?? []) {
        const producer = lastWriter.get(resource.id);
        const record = this.requireResource(resource);
        if (producer) connect(producer, pass.id);
        else if (record.lifetime === 'transient') {
          throw new Error(`Render pass ${pass.id} reads ${resource.id} before it is written`);
        }
      }
      for (const resource of pass.writes ?? []) {
        const producer = lastWriter.get(resource.id);
        if (producer) connect(producer, pass.id);
        lastWriter.set(resource.id, pass.id);
      }
      for (const target of pass.before ?? []) connect(pass.id, target);
      for (const target of pass.after ?? []) connect(target, pass.id);
    }

    const ready = registered.filter(({ pass }) => incoming.get(pass.id) === 0);
    ready.sort((left, right) => left.registrationOrder - right.registrationOrder);
    const ordered: RenderPass<Resource, Descriptor>[] = [];
    while (ready.length > 0) {
      const current = ready.shift();
      if (!current) break;
      ordered.push(current.pass);
      for (const target of outgoing.get(current.pass.id) ?? []) {
        const count = (incoming.get(target) ?? 0) - 1;
        incoming.set(target, count);
        if (count === 0) {
          const next = byId.get(target);
          if (next) {
            ready.push(next);
            ready.sort((left, right) => left.registrationOrder - right.registrationOrder);
          }
        }
      }
    }
    if (ordered.length !== registered.length) throw new Error('Render pass dependency cycle detected');
    return Object.freeze(ordered);
  }

  private requireResource(handle: RenderResource<Descriptor>): ResourceRecord<Resource, Descriptor> {
    const record = this.resources.get(handle.id);
    if (!record) throw new Error(`Render resource is not registered: ${handle.id}`);
    if (record.handle !== handle) throw new Error(`Render resource id belongs to another handle: ${handle.id}`);
    return record;
  }
}

function normalizeId(id: string, label: string): string {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error(`${label} id cannot be empty`);
  return normalized;
}
