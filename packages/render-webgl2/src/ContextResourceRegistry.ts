export interface ContextRestorableResource {
  readonly id: string;
  readonly priority?: number;
  readonly estimatedBytes?: number | (() => number);
  invalidate?(): void;
  restore(): void;
}

interface RegisteredResource {
  readonly resource: ContextRestorableResource;
  readonly order: number;
}

export class ContextResourceRegistry {
  private readonly entries = new Map<ContextRestorableResource, RegisteredResource>();
  private registrationOrder = 0;
  private currentGeneration = 0;

  get generation(): number {
    return this.currentGeneration;
  }

  get size(): number {
    return this.entries.size;
  }

  register(resource: ContextRestorableResource): () => void {
    if (resource.id.trim().length === 0) throw new Error('Context resource id cannot be empty');
    if (this.entries.has(resource)) throw new Error(`Context resource is already registered: ${resource.id}`);
    if ([...this.entries.values()].some((entry) => entry.resource.id === resource.id)) {
      throw new Error(`Context resource id is already registered: ${resource.id}`);
    }
    this.entries.set(resource, { resource, order: this.registrationOrder });
    this.registrationOrder += 1;
    return () => { this.entries.delete(resource); };
  }

  invalidate(): void {
    const failures: unknown[] = [];
    for (const { resource } of this.orderedEntries().reverse()) {
      try {
        resource.invalidate?.();
      } catch (error) {
        failures.push(resourceFailure(resource.id, 'invalidation', error));
      }
    }
    if (failures.length > 0) throw contextFailures('Context resource invalidation failed', failures);
  }

  restore(): void {
    const failures: unknown[] = [];
    for (const { resource } of this.orderedEntries()) {
      try {
        resource.restore();
      } catch (error) {
        failures.push(resourceFailure(resource.id, 'restoration', error));
      }
    }
    if (failures.length > 0) throw contextFailures('Context resource restoration failed', failures);
    this.currentGeneration += 1;
  }

  snapshot(): readonly { readonly id: string; readonly priority: number; readonly estimatedBytes: number }[] {
    return Object.freeze(this.orderedEntries().map(({ resource }) => Object.freeze({
      id: resource.id,
      priority: resource.priority ?? 0,
      estimatedBytes: estimatedBytes(resource.estimatedBytes),
    })));
  }

  clear(): void {
    this.entries.clear();
  }

  private orderedEntries(): RegisteredResource[] {
    return [...this.entries.values()].sort((left, right) =>
      (left.resource.priority ?? 0) - (right.resource.priority ?? 0)
      || left.order - right.order,
    );
  }
}

function estimatedBytes(value: ContextRestorableResource['estimatedBytes']): number {
  const resolved = typeof value === 'function' ? value() : value ?? 0;
  return Number.isSafeInteger(resolved) && resolved >= 0 ? resolved : 0;
}

function contextFailures(message: string, failures: readonly unknown[]): unknown {
  return failures.length === 1 ? failures[0] : new AggregateError(failures, message);
}

function resourceFailure(id: string, operation: 'invalidation' | 'restoration', cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`Context resource ${operation} failed: ${id} (${detail})`, { cause });
}
