// GPS accuracy is no longer a blocking condition for capture.
// This constant remains for UI quality classification and legacy references only.
export const MAX_GPS_ACCURACY_M = 50;
// A fix older than this is stale. The tracker refreshes on movement, manual
// refresh, shutter-time recovery, or an armed stale trigger (fired once per
// stale epoch) — not on a continuous poll.
export const GPS_STALE_MS = 150000;
// Automatic GPS refresh cadence while the camera screen is open. The initial
// camera-open acquisition uses Highest; every subsequent automatic recovery
// runs Balanced x3 then Highest x2 (max 5 attempts). A recovery with no result
// under this cadence never turns into continuous polling or background tracking.
export const GPS_AUTO_REFRESH_MS = 20000;
export const GPS_MOVE_THRESHOLD_M = 10;
export const GPS_GRACE_MS = 5000;
export const PHOTO_QUALITY = 0.8;
// One-shot GPS timeouts: increased to accommodate real-world Android GPS
// acquisition times. A valid <=50m fix was observed taking ~10.6s on physical
// devices, so the cached timeout is raised to 15s with margin.
export const GPS_ONE_SHOT_TIMEOUT_CACHED_MS = 15000;
export const GPS_ONE_SHOT_TIMEOUT_COLD_MS = 25000;
// Capture uses a parallel acquisition strategy: each attempt fires
// GPS_PARALLEL_REQUESTS independent requests and waits at most
// GPS_ATTEMPT_TIMEOUT_MS for the best (lowest-accuracy) result. After
// GPS_MAX_ATTEMPTS attempts without a valid fix the capture is abandoned.
export const GPS_PARALLEL_REQUESTS = 3;
export const GPS_ATTEMPT_TIMEOUT_MS = 7000;
export const GPS_MAX_ATTEMPTS = 3;

// GPS quality bands
// Horizontal accuracy threshold: fixes with accuracy beyond this many metres are
// rejected outright and never become the current fix, the movement reference,
// the capture GPS, or the watermark GPS. Within the limit, accuracy stays display-only.
// >100 m → "⚪ GPS Poor — Refresh GPS" (no acceptable GPS).
export const GPS_MAX_ACCEPTABLE_ACCURACY_M = 100;

// Movement detection configuration
// Movement GPS delay: after a NEW movement event is detected, wait this long
// before triggering a movement recovery. Automatic recovery may continue for
// the first part of the window, but when the window completes a pending
// automatic recovery is pre-empted by movement (manual always outranks both).
export const MOVEMENT_GPS_DELAY_MS = 15000;
// Accelerometer threshold for detecting movement (m/s²). This is a low threshold
// to detect any sustained motion (walking, vehicle vibration) while filtering
// out minor hand tremors and phone rotations.
export const MOVEMENT_ACCELERATION_THRESHOLD = 1.5;
// Minimum time (ms) to confirm movement has stopped before triggering GPS verification
export const MOVEMENT_STOP_CONFIRM_MS = 2000;
