import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolvePreviewLaunch,
  type ExperienceDefinition,
  type ExperiencePreviewProfile,
} from '@hooksjam/gl-game-lab-engine';
import { GameCanvas } from './GameCanvas.js';

const PREVIEW_VIEWPORT = Object.freeze({ width: 384, height: 384 });
const PREVIEW_MAX_PIXELS = 90_000;
const PREVIEW_MAX_FPS = 30;
const PREVIEW_WARMUP_MS = 1_000;
const PREVIEW_MEASURE_MS = 2_000;
const PREVIEW_MIN_FPS = 20;
const PREVIEW_INIT_TIMEOUT_MS = 4_000;

export interface PreviewTileProps {
  readonly definition: ExperienceDefinition;
  readonly profile: ExperiencePreviewProfile;
  readonly sessionSeed: number;
  readonly index?: number;
  readonly enabled?: boolean;
  readonly showDiagnostics?: boolean;
  readonly assetBaseUrl?: string;
  readonly className?: string;
}

export interface PreviewScheduleEntry {
  readonly token: object;
  readonly priority: () => number;
  readonly grant: () => void;
}

export class PreviewScheduler {
  private readonly active = new Set<object>();
  private readonly waiting = new Map<object, PreviewScheduleEntry>();

  constructor(private readonly maximumContexts: () => number = previewContextLimit) {}

  request(entry: PreviewScheduleEntry): () => void {
    this.waiting.set(entry.token, entry);
    this.pump();
    return () => this.release(entry.token);
  }

  release(token: object): void {
    this.waiting.delete(token);
    if (this.active.delete(token)) this.pump();
  }

  private pump(): void {
    const maximum = Math.max(1, Math.floor(this.maximumContexts()));
    while (this.active.size < maximum && this.waiting.size > 0) {
      const next = [...this.waiting.values()].sort((left, right) => left.priority() - right.priority())[0];
      if (!next) return;
      this.waiting.delete(next.token);
      this.active.add(next.token);
      next.grant();
    }
  }
}

const previewScheduler = new PreviewScheduler();

export interface PreviewLiveDecision {
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly policy: ExperiencePreviewProfile['renderPolicy'];
  readonly reducedMotion: boolean;
  readonly webGl2Available: boolean;
  readonly sessionFailed: boolean;
  readonly runtimeFailed: boolean;
}

export function shouldAttemptLivePreview(input: PreviewLiveDecision): boolean {
  if (!input.enabled || !input.visible || input.policy === 'static' || input.runtimeFailed) return false;
  return input.policy === 'live' || (!input.reducedMotion && input.webGl2Available && !input.sessionFailed);
}

