import { describe, expect, it } from 'vitest';
import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import type { FixedFrameCaptureResult } from '@hooksjam/gl-game-lab-react';
import { createMobileCertificationReport, detectMobileTarget, summarizeMobileCapture, type MobileCertificationDevice } from './mobileCertification.js';

const definition = { id: 'ball-pit', name: 'Ball Pit' } as ExperienceDefinition;
const device: MobileCertificationDevice = {
  target: 'android-chrome',
  userAgent: 'mobile', platform: 'test', language: 'en',
  screen: { width: 390, height: 844 }, viewport: { width: 390, height: 844 },
  devicePixelRatio: 3, hardwareConcurrency: 8, maxTouchPoints: 5,
};

describe('mobile certification evidence', () => {
  it('summarizes the engine mobile budget and requires all 15 passing entries', () => {
    const capture = {
      profile: { cpu: { p95: 12 } },
      diagnostics: { renderer: { drawCalls: 3, bufferUploadBytes: 10, textureUploadBytes: 20, gpuResourceBytes: 40 } },
      checksum: 'abc', budgets: [{ tier: 'mobile', samples: 120, p95FrameMs: 12, passed: true, violations: [] }],
    } as unknown as FixedFrameCaptureResult;
    const entry = summarizeMobileCapture(definition, capture);

    expect(entry).toMatchObject({ status: 'passed', cpuP95Milliseconds: 12, drawCalls: 3, uploadBytes: 30, gpuBytes: 40 });
    expect(createMobileCertificationReport('2026-07-11T00:00:00.000Z', device, Array.from({ length: 15 }, () => entry)).passed).toBe(true);
    expect(createMobileCertificationReport('2026-07-11T00:00:00.000Z', device, [entry]).passed).toBe(false);
  });

  it('rejects desktop evidence and recognizes iPadOS and Android touch devices', () => {
    expect(detectMobileTarget('Desktop Chrome', 'Win32', 0)).toBe('unsupported');
    expect(detectMobileTarget('Mozilla/5.0 (Linux; Android 16) Chrome/150.0 Mobile Safari/537.36', 'Linux armv8l', 5)).toBe('android-chrome');
    expect(detectMobileTarget('Mozilla/5.0 (Macintosh) Version/18.0 Mobile/15E148 Safari/604.1', 'MacIntel', 5)).toBe('ios-safari');
    expect(detectMobileTarget('Mozilla/5.0 (iPhone) CriOS/150.0 Mobile Safari/604.1', 'iPhone', 5)).toBe('unsupported');
    const unsupported = { ...device, target: 'unsupported' as const };
    expect(createMobileCertificationReport('2026-07-11T00:00:00.000Z', unsupported, []).violations).toContain('Certification must run on physical iOS/iPadOS Safari or Android Chrome');
  });
});
