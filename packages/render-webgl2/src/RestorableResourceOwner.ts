import type { ContextResourceRegistry } from './ContextResourceRegistry.js';

export interface RestorableResourceDescriptor<T> {
  readonly id: string;
  readonly priority?: number;
  readonly create: () => T;
  readonly dispose: (resource: T) => void;
  readonly invalidate?: (resource: T) => void;
  readonly restored?: (resource: T) => void;
}

/** Owns a logical GPU resource whose physical WebGL handles must be recreated after context loss. */
export class RestorableResourceOwner<T> {
  private current: T;
  private readonly unregister: () => void;
  private disposed = false;

  constructor(
    registry: ContextResourceRegistry,
    private readonly descriptor: RestorableResourceDescriptor<T>,
  ) {
    this.current = descriptor.create();
    try {
      this.unregister = registry.register({
        id: descriptor.id,
        ...(descriptor.priority === undefined ? {} : { priority: descriptor.priority }),
        invalidate: () => {
          if (!this.disposed) descriptor.invalidate?.(this.current);
        },
        restore: () => { this.restore(); },
      });
    } catch (error) {
      descriptor.dispose(this.current);
      throw error;
    }
  }

  get value(): T {
    if (this.disposed) throw new Error(`Restorable resource has been disposed: ${this.descriptor.id}`);
    return this.current;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unregister();
    this.descriptor.dispose(this.current);
  }

  private restore(): void {
    if (this.disposed) return;
    const previous = this.current;
    const replacement = this.descriptor.create();
    this.current = replacement;
    const failures: unknown[] = [];
    try {
      this.descriptor.dispose(previous);
    } catch (error) {
      failures.push(error);
    }
    try {
      this.descriptor.restored?.(replacement);
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, `Restorable resource recovery failed: ${this.descriptor.id}`);
    }
  }
}
