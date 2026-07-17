import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sceneDefaultsPath = path.join(workspaceRoot, 'scene-defaults.json');
const sceneDefaultsEndpoint = '/__gl-game-lab-scene-defaults';
const virtualSceneDefaultsId = 'virtual:gl-game-lab-scene-defaults';
const resolvedVirtualSceneDefaultsId = `\0${virtualSceneDefaultsId}`;
const previewProfilesPath = path.join(workspaceRoot, 'preview-profiles.json');
const previewCaptureDirectory = path.join(workspaceRoot, 'packages/demo/public/previews');
const previewProfilesEndpoint = '/__gl-game-lab-preview-profiles';
const previewCaptureEndpoint = '/__gl-game-lab-preview-capture';
const virtualPreviewProfilesId = 'virtual:gl-game-lab-preview-profiles';
const resolvedVirtualPreviewProfilesId = `\0${virtualPreviewProfilesId}`;
const particleBenchmarkEndpoint = '/__gl-game-lab-particle-benchmark';
const particleBenchmarkDirectory = path.join(workspaceRoot, 'docs/benchmarks/particle');

function sceneDefaultsPlugin() {
  return {
    name: 'gl-game-lab-scene-defaults',
    resolveId(id: string) {
      if (id === virtualSceneDefaultsId) return resolvedVirtualSceneDefaultsId;
      if (id === virtualPreviewProfilesId) return resolvedVirtualPreviewProfilesId;
      return undefined;
    },
    load(id: string) {
      if (id === resolvedVirtualSceneDefaultsId) return `export default ${readSceneDefaultsFile()};`;
      if (id === resolvedVirtualPreviewProfilesId) return `export default ${readPreviewProfilesFile()};`;
      return undefined;
    },
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(sceneDefaultsEndpoint, (request, response) => {
        if (request.method === 'GET') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(readSceneDefaultsFile());
          return;
        }
        if (request.method !== 'PUT') {
          response.writeHead(405).end('Method Not Allowed');
          return;
        }
        let raw = '';
        request.on('data', (chunk: Buffer | string) => { raw += chunk.toString(); });
        request.on('end', () => {
          const payload = parseRecord(raw);
          const definitionId = typeof payload.definitionId === 'string' ? payload.definitionId : '';
          const defaults = primitiveRecord(payload.defaults);
          if (!definitionId || !defaults) {
            response.writeHead(400).end('Invalid scene defaults payload');
            return;
          }
          const current = parseDefaultsFile();
          const scenes = {
            ...current.scenes,
            [definitionId]: payload.section === null
              ? defaults
              : { ...current.scenes[definitionId], ...defaults },
          };
          const next = `${JSON.stringify({ version: 1, scenes }, null, 2)}\n`;
          fs.writeFileSync(sceneDefaultsPath, next, 'utf8');
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(next);
        });
      });
      server.middlewares.use(previewProfilesEndpoint, (request, response) => {
        if (request.method === 'GET') return jsonResponse(response, readPreviewProfilesFile());
        if (request.method !== 'PUT') return response.writeHead(405).end('Method Not Allowed');
        readRequestBody(request, 1_000_000, (raw) => {
          const payload = parseRecord(raw);
          const definitionId = validExperienceId(payload.definitionId);
          const profile = normalizePreviewProfile(payload.profile);
          if (!definitionId || !profile) return response.writeHead(400).end('Invalid preview profile payload');
          const current = parsePreviewProfilesFile();
          const next = writePreviewProfiles({ ...current, [definitionId]: { ...profile, image: current[definitionId]?.image } });
          jsonResponse(response, next);
        }, response);
      });
      server.middlewares.use(previewCaptureEndpoint, (request, response) => {
        if (request.method !== 'PUT') return response.writeHead(405).end('Method Not Allowed');
        readRequestBody(request, 3_000_000, (raw) => {
          const payload = parseRecord(raw);
          const definitionId = validExperienceId(payload.definitionId);
          const profile = normalizePreviewProfile(payload.profile);
          const profileHash = typeof payload.profileHash === 'string' && /^[a-f0-9]{8}$/.test(payload.profileHash) ? payload.profileHash : undefined;
          if (!definitionId || !profile || !profileHash || typeof payload.imageBase64 !== 'string') return response.writeHead(400).end('Invalid preview capture payload');
          const image = Buffer.from(payload.imageBase64, 'base64');
          if (image.byteLength === 0 || image.byteLength > 2_000_000 || image.toString('ascii', 0, 4) !== 'RIFF' || image.toString('ascii', 8, 12) !== 'WEBP') return response.writeHead(400).end('Preview capture must be a WebP image under 2 MB');
          fs.mkdirSync(previewCaptureDirectory, { recursive: true });
          const imagePath = path.join(previewCaptureDirectory, `${definitionId}.webp`);
          atomicWrite(imagePath, image);
          const revision = createHash('sha256').update(image).digest('hex').slice(0, 16);
          const current = parsePreviewProfilesFile();
          const next = writePreviewProfiles({
            ...current,
            [definitionId]: {
              ...profile,
              image: { src: `previews/${definitionId}.webp`, revision, width: 512, height: 512, profileHash },
            },
          });
          jsonResponse(response, next);
        }, response);
      });
      server.middlewares.use(particleBenchmarkEndpoint, (request, response) => {
        if (request.method !== 'PUT') return response.writeHead(405).end('Method Not Allowed');
        readRequestBody(request, 1_000_000, (raw) => {
          const report = normalizeParticleBenchmarkReport(parseRecord(raw));
          if (!report) return response.writeHead(400).end('Invalid particle benchmark report');
          fs.mkdirSync(particleBenchmarkDirectory, { recursive: true });
          const date = new Date().toISOString().slice(0, 10), configuration = report.configuration as Record<string, unknown>;
          const filename = `${date}-${configuration.effectId}-${Math.round(Number(configuration.capacity) / 1024)}k-${configuration.tier}.json`;
          atomicWrite(path.join(particleBenchmarkDirectory, filename), `${JSON.stringify(report, null, 2)}\n`);
          jsonResponse(response, JSON.stringify({ filename: `docs/benchmarks/particle/${filename}` }));
        }, response);
      });
    },
  };
}

