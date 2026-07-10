import type { CapturedFrame } from './Capture.js';

export interface VisualComparison {
  readonly ssim: number;
  readonly meanAbsoluteError: number;
  readonly passed: boolean;
}

export interface SequenceVisualComparison {
  readonly minimumSsim: number;
  readonly meanSsim: number;
  readonly passed: boolean;
  readonly frames: readonly VisualComparison[];
}

export interface ScaledVisualComparison extends VisualComparison {
  readonly spatialSimilarity: number;
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
}

export interface DownsampledRgba {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export function compareRgba(
  reference: Uint8Array,
  candidate: Uint8Array,
  width: number,
  height: number,
  threshold = 0.97,
): VisualComparison {
  validateImages(reference, candidate, width, height);
  validateThreshold(threshold);
  const windowSize = 8;
  const comparisons: number[] = [];
  let absoluteError = 0;
  for (let offset = 0; offset < reference.length; offset += 4) {
    absoluteError += Math.abs(luminance(reference, offset) - luminance(candidate, offset));
  }
  for (let y = 0; y < height; y += windowSize) {
    for (let x = 0; x < width; x += windowSize) {
      comparisons.push(compareWindow(reference, candidate, width, height, x, y, windowSize));
    }
  }
  const ssim = comparisons.reduce((sum, value) => sum + value, 0) / comparisons.length;
  return Object.freeze({
    ssim,
    meanAbsoluteError: absoluteError / (width * height * 255),
    passed: ssim >= threshold,
  });
}

export function compareCaptureSequences(
  reference: readonly CapturedFrame[],
  candidate: readonly CapturedFrame[],
  threshold = 0.97,
): SequenceVisualComparison {
  validateThreshold(threshold);
  if (reference.length === 0 || reference.length !== candidate.length) {
    throw new Error('Capture sequences must be non-empty and have equal frame counts');
  }
  const frames = reference.map((expected, index) => {
    const actual = candidate[index];
    if (!actual || expected.frameNumber !== actual.frameNumber) throw new Error('Capture sequence frame numbers do not align');
    if (expected.width !== actual.width || expected.height !== actual.height) throw new Error('Capture sequence dimensions do not align');
    return compareRgba(expected.rgba, actual.rgba, expected.width, expected.height, threshold);
  });
  const values = frames.map((frame) => frame.ssim);
  const minimumSsim = Math.min(...values);
  const meanSsim = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Object.freeze({ minimumSsim, meanSsim, passed: frames.every((frame) => frame.passed), frames: Object.freeze(frames) });
}

export function compareRgbaAtScale(
  reference: Uint8Array,
  candidate: Uint8Array,
  width: number,
  height: number,
  cellSize: number,
  threshold = 0.9,
): ScaledVisualComparison {
  validateImages(reference, candidate, width, height);
  validateThreshold(threshold);
  const expected = downsampleRgba(reference, width, height, cellSize);
  const actual = downsampleRgba(candidate, width, height, cellSize);
  const comparison = compareRgba(expected.data, actual.data, expected.width, expected.height, 0);
  const spatialSimilarity = 1 - comparison.meanAbsoluteError;
  return Object.freeze({
    ...comparison,
    spatialSimilarity,
    passed: spatialSimilarity >= threshold,
    cellSize,
    width: expected.width,
    height: expected.height,
  });
}

export function downsampleRgba(pixels: Uint8Array, width: number, height: number, cellSize: number): DownsampledRgba {
  validateImages(pixels, pixels, width, height);
  if (!Number.isSafeInteger(cellSize) || cellSize < 1 || cellSize > Math.max(width, height)) {
    throw new Error('Visual cell size must be a positive integer within the image bounds');
  }
  const outputWidth = Math.ceil(width / cellSize);
  const outputHeight = Math.ceil(height / cellSize);
  const data = new Uint8Array(outputWidth * outputHeight * 4);
  for (let outputY = 0; outputY < outputHeight; outputY += 1) {
    for (let outputX = 0; outputX < outputWidth; outputX += 1) {
      const totals = [0, 0, 0, 0];
      let count = 0;
      const endY = Math.min(height, (outputY + 1) * cellSize);
      const endX = Math.min(width, (outputX + 1) * cellSize);
      for (let y = outputY * cellSize; y < endY; y += 1) {
        for (let x = outputX * cellSize; x < endX; x += 1) {
          const offset = (y * width + x) * 4;
          totals[0] = (totals[0] ?? 0) + (pixels[offset] ?? 0);
          totals[1] = (totals[1] ?? 0) + (pixels[offset + 1] ?? 0);
          totals[2] = (totals[2] ?? 0) + (pixels[offset + 2] ?? 0);
          totals[3] = (totals[3] ?? 0) + (pixels[offset + 3] ?? 0);
          count += 1;
        }
      }
      const outputOffset = (outputY * outputWidth + outputX) * 4;
      data[outputOffset] = Math.round((totals[0] ?? 0) / count);
      data[outputOffset + 1] = Math.round((totals[1] ?? 0) / count);
      data[outputOffset + 2] = Math.round((totals[2] ?? 0) / count);
      data[outputOffset + 3] = Math.round((totals[3] ?? 0) / count);
    }
  }
  return Object.freeze({ data, width: outputWidth, height: outputHeight });
}

function compareWindow(
  reference: Uint8Array,
  candidate: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  size: number,
): number {
  let count = 0;
  let referenceMean = 0;
  let candidateMean = 0;
  for (let y = startY; y < Math.min(height, startY + size); y += 1) {
    for (let x = startX; x < Math.min(width, startX + size); x += 1) {
      const offset = (y * width + x) * 4;
      referenceMean += luminance(reference, offset);
      candidateMean += luminance(candidate, offset);
      count += 1;
    }
  }
  referenceMean /= count;
  candidateMean /= count;
  let referenceVariance = 0;
  let candidateVariance = 0;
  let covariance = 0;
  for (let y = startY; y < Math.min(height, startY + size); y += 1) {
    for (let x = startX; x < Math.min(width, startX + size); x += 1) {
      const offset = (y * width + x) * 4;
      const expected = luminance(reference, offset) - referenceMean;
      const actual = luminance(candidate, offset) - candidateMean;
      referenceVariance += expected * expected;
      candidateVariance += actual * actual;
      covariance += expected * actual;
    }
  }
  const denominator = Math.max(1, count - 1);
  referenceVariance /= denominator;
  candidateVariance /= denominator;
  covariance /= denominator;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  return ((2 * referenceMean * candidateMean + c1) * (2 * covariance + c2))
    / ((referenceMean ** 2 + candidateMean ** 2 + c1) * (referenceVariance + candidateVariance + c2));
}

function luminance(pixels: Uint8Array, offset: number): number {
  return (pixels[offset] ?? 0) * 0.2126 + (pixels[offset + 1] ?? 0) * 0.7152 + (pixels[offset + 2] ?? 0) * 0.0722;
}

function validateImages(reference: Uint8Array, candidate: Uint8Array, width: number, height: number): void {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new Error('Visual comparison dimensions must be positive integers');
  }
  const expectedLength = width * height * 4;
  if (reference.length !== expectedLength || candidate.length !== expectedLength) {
    throw new Error('Visual comparison RGBA lengths do not match the dimensions');
  }
}

function validateThreshold(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Visual threshold must be between zero and one');
}
