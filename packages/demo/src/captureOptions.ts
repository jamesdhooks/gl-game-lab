import type { ExperienceLaunchProfile } from '@hooksjam/gl-game-lab-engine';
import type { ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';

export interface DemoCaptureOptions {
  readonly enabled: boolean;
  readonly frameNumber: number;
  readonly fixedDeltaSeconds: number;
  readonly profile: ExperienceLaunchProfile;
  readonly seed: number;
  readonly modeId: string | undefined;
  readonly styleId: string | undefined;
  readonly scenarioId: string | undefined;
  readonly settings: Readonly<Record<string, ExperienceSettingValue>>;
}

export function parseDemoCaptureOptions(search: string): DemoCaptureOptions {
  const parameters = new URLSearchParams(search);
  return Object.freeze({
    enabled: parameters.get('capture') === '1',
    frameNumber: integerParameter(parameters, 'frame', 120, 1, 10_000),
    fixedDeltaSeconds: numberParameter(parameters, 'delta', 1 / 60, Number.EPSILON, 0.25),
    profile: profileParameter(parameters.get('profile')),
    seed: integerParameter(parameters, 'seed', 0x51f15e, 1, 0xffff_ffff),
    modeId: optionalIdentifier(parameters.get('mode')),
    styleId: optionalIdentifier(parameters.get('style')),
    scenarioId: optionalIdentifier(parameters.get('scenario')),
    settings: settingsParameter(parameters.get('settings')),
  });
}

function settingsParameter(value: string | null): Readonly<Record<string, ExperienceSettingValue>> {
  if (value === null) return Object.freeze({});
  if (value.length > 4_096) throw new Error('Capture settings payload is too large');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('Capture settings must be valid JSON'); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Capture settings must be an object');
  const settings: Record<string, ExperienceSettingValue> = {};
  for (const [key, setting] of Object.entries(parsed)) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(key)) throw new Error(`Invalid capture setting key: ${key}`);
    if (typeof setting !== 'number' && typeof setting !== 'boolean' && typeof setting !== 'string') throw new Error(`Invalid capture setting value: ${key}`);
    if (typeof setting === 'number' && !Number.isFinite(setting)) throw new Error(`Invalid capture setting value: ${key}`);
    settings[key] = setting;
  }
  return Object.freeze(settings);
}

function profileParameter(value: string | null): ExperienceLaunchProfile {
  if (value === null) return 'demo';
  if (value === 'play' || value === 'preview' || value === 'demo') return value;
  throw new Error(`Unsupported capture profile: ${value}`);
}

function integerParameter(parameters: URLSearchParams, key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = parameters.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Capture ${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function numberParameter(parameters: URLSearchParams, key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = parameters.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Capture ${key} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function optionalIdentifier(value: string | null): string | undefined {
  if (value === null) return undefined;
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) throw new Error(`Invalid capture identifier: ${value}`);
  return normalized;
}