function readSceneDefaultsFile(): string {
  return fs.existsSync(sceneDefaultsPath)
    ? fs.readFileSync(sceneDefaultsPath, 'utf8')
    : JSON.stringify({ version: 1, scenes: {} });
}

function readPreviewProfilesFile(): string {
  return fs.existsSync(previewProfilesPath)
    ? fs.readFileSync(previewProfilesPath, 'utf8')
    : JSON.stringify({ version: 1, previews: {} });
}

function parsePreviewProfilesFile(): Record<string, Record<string, unknown>> {
  const parsed = parseRecord(readPreviewProfilesFile());
  if (typeof parsed.previews !== 'object' || parsed.previews === null || Array.isArray(parsed.previews)) return {};
  const previews: Record<string, Record<string, unknown>> = {};
  for (const [id, value] of Object.entries(parsed.previews)) if (validExperienceId(id) && typeof value === 'object' && value !== null && !Array.isArray(value)) previews[id] = value as Record<string, unknown>;
  return previews;
}

function writePreviewProfiles(previews: Record<string, Record<string, unknown>>): string {
  const next = `${JSON.stringify({ version: 1, previews }, null, 2)}\n`;
  atomicWrite(previewProfilesPath, next);
  return next;
}

function normalizePreviewProfile(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const profile = value as Record<string, unknown>;
  const settings = primitiveRecord(profile.settings);
  const variation = typeof profile.variation === 'object' && profile.variation !== null && !Array.isArray(profile.variation) ? profile.variation as Record<string, unknown> : undefined;
  if (!settings || !variation) return undefined;
  const intensity = typeof variation.intensity === 'number' && Number.isFinite(variation.intensity) ? Math.max(0, Math.min(1, variation.intensity)) : undefined;
  const seed = typeof variation.seed === 'number' && Number.isSafeInteger(variation.seed) ? variation.seed >>> 0 : undefined;
  const lockedKeys = Array.isArray(variation.lockedKeys) ? [...new Set(variation.lockedKeys.filter((key): key is string => typeof key === 'string' && /^\$?[a-zA-Z0-9_-]+$/.test(key)))].sort() : undefined;
  if (intensity === undefined || seed === undefined || !lockedKeys) return undefined;
  const renderPolicy = profile.renderPolicy === 'live' || profile.renderPolicy === 'static' ? profile.renderPolicy : 'auto';
  return {
    ...(typeof profile.modeId === 'string' ? { modeId: profile.modeId } : {}),
    ...(typeof profile.styleId === 'string' ? { styleId: profile.styleId } : {}),
    settings,
    variation: { intensity, lockedKeys, seed },
    generationMode: profile.generationMode === 'exact' ? 'exact' : 'varied',
    renderPolicy,
  };
}

