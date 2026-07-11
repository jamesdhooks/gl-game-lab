export interface AssetManifestEntry {
  readonly id: string;
  readonly typeId: string;
  readonly source: string;
  readonly dependencies?: readonly string[];
  readonly budgetBytes?: number;
  readonly tags?: readonly string[];
}

export interface AssetManifestDiagnostics {
  readonly entries: number;
  readonly declaredBudgetBytes: number;
  readonly dependencyEdges: number;
  readonly loadOrder: readonly string[];
}

/** Validated declarative asset graph used by tooling, budgets, and preload planning. */
export class AssetManifest {
  private readonly byId = new Map<string, AssetManifestEntry>();
  readonly diagnostics: AssetManifestDiagnostics;

  constructor(entries: readonly AssetManifestEntry[]) {
    for (const entry of entries) {
      const normalized = normalizeEntry(entry);
      if (this.byId.has(normalized.id)) throw new Error(`Duplicate asset manifest entry: ${normalized.id}`);
      this.byId.set(normalized.id, normalized);
    }
    for (const entry of this.byId.values()) {
      for (const dependency of entry.dependencies ?? []) {
        if (!this.byId.has(dependency)) throw new Error(`Asset manifest ${entry.id} requires missing asset ${dependency}`);
      }
    }
    const loadOrder = resolveLoadOrder(this.byId);
    this.diagnostics = Object.freeze({
      entries: this.byId.size,
      declaredBudgetBytes: [...this.byId.values()].reduce((total, entry) => total + (entry.budgetBytes ?? 0), 0),
      dependencyEdges: [...this.byId.values()].reduce((total, entry) => total + (entry.dependencies?.length ?? 0), 0),
      loadOrder: Object.freeze(loadOrder),
    });
  }

  get(id: string): AssetManifestEntry {
    const entry = this.byId.get(id);
    if (!entry) throw new Error(`Unknown asset manifest entry: ${id}`);
    return entry;
  }

  has(id: string): boolean { return this.byId.has(id); }
  entries(): readonly AssetManifestEntry[] { return Object.freeze([...this.byId.values()]); }
}

function normalizeEntry(entry: AssetManifestEntry): AssetManifestEntry {
  const id = required(entry.id, 'Asset manifest id');
  const typeId = required(entry.typeId, `Asset manifest ${id} type`);
  const source = required(entry.source, `Asset manifest ${id} source`);
  const dependencies = Object.freeze([...(entry.dependencies ?? [])].map((dependency) => required(dependency, `Asset manifest ${id} dependency`)));
  if (new Set(dependencies).size !== dependencies.length) throw new Error(`Asset manifest ${id} has duplicate dependencies`);
  if (dependencies.includes(id)) throw new Error(`Asset manifest ${id} cannot depend on itself`);
  const budgetBytes = entry.budgetBytes;
  if (budgetBytes !== undefined && (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0)) throw new Error(`Asset manifest ${id} budget must be a non-negative safe integer`);
  return Object.freeze({
    id, typeId, source, dependencies,
    ...(budgetBytes === undefined ? {} : { budgetBytes }),
    ...(entry.tags ? { tags: Object.freeze([...entry.tags].map((tag) => required(tag, `Asset manifest ${id} tag`))) } : {}),
  });
}

function resolveLoadOrder(entries: ReadonlyMap<string, AssetManifestEntry>): string[] {
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Asset manifest dependency cycle: ${[...path, id].join(' -> ')}`);
    visiting.add(id);
    for (const dependency of entries.get(id)?.dependencies ?? []) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  };
  for (const id of entries.keys()) visit(id, []);
  return ordered;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} cannot be empty`);
  return normalized;
}
