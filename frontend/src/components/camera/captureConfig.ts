export const MAX_GPS_ACCURACY_M = 50;
// A fix older than this is stale. The tracker refreshes on movement, manual
// refresh, shutter-time recovery, or an armed stale trigger (fired once per
// stale epoch) — not on a continuous poll.
export const GPS_STALE_MS = 300000;
export const GPS_MOVE_THRESHOLD_M = 10;
export const GPS_GRACE_MS = 5000;
export const PHOTO_QUALITY = 0.8;
export const GPS_ONE_SHOT_TIMEOUT_CACHED_MS = 8000;
export const GPS_ONE_SHOT_TIMEOUT_COLD_MS = 20000;
// Capture uses a parallel acquisition strategy: each attempt fires
// GPS_PARALLEL_REQUESTS independent requests and waits at most
// GPS_ATTEMPT_TIMEOUT_MS for the best (lowest-accuracy) result. After
// GPS_MAX_ATTEMPTS attempts without a valid fix the capture is abandoned.
export const GPS_PARALLEL_REQUESTS = 3;
export const GPS_ATTEMPT_TIMEOUT_MS = 5000;
export const GPS_MAX_ATTEMPTS = 3;

// Movement detection configuration
// Movement check interval: trigger GPS verification after this many seconds of
// sustained movement. This is NOT a distance threshold — it's a time window
// to trigger a GPS position verification. Actual distance is determined by GPS.
export const MOVEMENT_CHECK_INTERVAL_MS = 10000;
// Accelerometer threshold for detecting movement (m/s²). This is a low threshold
// to detect any sustained motion (walking, vehicle vibration) while filtering
// out minor hand tremors and phone rotations.
export const MOVEMENT_ACCELERATION_THRESHOLD = 1.5;
// Minimum time (ms) to confirm movement has stopped before triggering GPS verification
export const MOVEMENT_STOP_CONFIRM_MS = 2000;
