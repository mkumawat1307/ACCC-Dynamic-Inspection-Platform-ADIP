# Tap-to-Refresh GPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a single tap on the camera preview force a genuinely fresh, high-accuracy GPS fix with visible "⏳ Refreshing GPS…" feedback on the pill, instead of silently returning a cached fix.

**Architecture:** `useGpsTracker` gains a `refreshing` boolean state and a reworked `refreshNow()` that requests `Location.Accuracy.Highest` through the existing `oneShotFix()` (parameterized by accuracy). `gpsPillText` gains a `refreshing` parameter with a new pill branch. The capture screen passes `gps.refreshing` through to the pill. No schema, DB, or repository changes; passive background refresh is untouched.

**Tech Stack:** TypeScript strict, React Native (Expo SDK 54), expo-location, react-native-paper, Jest (jest-expo preset, in-memory expo-location mock).

## Global Constraints

- ADR-014: never call `getGlobalDatabase()` inside the inspection/project flow. This feature touches no DB at all.
- TypeScript strict; no `any`; no new comments unless required. Preserve the existing `emoji` prefix style in the pill.
- `GpsStatus` keeps its existing union: do NOT add `"refreshing"` to it — use a separate boolean parameter. Default the new `refreshing` param to `false` so existing callers/tests compile unchanged.
- `oneShotFix()` must default to `Location.Accuracy.Balanced` so initial acquisition and the background poll behave exactly as today. Only the tap-driven `refreshNow()` uses `Accuracy.Highest`.
- Acceptance threshold is unchanged: a fix is acceptable if `accuracy <= MAX_GPS_ACCURACY_M` (`50`).
- Work on `main`. Commits use the repo's conventional style (`feat(...)`, `test(...)`).

---

### Task 1: `refreshing` state + accuracy-parameterized `oneShotFix` + reworked `refreshNow`

**Files:**
- Modify: `src/components/camera/useGpsTracker.ts`
- Test: `src/__tests__/components/camera/useGpsTracker.test.tsx`

**Interfaces:**
- Consumes: nothing new externally.
- Produces: `refreshNow(): Promise<GpsFix | null>` reworked; `oneShotFix(accuracy?: Location.Accuracy)` internal; new exposed `refreshing: boolean`. Consumed by Task 2 (`capture.tsx`) and Task 3 (pill text).

- [ ] **Step 1: Write the failing tests**

Append these to `src/__tests__/components/camera/useGpsTracker.test.tsx` inside `describe("useGpsTracker", ...)`. The mock `__mocks__/expo-location.ts` exposes `Accuracy` and `getCurrentPositionAsync` (spyable), and `__setMockLocation(lat, lng, accuracy)` controls its return.

