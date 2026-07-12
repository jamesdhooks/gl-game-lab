import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import type { FixedFrameCaptureResult } from '@hooksjam/gl-game-lab-react';

export interface MobileCertificationDevice {
  readonly target: 'ios-safari' | 'android-chrome' | 'unsupported';
  readonly userAgent: string;
  readonly platform: string;
  readonly language: string;
  readonly screen: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly devicePixelRatio: number;
  readonly hardwareConcurrency: number;
  readonly maxTouchPoints: number;
}

export interface MobileCertificationEntry {
  readonly id: string;
  readonly name: string;
  readonly status: 'passed' | 'failed' | 'error';
  readonly cpuP95Milliseconds?: number;
  readonly drawCalls?: number;
  readonly uploadBytes?: number;
  readonly gpuBytes?: number;
  readonly checksum?: string;
  readonly failures: readonly string[];
}

export interface MobileCertificationReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly policy: string;
  readonly device: MobileCertificationDevice;
  readonly results: readonly MobileCertificationEntry[];
  readonly violations: readonly string[];
  readonly passed: boolean;
}

export function captureDeviceIdentity(): MobileCertificationDevice {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  return Object.freeze({
    target: detectMobileTarget(userAgent, platform, maxTouchPoints),
    userAgent,
    platform,
    language: navigator.language,
    screen: Object.freeze({ width: window.screen.width, height: window.screen.height }),
    viewport: Object.freeze({ width: window.innerWidth, height: window.innerHeight }),
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    maxTouchPoints,
  });
}

export function summarizeMobileCapture(
  definition: ExperienceDefinition,
  result: FixedFrameCaptureResult,
  cleanupError?: string,
): MobileCertificationEntry {
  const budget = result.budgets.find((candidate) => candidate.tier === 'mobile');
  const failures = [
    ...(budget?.violations ?? ['Mobile budget result is missing']),
    ...(cleanupError ? [`Engine cleanup: ${cleanupError}`] : []),
  ];
  const renderer = result.diagnostics.renderer;
  const passed = budget?.passed === true && failures.length === 0;
  return Object.freeze({
    id: definition.id,
    name: definition.name,
    status: passed ? 'passed' : 'failed',
    cpuP95Milliseconds: result.profile.cpu.p95,
    drawCalls: renderer?.drawCalls ?? 0,
    uploadBytes: (renderer?.bufferUploadBytes ?? 0) + (renderer?.textureUploadBytes ?? 0),
    gpuBytes: renderer?.gpuResourceBytes ?? 0,
    checksum: result.checksum,
    failures: Object.freeze(failures),
  });
}

export function mobileCertificationError(
  definition: ExperienceDefinition,
  error: unknown,
): MobileCertificationEntry {
  return Object.freeze({
    id: definition.id,
    name: definition.name,
    status: 'error',
    failures: Object.freeze([error instanceof Error ? error.message : String(error)]),
  });
}

export function createMobileCertificationReport(
  generatedAt: string,
  device: MobileCertificationDevice,
  results: readonly MobileCertificationEntry[],
): MobileCertificationReport {
  const violations = [
    ...(device.target === 'unsupported' ? ['Certification must run on physical iOS/iPadOS Safari or Android Chrome'] : []),
    ...(results.length === 15 ? [] : [`Expected 15 experience results; received ${results.length}`]),
    ...results.filter((result) => result.status !== 'passed').map((result) => `${result.name}: ${result.status}`),
  ];
  return Object.freeze({
    schemaVersion: 1,
    generatedAt,
    policy: '120 deterministic frames at 30 FPS recommended demo profile; mobile CPU/draw/upload/GPU-memory budgets enforced',
    device,
    results: Object.freeze([...results]),
    violations: Object.freeze(violations),
    passed: violations.length === 0,
  });
}

export function detectMobileTarget(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): MobileCertificationDevice['target'] {
  const androidChrome = /Android/i.test(userAgent)
    && /Chrome\//i.test(userAgent)
    && !/(EdgA|OPR|SamsungBrowser|; wv\))/i.test(userAgent);
  if (androidChrome && maxTouchPoints > 0) return 'android-chrome';
  const iosDevice = /(iPhone|iPad|iPod)/i.test(userAgent)
    || (/Mac/i.test(platform) && /Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  const iosSafari = /Version\//i.test(userAgent)
    && /Safari\//i.test(userAgent)
    && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent);
  if (iosDevice && iosSafari && maxTouchPoints > 0) return 'ios-safari';
  return 'unsupported';
}
