export type GpsQualityLevel = 'excellent' | 'moderate' | 'poor' | 'unavailable';

export interface GpsQualityInfo {
  level: GpsQualityLevel;
  label: string;
  color: string;
}

// Display labels are CATEGORY labels, not the measured accuracy. The ±20 m /
// ±50 m / ±50 m+ suffixes describe the category band, so do NOT substitute the
// actual fix accuracy (e.g. "±17 m", "±32 m", "±87 m") into these strings.
const GPS_QUALITY_LABEL_HIGH = 'High Accuracy ±20 m';
const GPS_QUALITY_LABEL_MEDIUM = 'Medium Accuracy ±50 m';
const GPS_QUALITY_LABEL_LOW = 'Low Accuracy ±50 m+';
const GPS_QUALITY_LABEL_NONE = 'No GPS';

/**
 * Determines GPS quality level based on horizontal accuracy in meters.
 * Accuracy is display-only; it never gates whether a fix is accepted.
 *
 * @param accuracy - Horizontal accuracy in meters, or null/undefined if unavailable
 * @returns GPS quality information including level, label, and color
 */
export function getGpsQuality(accuracy: number | null | undefined): GpsQualityInfo {
  // Handle null, undefined, NaN, negative, or invalid values
  if (accuracy === null || accuracy === undefined || isNaN(accuracy) || accuracy < 0) {
    return {
      level: 'unavailable',
      label: GPS_QUALITY_LABEL_NONE,
      color: '#9E9E9E' // gray
    };
  }

  if (accuracy <= 20) {
    return {
      level: 'excellent',
      label: GPS_QUALITY_LABEL_HIGH,
      color: '#4CAF50' // green
    };
  }

  if (accuracy <= 50) {
    return {
      level: 'moderate',
      label: GPS_QUALITY_LABEL_MEDIUM,
      color: '#FF9800' // orange
    };
  }

  // > 50m
  return {
    level: 'poor',
    label: GPS_QUALITY_LABEL_LOW,
    color: '#F44336' // red
  };
}

/**
 * Gets a colored GPS status string for UI display.
 * Returns something like: "🟢 High Accuracy ±20 m", "🟠 Medium Accuracy ±50 m",
 * "🔴 Low Accuracy ±50 m+", "⚪ No GPS"
 */
export function getGpsStatusString(accuracy: number | null | undefined): string {
  const quality = getGpsQuality(accuracy);

  if (quality.level === 'unavailable') {
    return '⚪ No GPS';
  }

  const emoji = quality.level === 'excellent' ? '🟢' :
                quality.level === 'moderate' ? '🟠' : '🔴';

  return `${emoji} ${quality.label}`;
}

/**
 * Determines if a GPS fix is valid (has valid coordinates and timestamp).
 * Does NOT check accuracy - accuracy is now informational only.
 */
export function isValidGpsFix(latitude: number | null | undefined, 
                               longitude: number | null | undefined, 
                               timestamp: number | null | undefined): boolean {
  if (latitude === null || latitude === undefined || 
      longitude === null || longitude === undefined ||
      timestamp === null || timestamp === undefined) {
    return false;
  }
  
  // Check for valid number values
  if (isNaN(latitude) || isNaN(longitude) || isNaN(timestamp)) {
    return false;
  }
  
  // Basic coordinate validation
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false;
  }
  
  return true;
}