```ts
it("refreshNow requests Highest accuracy and flips refreshing on/off", async () => {
  jest.useFakeTimers();
  __setPermissionStatus("granted");
  __setMockLocation(9, 9, 4);
  const tree = await renderProbe();
  let refreshingDuring: boolean | null = null;
  const spy = jest.spyOn(Location, "getCurrentPositionAsync");
  const p = gpsRef.current!.refreshNow().then((fix) => {
    refreshingDuring = gpsRef.current!.refreshing;
    return fix;
  });
  await TestRenderer.act(async () => {
    jest.runAllTimers();
    await flushAsync();
    await p;
  });
  const opt = spy.mock.calls[0]?.[0] as { accuracy?: number } | undefined;
  expect(opt?.accuracy).toBe(Location.Accuracy.Highest);
  expect(refreshingDuring).toBe(false); // cleared by the time the promise settles
  await TestRenderer.act(async () => { tree.unmount(); });
});

it("refreshNow adopts an acceptable fresh fix and clears refreshing", async () => {
  __setPermissionStatus("granted");
  __setMockLocation(7, 8, 12);
  const tree = await renderProbe();
  await TestRenderer.act(async () => {
    const fix = (await gpsRef.current!.refreshNow())!;
    expect(fix.latitude).toBe(7);
    expect(fix.longitude).toBe(8);
    expect(fix.accuracyM).toBe(12);
  });
  expect(gpsRef.current!.refreshing).toBe(false);
  await TestRenderer.act(async () => { tree.unmount(); });
});

it("refreshNow ignores an unacceptable fix and falls back to the last good fix", async () => {
  jest.useFakeTimers();
  __setPermissionStatus("granted");
  __setMockLastKnown(10, 20, 30, 1000); // seeds a fresh, acceptable, cached fix first
  const tree = await renderProbe();
  expect(rendered(tree)).toBe("fixed|10,20");
  __setMockLocation(5, 6, 99); // unacceptable accuracy
  await TestRenderer.act(async () => {
    const fix = await gpsRef.current!.refreshNow();
    expect(fix).not.toBeNull();
    expect(fix!.latitude).toBe(5);  // oneShot returns the raw fix
    expect(fix!.longitude).toBe(6);
  });
  // the hook's accepted state must remain the last good fix
  await TestRenderer.act(async () => { await flushAsync(); });
  expect(rendered(tree)).toBe("fixed|10,20"); // not moved to 5,6
  expect(gpsRef.current!.refreshing).toBe(false);
  await TestRenderer.act(async () => { tree.unmount(); });
});

it("background poll still requests Balanced accuracy", async () => {
  jest.useFakeTimers();
  __setPermissionStatus("granted");
  __setMockLastKnown(1, 2, 25, -60_000);
  const tree = await renderProbe();
  const spy = jest.spyOn(Location, "getCurrentPositionAsync");
  await TestRenderer.act(async () => {
    jest.advanceTimersByTime(10_000);
    await flushAsync();
  });
  const opt = spy.mock.calls[0]?.[0] as { accuracy?: number } | undefined;
  expect(opt?.accuracy).toBe(Location.Accuracy.Balanced);
  await TestRenderer.act(async () => { tree.unmount(); });
});
```

Note on the unacceptable-fix test: `refreshNow` returns the raw `f` from `oneShotFix` (which ignores the unacceptable one), so the returned value here is the raw 5,6 location while the **accepted** state (via `acceptFix`, gated by `isAcceptableFix`) stays `10,20`. This matches the spec's "only adopt when acceptable."

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test --silent src/__tests__/components/camera/useGpsTracker.test.tsx`
Expected: FAIL — `refreshNow` doesn't set `refreshing` (undefined), and the `spy.mock.calls[0]` accuracy assertions fail because `refreshNow` currently passes no accuracy.

- [ ] **Step 3: Implement**

Edit `src/components/camera/useGpsTracker.ts`:

```ts
const [status, setStatus] = useState<GpsStatus>("loading");
const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
const [accuracyM, setAccuracyM] = useState<number | null>(null);
const [refreshing, setRefreshing] = useState(false);
```

Change `oneShotFix` to take an accuracy argument:

```ts
const oneShotFix = useCallback(
  async (accuracy?: Location.Accuracy): Promise<GpsFix | null> => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: accuracy ?? Location.Accuracy.Balanced,
      });
      if (loc && isAcceptableFix(loc)) {
        const fix = toFix(loc);
        if (!cancelledRef.current) acceptFix(fix);
        return fix;
      }
      return null;
    } catch {
      return null;
    }
  },
  [acceptFix]
);
```

Rework `refreshNow` to set `refreshing` around the fresh `Highest` request:

```ts
const refreshNow = useCallback(
  async (): Promise<GpsFix | null> => {
    setRefreshing(true);
    try {
      const f = await oneShotFix(Location.Accuracy.Highest);
      return f ?? fixRef.current;
    } finally {
      setRefreshing(false);
    }
  },
  [oneShotFix]
);
```

Add `refreshing` to the return value:

```ts
return {
  status,
  coords,
  accuracyM,
  ageMs,
  currentFix: fixRef.current,
  captureGps,
  refreshNow,
  refreshing,
};
```

Note: the `useEffect`'s dependency array already references `oneShotFix` and `acceptFix`, and its `[acceptFix, oneShotFix]` deps remain valid since `oneShotFix` is still a stable `useCallback` (its `acceptFix` dep is stable). The background poll calls `oneShotFix()` with the default `Balanced`, so no regression.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test --silent src/__tests__/components/camera/useGpsTracker.test.tsx`
Expected: PASS — existing tests + 4 new green.

