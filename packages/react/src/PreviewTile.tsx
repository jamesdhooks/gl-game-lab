import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExperiencePreviewCycleControllerService,
  withEngineTimeScaleSetting,
  type ExperienceDefinition,
  type ExperiencePreviewProfile,
} from '@hooksjam/gl-game-lab-engine';
import { GameCanvas } from './GameCanvas.js';
import { resolvePreviewCycleLaunch, usePreviewCycle } from './PreviewCycle.js';

export {
  PREVIEW_CYCLE_MIN_MS,
  PREVIEW_CYCLE_VARIABILITY_MS,
  PREVIEW_RESTART_BASE_MS,
  PREVIEW_RESTART_JITTER_MS,
  previewCycleDelay,
  previewCycleSeed,
  previewRestartDelay,
} from './PreviewCycle.js';

const PREVIEW_VIEWPORT = Object.freeze({ width: 384, height: 384 });
const PREVIEW_MAX_PIXELS = 90_000;
const DEFAULT_PREVIEW_MAX_FPS = 30;
const PREVIEW_WARMUP_MS = 1_000;
const PREVIEW_MEASURE_MS = 2_000;
const PREVIEW_MIN_FPS = 20;
const PREVIEW_INIT_TIMEOUT_MS = 4_000;
const PREVIEW_STABILIZE_MS = 750;
export const PREVIEW_CONTEXT_LIMIT = 16;
let cachedWebGl2Support: boolean | undefined;

export interface PreviewTileProps {
  readonly definition: ExperienceDefinition;
  readonly profile: ExperiencePreviewProfile;
  readonly sessionSeed: number;
  readonly index?: number;
  readonly enabled?: boolean;
  readonly eager?: boolean;
  readonly maxFps?: number;
  readonly renderPolicyOverride?: ExperiencePreviewProfile['renderPolicy'];
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
  eager = false,
  maxFps = DEFAULT_PREVIEW_MAX_FPS,
  renderPolicyOverride,
  showDiagnostics = false,
  assetBaseUrl = '/',
  className = 'h-full w-full',
}: PreviewTileProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<object>({});
  const [visible, setVisible] = useState(eager);
  const [granted, setGranted] = useState(false);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restartGeneration, setRestartGeneration] = useState(0);
  const previewCycleControllerRef = useRef<import('@hooksjam/gl-game-lab-engine').ExperiencePreviewCycleController>();
  const measurementRef = useRef<{ startedAt: number; frames: number }>();
  const runtimeDefinition = useMemo(() => withEngineTimeScaleSetting(definition), [definition]);
  const resolved = useMemo(() => resolvePreviewCycleLaunch(runtimeDefinition, profile, sessionSeed, 0), [profile, runtimeDefinition, sessionSeed]);
  const runtimeResolved = useMemo(
    () => resolvePreviewCycleLaunch(runtimeDefinition, profile, sessionSeed, restartGeneration),
    [profile, restartGeneration, runtimeDefinition, sessionSeed],
  );
  const createPlugins = useCallback(() => runtimeDefinition.createPlugins({
    profile: 'preview',
    ...(runtimeResolved.modeId ? { modeId: runtimeResolved.modeId } : {}),
    ...(runtimeResolved.styleId ? { styleId: runtimeResolved.styleId } : {}),
    settings: runtimeResolved.settings,
    seed: runtimeResolved.seed,
  }), [runtimeDefinition, runtimeResolved]);
  const imageUrl = useMemo(() => profile.image ? resolvePreviewImageUrl(assetBaseUrl, profile.image.src, profile.image.revision) : undefined, [assetBaseUrl, profile.image]);
  const policy = renderPolicyOverride ?? profile.renderPolicy;
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
    if (eager) {
      setVisible(true);
      return;
    }
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => { setVisible(entry?.isIntersecting ?? false); }, { rootMargin: '180px', threshold: 0.01 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    setFailed(false);
    setReady(false);
    setRevealed(false);
    setGranted(false);
    setRestartGeneration(0);
    previewCycleControllerRef.current = undefined;
    measurementRef.current = undefined;
  }, [definition.id, resolved.hash, policy]);

  useEffect(() => {
    if (!shouldAttemptLive) {
      previewScheduler.release(tokenRef.current);
      setGranted(false);
      setReady(false);
      setRevealed(false);
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

  useEffect(() => {
    if (!ready) {
      setRevealed(false);
      return;
    }
    const timeout = window.setTimeout(() => { setRevealed(true); }, PREVIEW_STABILIZE_MS);
    return () => window.clearTimeout(timeout);
  }, [ready]);

  usePreviewCycle({
    enabled: granted && !failed && ready,
    experienceId: definition.id,
    seed: resolved.seed,
    revision: resolved.hash,
    onCycle: (request) => {
      if (previewCycleControllerRef.current?.advancePreviewCycle(request) === 'handled') {
        measurementRef.current = undefined;
        return;
      }
      measurementRef.current = undefined;
      setReady(false);
      setRevealed(false);
      setRestartGeneration((generation) => generation + 1);
    },
  });

  const failPreview = useCallback(() => {
    if (policy === 'auto') recordPreviewFailure(definition.id);
    previewScheduler.release(tokenRef.current);
    setFailed(true);
    setGranted(false);
    setReady(false);
    setRevealed(false);
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
    <div ref={rootRef} className={`relative aspect-square overflow-hidden ${className}`} data-preview-policy={policy} data-preview-state={revealed ? 'live' : imageUrl ? 'image' : 'placeholder'}>
      <div className={`absolute inset-0 transition-opacity duration-700 ease-out ${revealed ? 'opacity-0' : 'opacity-100'}`}>
        <PreviewFallback definition={definition} {...(imageUrl ? { imageUrl } : {})} />
      </div>
      {granted && !failed ? (
        <div className={`absolute inset-0 transition-opacity duration-700 ease-out ${revealed ? 'opacity-100' : 'opacity-0'}`}>
          <GameCanvas
            key={`${definition.id}:${runtimeResolved.hash}:${restartGeneration}`}
            createPlugins={createPlugins}
            ariaLabel={`${definition.name} preview`}
            className="h-full w-full touch-none"
            logicalViewport={PREVIEW_VIEWPORT}
            maxPixels={PREVIEW_MAX_PIXELS}
            maxFps={maxFps}
            timeScale={previewTimeScale(runtimeResolved.settings)}
            inputEnabled={false}
            showDiagnostics={showDiagnostics}
            onFrame={handleFrame}
            onReady={(engine) => {
              previewCycleControllerRef.current = engine.kernel.tryGet(ExperiencePreviewCycleControllerService);
              setReady(true);
              measurementRef.current = undefined;
            }}
            onError={failPreview}
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,.28)]" />
    </div>
  );
}

function previewTimeScale(settings: Readonly<Record<string, number | boolean | string>>): number {
  const value = settings.timeScale;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1;
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
  return PREVIEW_CONTEXT_LIMIT;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function supportsWebGl2(): boolean {
  if (cachedWebGl2Support !== undefined) return cachedWebGl2Support;
  cachedWebGl2Support = typeof document !== 'undefined' && detectWebGl2(() => document.createElement('canvas'));
  return cachedWebGl2Support;
}

export function detectWebGl2(createCanvas: () => HTMLCanvasElement): boolean {
  try {
    const context = createCanvas().getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
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

export function resolvePreviewImageUrl(baseUrl: string, src: string, revision: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${src.replace(/^\//, '')}?v=${encodeURIComponent(revision)}`;
}
