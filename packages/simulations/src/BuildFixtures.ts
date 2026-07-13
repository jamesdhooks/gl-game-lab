export interface BuildPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface BuildFixture2D {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly radius: number;
}

export interface PackedBuildFixtures2D {
  readonly count: number;
  readonly segments: Float32Array;
  readonly styles: Float32Array;
}

/**
 * Converts a Build gesture into the shared simulation shape contract:
 * a short gesture is a circle and a drag is one straight capsule.
 */
export function createBuildFixture(
  path: readonly BuildPoint2D[],
  radius: number,
  tapThreshold = radius * 0.7,
): BuildFixture2D | undefined {
  const first = path[0], last = path[path.length - 1];
  if (!first || !last) return undefined;
  const isTap = path.length < 2 || Math.hypot(last.x - first.x, last.y - first.y) < tapThreshold;
  return Object.freeze({
    ax: first.x,
    ay: first.y,
    bx: isTap ? first.x : last.x,
    by: isTap ? first.y : last.y,
    radius,
  });
}

export function sampleBuildFixture(fixture: BuildFixture2D, spacingScale = 1.35): readonly BuildPoint2D[] {
  const dx = fixture.bx - fixture.ax, dy = fixture.by - fixture.ay, length = Math.hypot(dx, dy);
  if (length < 1e-4) return Object.freeze([{ x: fixture.ax, y: fixture.ay }]);
  const steps = Math.max(1, Math.ceil(length / Math.max(1, fixture.radius * spacingScale)));
  return Object.freeze(Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return { x: fixture.ax + dx * t, y: fixture.ay + dy * t };
  }));
}

export function packBuildFixtures(fixtures: readonly BuildFixture2D[], intensity = 0.8): PackedBuildFixtures2D {
  const segments = new Float32Array(fixtures.length * 4), styles = new Float32Array(fixtures.length * 2);
  fixtures.forEach((fixture, index) => {
    segments.set([fixture.ax, fixture.ay, fixture.bx, fixture.by], index * 4);
    styles.set([fixture.radius, intensity], index * 2);
  });
  return { count: fixtures.length, segments, styles };
}

export function packBuildPreview(
  paths: Iterable<readonly BuildPoint2D[]>,
  radius: number,
): PackedBuildFixtures2D {
  const fixtures: BuildFixture2D[] = [];
  for (const path of paths) {
    const fixture = createBuildFixture(path, radius);
    if (fixture) fixtures.push(fixture);
  }
  return packBuildFixtures(fixtures, 1);
}
