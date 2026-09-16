export interface PhotoSize {
  width: number;
  height: number;
}

export interface ExpectedPhotoSizeOptions {
  previewWidth: number;
  previewHeight: number;
  ratio: string;
}

const SIZE_PATTERN = /^(\d+)[xX](\d+)$/;
const RATIO_PATTERN = /^(\d+):(\d+)$/;
const ASPECT_TOLERANCE = 0.03;

/** Bucket for all picture sizes at or below approximately 12 megapixels. */
export const MAX_CAPTURE_PIXELS = 12_000_000;

export function parsePictureSize(size: string): PhotoSize | null {
  const match = SIZE_PATTERN.exec(size.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

export function parseAspectRatio(ratio: string): number | null {
  const match = RATIO_PATTERN.exec(ratio.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return null;
  return width / height;
}

function matchesAspect(candidate: PhotoSize, target: number): boolean {
  const aspect = candidate.width / candidate.height;
  return Math.abs(aspect - target) / target <= ASPECT_TOLERANCE;
}

export function pickExpectedPhotoSize(
  sizes: readonly string[] | undefined,
  options: ExpectedPhotoSizeOptions
): PhotoSize | null {
  if (!sizes || sizes.length === 0) return null;
  const target = parseAspectRatio(options.ratio);
  if (target === null) return null;

  let best: PhotoSize | null = null;
  let bestArea = 0;
  for (const raw of sizes) {
    const size = parsePictureSize(raw);
    if (!size || !matchesAspect(size, target)) continue;
    const area = size.width * size.height;
    if (area > bestArea) {
      best = size;
      bestArea = area;
    }
  }
  if (!best) return null;

  const portrait = options.previewHeight > options.previewWidth;
  return portrait
    ? { width: best.height, height: best.width }
    : { width: best.width, height: best.height };
}

export interface LimitedPhotoSizeOptions {
  previewWidth: number;
  previewHeight: number;
  ratio: string;
}

/**
 * Selects the largest device-supported JPEG picture size at or below
 * `maxPixels` whose aspect ratio matches the active camera ratio within the
 * standard tolerance. Returns the raw sensor-listed orientation (landscape) so
 * the caller can pass it directly to the `pictureSize` prop.
 *
 * - Devices that already capture at or below the cap are left unchanged.
 * - When no <= maxPixels size matches the ratio, falls back to the largest
 *   ratio-matching device-supported size so an unsupported size is never
 *   requested.
 * - Returns null for empty, malformed, or non-ratio-matching lists.
 */
export function pickLimitedPhotoSize(
  sizes: readonly string[] | undefined,
  options: LimitedPhotoSizeOptions,
  maxPixels: number = MAX_CAPTURE_PIXELS
): PhotoSize | null {
  if (!sizes || sizes.length === 0) return null;
  const target = parseAspectRatio(options.ratio);
  if (target === null) return null;

  let best: PhotoSize | null = null;
  let bestArea = 0;
  let fallback: PhotoSize | null = null;
  let fallbackArea = 0;
  for (const raw of sizes) {
    const size = parsePictureSize(raw);
    if (!size || !matchesAspect(size, target)) continue;
    const area = size.width * size.height;
    if (area <= maxPixels && area > bestArea) {
      best = size;
      bestArea = area;
    }
    if (area > fallbackArea) {
      fallback = size;
      fallbackArea = area;
    }
  }
  return best ?? fallback;
}

/**
 * Normalize a captured photo's oriented dimensions so its orientation matches
 * the preview container. When the device is physically rotated inside a
 * portrait-locked app, the captured photo dims flip orientation while the
 * container stays fixed. Without alignment the live cover transform inflates
 * the preview watermark (container/photo orientation mismatch), making the
 * correct saved-photo watermark look small by comparison.
 */
export function alignCapturedSizeToContainer(
  capture: PhotoSize,
  container: PhotoSize
): PhotoSize {
  const capturePortrait = capture.height > capture.width;
  const containerPortrait = container.height > container.width;
  if (capturePortrait === containerPortrait) return capture;
  return { width: capture.height, height: capture.width };
}