- [ ] **Step 5: Verify the whole suite**

Run: `npx tsc --noEmit` and `yarn test --silent`
Expected: tsc clean; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/camera/useGpsTracker.ts src/__tests__/components/camera/useGpsTracker.test.tsx
git commit -m "feat(gps): refreshNow forces a high-accuracy fix with visible refreshing state"
```

---

### Task 2: `refreshing` branch in the GPS pill text

**Files:**
- Modify: `src/utils/watermarkLayout.ts`
- Test: `src/__tests__/utils/watermarkLayout.test.ts`

**Interfaces:**
- Consumes: the new `refreshing` boolean from Task 1.
- Produces: `gpsPillText(status: GpsStatus, accuracyM: number | null, refreshing = false): string`. Consumed by Task 3 (`capture.tsx`).

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/utils/watermarkLayout.test.ts` (in the `gpsPillText` describe block):

```ts
it("gpsPillText returns the refreshing indicator when refreshing is true", () => {
  expect(gpsPillText("fixed", 10, true)).toBe("⏳ Refreshing GPS…");
});

it("gpsPillText defaults refreshing to false and preserves accuracy text", () => {
  expect(gpsPillText("fixed", 10)).toBe("🟢 High Accuracy");
});

it("gpsPillText ignores accuracy while refreshing even for low accuracy", () => {
  expect(gpsPillText("fixed", 99, true)).toBe("⏳ Refreshing GPS…");
});
```