export function PreviewTile({
  definition,
  profile,
  sessionSeed,
  index = 0,
  enabled = true,
  showDiagnostics = false,
  assetBaseUrl = '/',
  className = 'h-full w-full',
}: PreviewTileProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<object>({});
  const [visible, setVisible] = useState(false);
  const [granted, setGranted] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const measurementRef = useRef<{ startedAt: number; frames: number }>();
  const resolved = useMemo(() => resolvePreviewLaunch(definition, profile, sessionSeed), [definition, profile, sessionSeed]);
  const createPlugins = useCallback(() => definition.createPlugins({
    profile: 'preview',
    ...(resolved.modeId ? { modeId: resolved.modeId } : {}),
    ...(resolved.styleId ? { styleId: resolved.styleId } : {}),
    settings: resolved.settings,
    seed: resolved.seed,
  }), [definition, resolved]);
  const imageUrl = useMemo(() => profile.image ? joinAssetUrl(assetBaseUrl, profile.image.src, profile.image.revision) : undefined, [assetBaseUrl, profile.image]);
  const policy = profile.renderPolicy;
  const reducedMotion = prefersReducedMotion();
  const shouldAttemptLive = shouldAttemptLivePreview({
    enabled,
    visible,
    policy,
    reducedMotion,
    webGl2Available: supportsWebGl2(),
    sessionFailed: hasPreviewFailure(definition.id),
    runtimeFailed: failed,
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => { setVisible(entry?.isIntersecting ?? false); }, { rootMargin: '180px', threshold: 0.01 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setFailed(false);
    setReady(false);
    setGranted(false);
    measurementRef.current = undefined;
  }, [definition.id, resolved.hash, policy]);

  useEffect(() => {
    if (!shouldAttemptLive) {
      previewScheduler.release(tokenRef.current);
      setGranted(false);
      setReady(false);
      return;
    }
    const delay = window.setTimeout(() => {
      previewScheduler.request({
        token: tokenRef.current,
        priority: () => distanceFromViewport(rootRef.current),
        grant: () => setGranted(true),
      });
    }, index * 120);
    return () => {
      window.clearTimeout(delay);
      previewScheduler.release(tokenRef.current);
      setGranted(false);
    };
  }, [index, shouldAttemptLive]);

  useEffect(() => {
    if (!granted || ready) return;
    const timeout = window.setTimeout(() => failPreview(), PREVIEW_INIT_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [granted, ready]);

  const failPreview = useCallback(() => {
    if (policy === 'auto') recordPreviewFailure(definition.id);
    previewScheduler.release(tokenRef.current);
    setFailed(true);
    setGranted(false);
    setReady(false);
  }, [definition.id, policy]);

  const handleFrame = useCallback((timestamp: number) => {
    if (policy !== 'auto') return;
    const measurement = measurementRef.current;
    if (!measurement) {
      measurementRef.current = { startedAt: timestamp, frames: 0 };
      return;
    }
    const elapsed = timestamp - measurement.startedAt;
    if (elapsed < PREVIEW_WARMUP_MS) return;
    measurement.frames += 1;
    if (elapsed < PREVIEW_WARMUP_MS + PREVIEW_MEASURE_MS) return;
    const fps = measurement.frames / ((elapsed - PREVIEW_WARMUP_MS) / 1_000);
    measurementRef.current = undefined;
    if (fps < PREVIEW_MIN_FPS) failPreview();
  }, [failPreview, policy]);

  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`} data-preview-policy={policy} data-preview-state={ready ? 'live' : imageUrl ? 'image' : 'placeholder'}>
      <PreviewFallback definition={definition} {...(imageUrl ? { imageUrl } : {})} />
      {granted && !failed ? (
        <div className={`absolute inset-0 transition-opacity duration-200 ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <GameCanvas
            createPlugins={createPlugins}
            ariaLabel={`${definition.name} preview`}
            className="h-full w-full touch-none"
            logicalViewport={PREVIEW_VIEWPORT}
            maxPixels={PREVIEW_MAX_PIXELS}
            maxFps={PREVIEW_MAX_FPS}
            showDiagnostics={showDiagnostics}
            onFrame={handleFrame}
            onReady={() => { setReady(true); measurementRef.current = undefined; }}
            onError={failPreview}
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,.28)]" />
    </div>
  );
}

function PreviewFallback({ definition, imageUrl }: { readonly definition: ExperienceDefinition; readonly imageUrl?: string }): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [imageUrl]);
  if (imageUrl && !imageFailed) return <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} onError={() => { setImageFailed(true); }} />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-6xl text-white">
      {definition.icon}
    </div>
  );
}

function distanceFromViewport(element: HTMLElement | null): number {
  if (!element || typeof window === 'undefined') return Number.MAX_SAFE_INTEGER;
  const bounds = element.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2 - window.innerWidth / 2;
  const y = bounds.top + bounds.height / 2 - window.innerHeight / 2;
  return Math.hypot(x, y);
}

function previewContextLimit(): number {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 2 : 4;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function supportsWebGl2(): boolean {
  return typeof window !== 'undefined' && 'WebGL2RenderingContext' in window;
}

function previewFailureKey(id: string): string {
  return `gl-game-lab:preview-failure:${id}`;
}

function hasPreviewFailure(id: string): boolean {
  try { return sessionStorage.getItem(previewFailureKey(id)) === '1'; } catch { return false; }
}

function recordPreviewFailure(id: string): void {
  try { sessionStorage.setItem(previewFailureKey(id), '1'); } catch { /* Storage may be unavailable. */ }
}

function joinAssetUrl(baseUrl: string, src: string, revision: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${src.replace(/^\//, '')}?v=${encodeURIComponent(revision)}`;
}
