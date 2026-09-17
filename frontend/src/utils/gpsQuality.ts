export type GpsQualityLevel = 'excellent' | 'moderate' | 'poor' | 'unavailable';

export interface GpsQualityInfo {
  level: GpsQualityLevel;
  label: string;
  color: string;
}

/**
 * Determines GPS quality level based on horizontal accuracy in meters.
 * 
 * @param accuracy - Horizontal accuracy in meters, or null/undefined if unavailable
 * @returns GPS quality information including level, label, and color
 */
export function getGpsQuality(accuracy: number | null | undefined): GpsQualityInfo {
  // Handle null, undefined, NaN, negative, or invalid values
  if (accuracy === null || accuracy === undefined || isNaN(accuracy) || accuracy < 0) {
    return {
      level: 'unavailable',
      label: 'Unavailable',
      color: '#9E9E9E' // gray
    };
  }

  if (accuracy <= 20) {
    return {
      level: 'excellent',
      label: 'Excellent',
      color: '#4CAF50' // green
    };
  }

  if (accuracy <= 50) {
    return {
      level: 'moderate',
      label: 'Moderate',
      color: '#FF9800' // orange
    };
  }

  // > 50m
  return {
    level: 'poor',
    label: 'Poor',
    color: '#F44336' // red
  };
}

/**
 * Gets a colored GPS status string for UI display.
 * Returns something like: "🟢 GPS 12m", "🟠 GPS 37m", "🔴 GPS 95m", "⚫ GPS unavailable"
 */
export function getGpsStatusString(accuracy: number | null | undefined): string {
  const quality = getGpsQuality(accuracy);
  
  if (quality.level === 'unavailable') {
    return '⚫ GPS unavailable';
  }

  const emoji = quality.level === 'excellent' ? '🟢' : 
                quality.level === 'moderate' ? '🟠' : '🔴';
  
  return `${emoji} GPS ${accuracy}m`;
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