import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sceneDefaultsPath = path.join(workspaceRoot, 'scene-defaults.json');
const sceneDefaultsEndpoint = '/__gl-game-lab-scene-defaults';
const virtualSceneDefaultsId = 'virtual:gl-game-lab-scene-defaults';
const resolvedVirtualSceneDefaultsId = `\0${virtualSceneDefaultsId}`;

function sceneDefaultsPlugin() {
  return {
    name: 'gl-game-lab-scene-defaults',
    resolveId(id: string) {
      return id === virtualSceneDefaultsId ? resolvedVirtualSceneDefaultsId : undefined;
    },
    load(id: string) {
      return id === resolvedVirtualSceneDefaultsId
        ? `export default ${readSceneDefaultsFile()};`
        : undefined;
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
    },
  };
}

function readSceneDefaultsFile(): string {
  return fs.existsSync(sceneDefaultsPath)
    ? fs.readFileSync(sceneDefaultsPath, 'utf8')
    : JSON.stringify({ version: 1, scenes: {} });
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
