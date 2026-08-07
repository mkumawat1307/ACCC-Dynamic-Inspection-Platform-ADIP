# Tap-to-Refresh GPS Design

## Goal

Make a single tap on the camera preview force a genuinely fresh GPS satellite fix and give the user visible feedback that a refresh is happening, instead of the current behavior where the tap visually "does nothing" because the cached network fix comes back instantly and the pill never changes.

## Background / Root Cause

The capture screen already calls `gps.refreshNow()` on a single tap (`app/inspection/capture.tsx:218`). However `refreshNow()` → `oneShotFix()` calls `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })`. On Android, `Balanced` can return the cached network/last fix almost immediately, so tapping appears not to refresh the coords/accuracy shown in the GPS pill — the very symptom reported. The pill shows a fixed accuracy readout and gives no in-progress feedback.

The fix: make a tap request a high-accuracy, satellite-oriented fix (`Accuracy.Highest`), surface a transient `refreshing` state so the pill can show "Refreshing GPS…", and only adopt the new fix when it is acceptable (unchanged ≤ 50 m acceptance). The passive background refresh (10 s poll) keeps using `Balanced` — a tap is a deliberate manual action and can justify higher power use; background polling cannot.

## Approach (chosen)

A dedicated manual-refresh path owned by `useGpsTracker`, with a `refreshing` state, plus a `"refreshing"` GPS pill branch. This is the recommended option "A" from the design discussion. It keeps the manual-refresh semantics in the single hook that already owns GPS state, does not alter passive background refresh behavior, gives one source of truth for the pill, and is testable.

## Architecture

Three files change; no schema, DB, or repository changes.

### 1. `src/components/camera/useGpsTracker.ts`

- Add `const [refreshing, setRefreshing] = useState(false)`.
- Refactor `oneShotFix` to accept an accuracy argument:
  `const oneShotFix = useCallback(async (accuracy: Location.Accuracy = Location.Accuracy.Balanced): Promise<GpsFix | null> => { ... }, [acceptFix])`, passing `accuracy` into the `Location.getCurrentPositionAsync({ accuracy })` call. Existing callers (initial acquire, background poll) continue with the default and are unchanged.
- Rework `refreshNow()` to force a fresh fix with feedback:

  ```ts
  const refreshNow = useCallback(async (): Promise<GpsFix | null> => {
    setRefreshing(true);
    try {
      const f = await oneShotFix(Location.Accuracy.Highest);
      return f ?? fixRef.current;
    } finally {
      setRefreshing(false);
    }
  }, [oneShotFix]);
  ```

- Include `refreshing` in the returned object (alongside `status`, `coords`, `accuracyM`, etc.).

### 2. `src/utils/watermarkLayout.ts`

In `gpsPillText(status, accuracyM)`, add a `refreshing` branch returning `"⏳ Refreshing GPS…"`. The existing `fixed` / `denied` / otherwise (`Acquiring GPS…`) branches are unchanged. The emoji prefix stays consistent with the existing `🟢/🟡/🔴` idiom.

The `GpsStatus` type remains `"loading" | "acquiring" | "fixed" | "denied"`; the new state is a separate boolean, not a new `GpsStatus` value, to avoid touching every existing switch over the status. `gpsPillText` therefore needs the `refreshing` present separately — pass it as an additional parameter `gpsPillText(status, accuracyM, refreshing)`, defaulting to `false` so existing callers/tests are unaffected.

### 3. `app/inspection/capture.tsx`

- The existing tap handler still calls `gps.refreshNow()`; no change to `handleCameraTouch`.
- `gpsPillColor` (lines 349-354): add a `refreshing` branch before the `fixed` check, using the amber interim color `#FFEB3B`.
- Pass `refreshing={gps.refreshing}` to the pill text render call (line 437).

### Testing

- `src/__tests__/components/camera/useGpsTracker.test.tsx`:
  - `refreshNow` requests `Location.Accuracy.Highest` and flips `refreshing` on/off around the one-shot.
  - `refreshNow` adopts an acceptable fresh fix (coords/accuracy update) and `refreshing` returns to `false`.
  - `refreshNow` ignores an unacceptable fix (e.g. accuracy 99 m) and falls back to the previous `fixRef.current`, `refreshing` returns to `false`.
  - Background poll still uses the default `Balanced` accuracy (existing acceptance) — assert no regression.
- `src/__tests__/utils/watermarkLayout.test.ts` (or wherever `gpsPillText` is tested):
  - `gpsPillText("fixed", ..., true)` → `"⏳ Refreshing GPS…"`.
  - `gpsPillText("fixed", ..., false)` → existing high/medium/low text.
- `capture.tsx` is a route screen (not unit-tested in this codebase); correctness verified via `tsc` + lint + manual device pass.

## Error handling

- If the `Highest` request throws, times out, or returns an unacceptable fix, `refreshing` is cleared in the `finally`, and the pill returns to the last `status` and accuracy readout. No stuck "Refreshing GPS…" state and no crash.
- Capture flow is unaffected: `handleShutter` still uses `gps.coords` / `captureGps`, which `refreshNow` may improve but never leaves in an intermediate state (`acceptFix` only commits acceptable fixes).

## Isolation & Non-Goals

- No schema, migration, or DB access changes. No repository changes. No `getGlobalDatabase()` anywhere in this flow (ADR-014 respected).
- No change to the passive background auto-refresh logic.
- No focus-ring change, no double-tap zoom change, no watermark text change (only the pill text while refreshing).
- No change to `new.tsx` back/validation.

## Acceptance Criteria

1. Single tap on the camera preview triggers a refresh: the pill shows "⏳ Refreshing GPS…" during acquisition, then resolves to the accuracy text / color for the refreshed fix.
2. The tap updates coordinates/accuracy only when the fresh fix is acceptable (≤ 50 m); otherwise the last good fix is retained.
3. Passive auto-refresh and initial acquisition behavior are unchanged.
4. `refreshing` is always cleared after a tap refresh (no stuck state), including on failure / timeout / unacceptable fix.
5. TypeScript strict clean (`npx tsc --noEmit`), `yarn lint` 0 errors, all Jest suites pass (existing + new).