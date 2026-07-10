const componentIdentity = Symbol('GLGameLabComponentType');

export interface ComponentType<T> {
  readonly id: string;
  readonly [componentIdentity]: T;
}

export type ComponentValue<T> = T extends ComponentType<infer Value> ? Value : never;

export function createComponentType<T>(id: string): ComponentType<T> {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error('Component type id cannot be empty');
  return Object.freeze({ id: normalized }) as ComponentType<T>;
}