function validExperienceId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : undefined;
}

function normalizeParticleBenchmarkReport(value: Record<string, unknown>): Record<string, unknown> | undefined {
  if (value.schemaVersion !== 1 || !isFiniteRecord(value.configuration, ['capacity', 'renderScale', 'warmupMs', 'sampleMs']) || !isFiniteRecord(value.fps, ['average', 'p05']) || !isFiniteRecord(value.frameCpuMs, ['average', 'p95'])) return undefined;
  const configuration = value.configuration as Record<string, unknown>, effectId = validExperienceId(configuration.effectId), tier = configuration.tier;
  if (!effectId || (tier !== 'basic' && tier !== 'enhanced' && tier !== 'ultra') || !Number.isInteger(configuration.capacity) || Number(configuration.capacity) <= 0 || typeof value.samples !== 'number' || !Number.isInteger(value.samples) || value.samples <= 0) return undefined;
  if (typeof value.particle !== 'object' || value.particle === null || Array.isArray(value.particle)) return undefined;
  const gpuMs = parseRecord(value.gpuMs);
  if (typeof gpuMs.available !== 'boolean' || (gpuMs.available && !isFiniteRecord(gpuMs, ['average', 'p95']))) return undefined;
  return value;
}

function isFiniteRecord(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]));
}

function atomicWrite(target: string, content: string | Buffer): void {
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function jsonResponse(response: import('node:http').ServerResponse, body: string): void {
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(body);
}

function readRequestBody(
  request: import('node:http').IncomingMessage,
  maximumBytes: number,
  complete: (body: string) => void,
  response: import('node:http').ServerResponse,
): void {
  let raw = '';
  let rejected = false;
  request.on('data', (chunk: Buffer | string) => {
    if (rejected) return;
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > maximumBytes) {
      rejected = true;
      response.writeHead(413).end('Payload Too Large');
      request.destroy();
    }
  });
  request.on('end', () => { if (!rejected) complete(raw); });
}

function parseDefaultsFile(): { readonly scenes: Record<string, Record<string, string | number | boolean>> } {
  const parsed = parseRecord(readSceneDefaultsFile());
  const scenes: Record<string, Record<string, string | number | boolean>> = {};
  if (typeof parsed.scenes === 'object' && parsed.scenes !== null && !Array.isArray(parsed.scenes)) {
    for (const [id, value] of Object.entries(parsed.scenes)) {
      const record = primitiveRecord(value);
      if (record) scenes[id] = record;
    }
  }
  return { scenes };
}

function parseRecord(raw: string): Record<string, unknown>;
function parseRecord(raw: unknown): Record<string, unknown>;
function parseRecord(raw: unknown): Record<string, unknown> {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function primitiveRecord(value: unknown): Record<string, string | number | boolean> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, setting] of Object.entries(value)) {
    if (typeof setting === 'string' || typeof setting === 'number' || typeof setting === 'boolean') result[key] = setting;
  }
  return result;
}

export default defineConfig({
  base: process.env.GL_GAME_LAB_BASE_PATH ?? '/',
  plugins: [react(), sceneDefaultsPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/[/\\]node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
});