Verify the test file's existing describe/import style first (import `gpsPillText` from `@/src/utils/watermarkLayout`) and match it. Import `gpsPillText` at the top of the file if not already imported.

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test --silent src/__tests__/utils/watermarkLayout.test.ts`
Expected: FAIL — `gpsPillText` signature doesn't accept a third arg / returns the wrong text.

- [ ] **Step 3: Implement**

Edit `src/utils/watermarkLayout.ts`:

```ts
export function gpsPillText(
  status: GpsStatus,
  accuracyM: number | null,
  refreshing = false
): string {
  if (refreshing) return "⏳ Refreshing GPS…";
  if (status === "fixed") {
    if (accuracyM == null) return "🟢 High Accuracy";
    const cat = gpsAccuracyCategory(accuracyM);
    if (cat === "high") return "🟢 High Accuracy";
    if (cat === "medium") return "🟡 Medium Accuracy";
    return "🔴 Low Accuracy";
  }
  if (status === "denied") return "GPS denied";
  return "Acquiring GPS…";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test --silent src/__tests__/utils/watermarkLayout.test.ts`
Expected: PASS — new tests green; existing `gpsPillText` tests unaffected (default `refreshing = false`).

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` and `yarn test --silent`
Expected: tsc clean; all suites pass.

```bash
git add src/utils/watermarkLayout.ts src/__tests__/utils/watermarkLayout.test.ts
git commit -m "feat(gps): refreshing state in the GPS pill text"
```

---

### Task 3: Wire the camera screen to the refreshing pill

**Files:**
- Modify: `app/inspection/capture.tsx`

**Interfaces:**
- Consumes: `gps.refreshing` (Task 1) and `gpsPillText(status, accuracyM, refreshing)` (Task 2).
- Produces: no exported API. Screen-only change.

- [ ] **Step 1: Update the pill color** 

In `app/inspection/capture.tsx`, the `gpsPillColor` computation (lines 349-354) — add a `refreshing` branch before the `fixed` check, using the amber interim color `#FFEB3B`:

```tsx
const gpsPillColor =
  gps.refreshing
    ? "#FFEB3B"
    : gps.status === "fixed" && gps.accuracyM != null
    ? GPS_CATEGORY_COLORS[gpsAccuracyCategory(gps.accuracyM)]
    : gps.status === "denied"
    ? "#FF5252"
    : "#FFEB3B";
```

- [ ] **Step 2: Pass `refreshing` to the pill text**

In the GPS pill render (line 436-438), change:

```tsx
<Text style={[styles.gpsPillText, { color: gpsPillColor }]}>
  {gpsPillText(gps.status, gps.accuracyM)}
</Text>
```

to:

```tsx
<Text style={[styles.gpsPillText, { color: gpsPillColor }]}>
  {gpsPillText(gps.status, gps.accuracyM, gps.refreshing)}
</Text>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `yarn lint`
Expected: tsc clean; lint 0 errors. (`app/` route screens are not unit-tested — consistent with the codebase; correctness is verified via tsc + lint + manual device pass.)

- [ ] **Step 4: Run the full suite**

Run: `yarn test --silent`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add app/inspection/capture.tsx
git commit -m "feat(gps): reflect tap refresh state in the camera GPS pill"
```

---

### Task 4: Full verification + changelog

**Files:** none (verification only) + `docs/07-Changelog.md`

- [ ] **Step 1: Full verification**

Run, from `frontend/`:
- `npx tsc --noEmit` → clean
- `yarn lint` → 0 errors
- `yarn test --silent` → all suites pass

- [ ] **Step 2: End-to-end confirmation on the physical device**

Perform on the target Android device:
1. Open an inspection's camera screen.
2. Confirm the GPS pill shows an accuracy readout when fixed.
3. Tap the preview once → confirm the pill shows "⏳ Refreshing GPS…" for a moment, then the accuracy/color of the refreshed fix (or the prior fix if the fresh fix was unacceptable / none).
4. Confirm the shutter's captured photo coordinates reflect the latest fixed coords (`handleShutter` uses `gps.coords`).

- [ ] **Step 3: Update docs**

Add a one-line entry to `docs/07-Changelog.md` under the current version's Unreleased/Changed bullet, matching the existing format:

```
- Tapping the camera preview now forces a fresh high-accuracy GPS fix and shows a "⏳ Refreshing GPS…" pill while acquiring; unacceptable fixes are ignored in favor of the last good fix.
```

- [ ] **Step 4: Commit**

```bash
git add docs/07-Changelog.md
git commit -m "docs: changelog entry for tap-to-refresh GPS"
```

---

## Self-Review

**1. Spec coverage:**
- Tap forces a fresh high-accuracy fix → Task 1 (`refreshNow` calls `oneShotFix(Location.Accuracy.Highest)`).
- Visible "Refreshing GPS…" feedback → Task 2 (`gpsPillText` refreshing param + branch) + Task 3 (pass `gps.refreshing`).
- Pill color feedback → Task 3 (`gpsPillColor` amber branch).
- Only adopts acceptable fixes; otherwise last good fix retained → Task 1 `oneShotFix` uses `isAcceptableFix`; `refreshNow` returns `f ?? fixRef.current`.
- Passive background refresh unchanged → Global Constraints + Task 1 test (`oneShotFix` defaults to `Balanced`; background poll test asserts `Balanced`).
- No schema/DB/repo change → no DB files in any task; ADR-014 respected.
- Acceptance criteria 1-4 → covered by Tasks 1-3 (tests + manual device pass in Task 4).
- TypeScript strict / lint / tests → Task 4 Step 1.

**2. Placeholder scan:** The test snippet in Task 2 Step 1 includes a placeholder line ("createdAt") flagged inline as "do not ship" — the fixer must remove it. All other steps have concrete code.

**3. Type consistency:** `oneShotFix(accuracy?: Location.Accuracy)` defined and used as `oneShotFix(Location.Accuracy.Highest)` in `refreshNow`; `gpsPillText(status, accuracyM, refreshing = false)` defined in Task 2 and called with the third arg in Task 3; `gps.refreshing` exposed in Task 1 and consumed in Task 3. Consistent.