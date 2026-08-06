# Camera & Watermark UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Professional Camera & Watermark UI Specification v3.0 (`docs/12-CAMERA_WATERMARK_UI_SPEC.md`) as 8 small, independently-testable phases that each end with typecheck, tests, manual verification, performance verification, and a separate commit — while never violating the frozen performance architecture (`docs/11-CAMERA_PERFORMANCE_SPEC.md`).

**Architecture:** Watermark configuration is persisted device-wide (AsyncStorage) and surfaced through a React Context. Both the RN preview overlay and the WebView canvas renderer consume the same composed line array and the same resolved style config, so preview and saved image stay pixel-identical (WYSIWYG). All lines and formats are pure functions in `utils/` so the canvas math keeps its established mirror-relationship with the overlay. The capture pipeline (persistent WebView, canvas, SAF caches, capture queue) is untouched except for carrying a style object in the existing `injectJavaScript` payload.

**Tech Stack:** React Native (0.81) / Expo SDK 54, expo-camera v17 (`CameraView`), react-native-webview (persistent renderer), react-native-paper (settings UI), expo-location, @react-native-async-storage/async-storage, react-native-gesture-handler (pinch zoom). Jest + jest-expo for tests. Git repo root is `frontend/`.

## Global Constraints

Copied verbatim from the two frozen specs plus repo rules. Every phase implicitly inherits these.

1. **Performance budget (perf spec):** Capture ≤600ms, SQLite Create ≤50ms, File Read ≤250ms, Canvas Draw ≤120ms, JPEG Encode ≤200ms, SAF Write ≤150ms, SQLite Update ≤10ms, Capture→Saved **≤1000ms**. Any regression >50ms must be justified and benchmarked.
2. **Do NOT redesign the protected pipeline** (perf spec §Protected Architecture): Persistent WebView / Persistent HTML / Persistent Canvas / Renderer Reuse / SAF Directory Cache / Tree URI Cache / Performance Instrumentation / Capture Queue / Offline Storage / Current Watermark Rendering Pipeline.
3. **No feature may reduce image quality, reduce capture resolution, or block the camera preview.**
4. **WYSIWYG is a hard acceptance criterion:** preview overlay and saved image must be pixel-identical. The preview and the renderer must use the **same lines array** and the **same style config**.
5. **Debug instrumentation stays:** keep the 11 perf log stages and the JS perf payload (`decode`/`draw`/`encode`/`total`) intact in the renderer page.
6. **No comments in code** unless requested. TypeScript strict, avoid `any`. PascalCase components/repos/interfaces, camelCase variables.
7. **Gates every phase:** (a) `npx tsc --noEmit` clean; (b) `npx eslint <changed files>` 0 errors (warnings OK for jest.mock hoisting); (c) `npx jest --silent` full suite green + new tests pass; (d) **manual device verification** + **performance verification** via `adb logcat -s ReactNativeJS:* | Select-String "Perf|SAF"` (user runs the build; no device in this environment); (e) one separate Git commit per phase, run from `frontend/`.
8. **Per-file coverage thresholds** live in `jest.config.js` (80 lines/statements/functions, 70 branches). New source files `watermarkSettings.ts`, `watermarkStyle.ts`, `watermarkLayout.ts`, `cameraControls.ts` get thresholds added in their introducing phase.
9. **AsyncStorage mocking pattern** for tests (mirror `useSectionCollapse.test.tsx`):
   `jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }))`.
10. **expo-camera v17 API facts (verified against SDK 54 docs):** `CameraView` supports `flash` ("auto"|"on"|"off"), `facing` ("front"|"back"), `zoom` (0–1), `ratio` ("4:3"|"16:9"). It does **NOT** expose tap-to-focus point control, focus-depth, or manual exposure. `ratio` changes preview scaleType from FILL to FIT; setting `pictureSize` overrides `ratio`.

## Decisions to Confirm (flagging; plan proceeds on the literal spec reading)

| # | Decision | Plan takes | If you disagree |
|---|----------|------------|-----------------|
| D1 | **District/Block line removed** from the watermark. Spec layout lists exactly: Site ID / Date & Time / Latitude / Longitude / GPS Accuracy / Reverse Address; the example omits the district-block line. | Phase 3 composes only those 6 slots. | Keep the district-block line as line 2 in `composeWatermarkLines` — one-line change in `watermarkLayout.ts`. |
| D2 | **Coordinates format** becomes `27.608123N 75.151703E` (hemisphere letters) per the spec example. | `formatLatLngWM` updated in Phase 3. | Revert to `lat, lng` comma form. |
| D3 | **Default settings preserve today's look** (size=medium, bottom-left, opacity 0.5, green, 12h, `05-Aug-2026`), except mandatory spec appearance changes (sans-serif font, 12px-class corners, small box shadow). Medium font scale = current size (no regression). | Phases 1–4. | Tweak `DEFAULT_WATERMARK_SETTINGS` / `WATERMARK_SIZE_FONT_SCALE`. |
| D4 | **Opacity control is a segmented 20/35/50/65/80% picker**, not a continuous slider — react-native-paper has no Slider and adding `@react-native-community/slider` (native) is avoided. Covers the spec's 20%→80% range. | Phase 2 form. | Swap in `@react-native-community/slider` as a follow-up. |
| D5 | **"Highest Quality Capture" = full resolution, no downscale** (already true: `skipProcessing:false`, no scale). `PHOTO_QUALITY=0.8` is kept because raising it increases base64 size and risks the ≤1000ms budget. | No code change; documented. | Benchmark quality=1.0 separately. |
| D6 | **Tap-to-focus** implemented as: focus reticle animation + GPS refresh + live watermark update. Hardware focus-point/exposure control is impossible via expo-camera v17's public API. | Phase 7 (soft focus). | Invest in a custom native module (separate, benchmarked effort). |
| D7 | **Manual Exposure** is **out of scope** (not exposed by expo-camera v17). | Not implemented. | Native module effort. |
| D8 | **Pinch zoom is preview-only** — `takePictureAsync` captures the full frame regardless of `zoom`. | Phase 8. | Nothing to do; documented. |

## Out of Scope / Deferred (no tasks in this plan)

- **Performance Dashboard** (perf spec §Performance Dashboard) — Debug-only UI, separate future work.
- **Preserve EXIF** — the canvas `toBlob('image/jpeg',0.95)` re-encode strips EXIF today; fixing it needs a JPEG writer with EXIF injection (or the Direct File URI Rendering future optimization) and its own benchmarked phase.
- **Direct File URI Rendering / Native Bitmap Renderer / Hardware JPEG Encoding / Parallel Image Processing** (perf spec §Future Optimization) — benchmark-gated; not started.
- **Camera hardware flash persistence, torch, barcode scanning, video** — out of spec.

## File Structure Map

New files:
- `src/utils/watermarkSettings.ts` — types, defaults, AsyncStorage persistence, validation.
- `src/context/WatermarkSettingsContext.tsx` — provider + `useWatermarkSettings()`.
- `src/utils/watermarkStyle.ts` — style config (size/color maps, opacity, position) + `computeWatermarkMetrics(width,height,config)`.
- `src/utils/watermarkLayout.ts` — `composeWatermarkLines`, `gpsAccuracyCategory`, `formatGpsAccuracyLine`, `gpsPillText`, category colors.
- `src/utils/cameraControls.ts` — `nextFlashMode`, `clampZoom`, `nextRatio`, ratio constants.
- `src/components/settings/WatermarkSettingsForm.tsx` — the settings form (no router dependency, testable).
- `app/settings/watermark.tsx` — route screen wrapping the form.
- `src/components/camera/CameraControlsBar.tsx` — flash/facing/ratio buttons.
- `src/components/camera/TapToFocusOverlay.tsx` — tap-to-focus reticle.
- Tests: `watermarkSettings.test.ts`, `WatermarkSettingsContext.test.tsx`, `WatermarkSettingsForm.test.tsx`, `watermarkStyle.test.ts`, `watermarkLayout.test.ts`, `cameraControls.test.ts`, `CameraControlsBar.test.tsx`, `TapToFocusOverlay.test.tsx`.

Modified files:
- `app/_layout.tsx` (Phases 1, 8), `app/settings/index.tsx` (2), `app/inspection/capture.tsx` (2,3,4,5,6,7,8), `src/components/inspection/photoUtils.ts` (3), `src/utils/watermarkHtml.ts` (4), `src/components/camera/WatermarkOverlay.tsx` (3,4), `src/components/inspection/useWatermarkProcessor.ts` (4), `src/components/camera/useAddressLookup.ts` (3), `src/components/camera/captureConfig.ts` (6,8), `src/components/camera/useGpsTracker.ts` (6), `__mocks__/expo-camera.ts` (8), `jest.config.js` (1,3,4,8 — add thresholds), and the matching test files.

---

## Phase 0: Commit the frozen specs and this plan — **REQUIRES CONFIRMATION**

The user previously declined to commit docs 11/12 on their own. Confirm once before starting: commit `docs/11-CAMERA_PERFORMANCE_SPEC.md`, `docs/12-CAMERA_WATERMARK_UI_SPEC.md`, and `docs/13-CAMERA_WATERMARK_UI_IMPLEMENTATION_PLAN.md` as a single baseline commit. If declined, Phase 1's commit includes only Phase 1 files.

- [ ] **Step 1:** Confirm with the user.
- [ ] **Step 2:** Commit.
```bash
cd frontend
git add docs/11-CAMERA_PERFORMANCE_SPEC.md docs/12-CAMERA_WATERMARK_UI_SPEC.md docs/13-CAMERA_WATERMARK_UI_IMPLEMENTATION_PLAN.md
git commit -m "docs: add frozen camera performance and watermark UI specs plus implementation plan"
```

---

## Phase 1: Watermark Settings Foundation

**Goal:** A persisted, validated, device-wide settings store exposed via React context. No UI or camera changes — later phases read `settings` from here.

**Files:**
- Create: `src/utils/watermarkSettings.ts`
- Create: `src/context/WatermarkSettingsContext.tsx`
- Modify: `app/_layout.tsx` (wrap provider)
- Modify: `jest.config.js` (add threshold for `watermarkSettings.ts`)
- Test: `src/__tests__/utils/watermarkSettings.test.ts`, `src/__tests__/context/WatermarkSettingsContext.test.tsx`

**Interfaces produced (consumed by Phases 2–5):**
```ts
// src/utils/watermarkSettings.ts
export type WatermarkSize = "small" | "medium" | "large";
export type WatermarkPosition = "bottomLeft" | "bottomRight";
export type WatermarkTextColor = "green" | "white" | "yellow";
export type WatermarkDateFormat = "dd-MMM-yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
export type WatermarkTimeFormat = "12h" | "24h";
export interface WatermarkSettings {
  size: WatermarkSize;
  position: WatermarkPosition;
  opacity: number;               // clamped to 0.2..0.8
  textColor: WatermarkTextColor;
  showGpsAccuracy: boolean;
  showAddress: boolean;
  dateFormat: WatermarkDateFormat;
  timeFormat: WatermarkTimeFormat;
}
export const WATERMARK_SETTINGS_STORAGE_KEY: string;   // "accc_watermark_settings_v1"
export const WATERMARK_OPACITY_MIN: number;             // 0.2
export const WATERMARK_OPACITY_MAX: number;             // 0.8
export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings;
export function normalizeWatermarkSettings(v: unknown): WatermarkSettings;
export async function loadWatermarkSettings(): Promise<WatermarkSettings>;
export async function saveWatermarkSettings(s: WatermarkSettings): Promise<void>;
```
```ts
// src/context/WatermarkSettingsContext.tsx
export function WatermarkSettingsProvider({ children }: { children: React.ReactNode }): JSX.Element;
export function useWatermarkSettings(): {
  settings: WatermarkSettings;
  ready: boolean;
  setSetting: <K extends keyof WatermarkSettings>(key: K, value: WatermarkSettings[K]) => void;
};
```

- [ ] **Step 1: Write the failing tests** for `watermarkSettings.ts`.

`src/__tests__/utils/watermarkSettings.test.ts`:
```ts
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_WATERMARK_SETTINGS,
  WATERMARK_SETTINGS_STORAGE_KEY,
  loadWatermarkSettings,
  saveWatermarkSettings,
  normalizeWatermarkSettings,
} from "@/src/utils/watermarkSettings";

const mockedGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockedSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

describe("normalizeWatermarkSettings", () => {
  it("returns defaults for null/undefined", () => {
    expect(normalizeWatermarkSettings(null)).toEqual(DEFAULT_WATERMARK_SETTINGS);
    expect(normalizeWatermarkSettings(undefined)).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });
  it("falls back per-field for invalid values", () => {
    const out = normalizeWatermarkSettings({ size: "huge", opacity: 9, textColor: "pink" });
    expect(out.size).toBe(DEFAULT_WATERMARK_SETTINGS.size);
    expect(out.opacity).toBe(DEFAULT_WATERMARK_SETTINGS.opacity);
    expect(out.textColor).toBe(DEFAULT_WATERMARK_SETTINGS.textColor);
  });
  it("clamps opacity into 0.2..0.8", () => {
    expect(normalizeWatermarkSettings({ opacity: 0.1 }).opacity).toBe(0.2);
    expect(normalizeWatermarkSettings({ opacity: 0.99 }).opacity).toBe(0.8);
  });
  it("keeps valid overrides", () => {
    const out = normalizeWatermarkSettings({ size: "large", opacity: 0.65, dateFormat: "yyyy-MM-dd", timeFormat: "24h" });
    expect(out).toEqual(expect.objectContaining({ size: "large", opacity: 0.65, dateFormat: "yyyy-MM-dd", timeFormat: "24h" }));
  });
});

describe("loadWatermarkSettings", () => {
  it("returns defaults when nothing is stored", async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await loadWatermarkSettings()).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });
  it("parses and normalizes stored JSON", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ size: "small", opacity: 0.7 }));
    const s = await loadWatermarkSettings();
    expect(s.size).toBe("small");
    expect(s.opacity).toBe(0.7);
    expect(s.position).toBe(DEFAULT_WATERMARK_SETTINGS.position);
  });
  it("returns defaults on corrupt JSON", async () => {
    mockedGetItem.mockResolvedValue("not json{");
    expect(await loadWatermarkSettings()).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });
});

describe("saveWatermarkSettings", () => {
  it("persists normalized JSON under the storage key", async () => {
    await saveWatermarkSettings({ ...DEFAULT_WATERMARK_SETTINGS, size: "large", opacity: 0.99 });
    expect(mockedSetItem).toHaveBeenCalledWith(
      WATERMARK_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_WATERMARK_SETTINGS, size: "large", opacity: 0.8 })
    );
  });
  it("does not throw when storage fails", async () => {
    mockedSetItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(saveWatermarkSettings(DEFAULT_WATERMARK_SETTINGS)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.** `npx jest src/__tests__/utils/watermarkSettings.test.ts --silent` → FAIL (module not found).
- [ ] **Step 3: Write the failing context test.**

`src/__tests__/context/WatermarkSettingsContext.test.tsx`:
```tsx
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WatermarkSettingsProvider, useWatermarkSettings } from "@/src/context/WatermarkSettingsContext";
import { DEFAULT_WATERMARK_SETTINGS, WATERMARK_SETTINGS_STORAGE_KEY } from "@/src/utils/watermarkSettings";

const mockedGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockedSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

let captured: ReturnType<typeof useWatermarkSettings> | null = null;
function Probe() {
  captured = useWatermarkSettings();
  return null;
}

describe("WatermarkSettingsProvider", () => {
  beforeEach(() => {
    mockedGetItem.mockReset();
    mockedSetItem.mockReset();
    captured = null;
  });

  it("loads persisted settings and marks ready", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ size: "large" }));
    await act(async () => { TestRenderer.create(<WatermarkSettingsProvider><Probe /></WatermarkSettingsProvider>); });
    expect(captured!.ready).toBe(true);
    expect(captured!.settings.size).toBe("large");
  });

  it("defaults to DEFAULT_WATERMARK_SETTINGS when nothing stored", async () => {
    mockedGetItem.mockResolvedValue(null);
    await act(async () => { TestRenderer.create(<WatermarkSettingsProvider><Probe /></WatermarkSettingsProvider>); });
    expect(captured!.ready).toBe(true);
    expect(captured!.settings).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });

  it("setSetting updates state and persists", async () => {
    mockedGetItem.mockResolvedValue(null);
    await act(async () => { TestRenderer.create(<WatermarkSettingsProvider><Probe /></WatermarkSettingsProvider>); });
    await act(async () => { captured!.setSetting("position", "bottomRight"); });
    expect(captured!.settings.position).toBe("bottomRight");
    expect(mockedSetItem).toHaveBeenCalledWith(
      WATERMARK_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_WATERMARK_SETTINGS, position: "bottomRight" })
    );
  });
});
```

- [ ] **Step 4: Run to verify failure.** `npx jest src/__tests__/context/WatermarkSettingsContext.test.tsx --silent` → FAIL.
- [ ] **Step 5: Implement `src/utils/watermarkSettings.ts`.** Use the exact interface above. `normalizeWatermarkSettings` falls back per-field with enum guards, clamps opacity via `Math.min(WATERMARK_OPACITY_MAX, Math.max(WATERMARK_OPACITY_MIN, n))` for finite numbers, `loadWatermarkSettings` wraps `AsyncStorage.getItem` + `JSON.parse` in try/catch returning a copy of defaults, `saveWatermarkSettings` persists normalized JSON and swallows errors (log via `logger.warn`). Import `logger` from `@/src/utils/logger`.
- [ ] **Step 6: Implement `src/context/WatermarkSettingsContext.tsx`.** Provider loads on mount into state (default `DEFAULT_WATERMARK_SETTINGS`, `ready=false` until resolved; guard against unmount with a `cancelled` flag). `setSetting` does `setSettings(prev => { const next = { ...prev, [key]: value }; void saveWatermarkSettings(next); return next; })`. Memoize context value on `[settings, ready, setSetting]`. Throw `"useWatermarkSettings must be used inside WatermarkSettingsProvider"` if used outside.
- [ ] **Step 7: Wire the provider into `app/_layout.tsx`.** Wrap the existing tree: `PaperProvider > WatermarkSettingsProvider > InspectionProvider > SafeAreaProvider > StatusBar + Stack`.
- [ ] **Step 8: Add the coverage threshold** for `src/utils/watermarkSettings.ts` to `jest.config.js` (80 lines/statements/functions, 70 branches) following the existing block format.
- [ ] **Step 9: Run all Phase 1 gates.** `npx tsc --noEmit`; `npx eslint src/utils/watermarkSettings.ts src/context/WatermarkSettingsContext.tsx app/_layout.tsx src/__tests__/utils/watermarkSettings.test.ts src/__tests__/context/WatermarkSettingsContext.test.tsx`; `npx jest --silent`. No perf impact (camera untouched).
- [ ] **Step 10: Commit.**
```bash
cd frontend
git add src/utils/watermarkSettings.ts src/context/WatermarkSettingsContext.tsx app/_layout.tsx jest.config.js src/__tests__/utils/watermarkSettings.test.ts src/__tests__/context/WatermarkSettingsContext.test.tsx
git commit -m "feat(watermark): add persisted watermark settings store and context"
```

---

## Phase 2: Watermark Settings UI

**Goal:** A testable form screen reachable from the global Settings (new "Camera" section) and a gear icon on the capture screen. Changes `settings` through the Phase 1 context.

**Files:**
- Create: `src/components/settings/WatermarkSettingsForm.tsx`
- Create: `app/settings/watermark.tsx`
- Modify: `app/settings/index.tsx` (add Camera section link)
- Modify: `app/inspection/capture.tsx` (gear Appbar action — this is the only change here in this phase)
- Test: `src/__tests__/components/settings/WatermarkSettingsForm.test.tsx`

**Interfaces:**
- Consumes: `useWatermarkSettings()` from Phase 1.
- Produces: `export default function WatermarkSettingsForm(): JSX.Element` (renders all 8 controls; no navigation).

- [ ] **Step 1: Write the failing test.**

`src/__tests__/components/settings/WatermarkSettingsForm.test.tsx`:
```tsx
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import WatermarkSettingsForm from "@/src/components/settings/WatermarkSettingsForm";
import { useWatermarkSettings } from "@/src/context/WatermarkSettingsContext";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";

jest.mock("@/src/context/WatermarkSettingsContext", () => ({
  useWatermarkSettings: jest.fn(),
}));

const mockedUseWatermarkSettings = useWatermarkSettings as jest.MockedFunction<typeof useWatermarkSettings>;

function findAllByText(tree: ReturnType<typeof TestRenderer.create>, text: string): unknown[] {
  const out: unknown[] = [];
  const walk = (node: unknown) => {
    if (node && typeof node === "object" && "children" in (node as object)) {
      const children = (node as { children?: unknown[] }).children;
      if (Array.isArray(children)) for (const c of children) walk(c);
    }
    if (node && typeof node === "object" && "props" in (node as object)) {
      const props = (node as { props?: { children?: unknown } }).props;
      if (props && props.children === text) out.push(node);
    }
  };
  walk(tree.toJSON());
  return out;
}

describe("WatermarkSettingsForm", () => {
  const setSetting = jest.fn();
  beforeEach(() => {
    setSetting.mockReset();
    mockedUseWatermarkSettings.mockReturnValue({ settings: DEFAULT_WATERMARK_SETTINGS, ready: true, setSetting });
  });

  it("renders all eight controls", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(<WatermarkSettingsForm />); });
    for (const label of ["Small", "Medium", "Large", "Bottom Left", "Bottom Right", "Green", "White", "Yellow", "50%", "05-Aug-2026", "12 Hour", "24 Hour"]) {
      expect(findAllByText(tree, label).length).toBeGreaterThan(0);
    }
  });

  it("calls setSetting('size','large') when Large is pressed", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(<WatermarkSettingsForm />); });
    const large = findAllByText(tree, "Large")[0];
    act(() => {
      (large as { props: { onPress: () => void } }).props.onPress();
    });
    expect(setSetting).toHaveBeenCalledWith("size", "large");
  });

  it("calls setSetting('showGpsAccuracy',false) via the switch", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(<WatermarkSettingsForm />); });
    const rows = tree.root.findAll((n) => n.props.testID === "wmk-switch-gps-accuracy");
    expect(rows.length).toBe(1);
    act(() => { rows[0].props.onValueChange(false); });
    expect(setSetting).toHaveBeenCalledWith("showGpsAccuracy", false);
  });
});
```
(For the switch, give `Switch` a `testID="wmk-switch-gps-accuracy"` inside the List.Item `right` renderer.)

- [ ] **Step 2: Run to verify failure.** FAIL (module not found).
- [ ] **Step 3: Implement `src/components/settings/WatermarkSettingsForm.tsx`.** Use `react-native-paper` `List.Section`, `List.Subheader`, `List.Item`, `SegmentedButtons`, `Switch`, `Divider`. Controls per the spec:
  - Size: Small/Medium/Large → `setSetting("size", v as WatermarkSize)`.
  - Position: Bottom Left/Bottom Right → `setSetting("position", ...)`.
  - Background Opacity: SegmentedButtons `["20","35","50","65","80"]`, value = `String(Math.round(settings.opacity * 100))`, onValueChange → `setSetting("opacity", Number(v) / 100)`. (D4.)
  - Text Color: Green/White/Yellow → `setSetting("textColor", ...)`.
  - Show GPS Accuracy / Show Reverse Address: `Switch` with testIDs `wmk-switch-gps-accuracy` / `wmk-switch-show-address` → `setSetting("showGpsAccuracy", v)` / `setSetting("showAddress", v)`.
  - Date Format: `05-Aug-2026` / `05/08/2026` / `2026-08-05` → `setSetting("dateFormat", ...)`.
  - Time Format: 12 Hour / 24 Hour → `setSetting("timeFormat", ...)`.
  Read settings via `useWatermarkSettings()`.
- [ ] **Step 4: Create `app/settings/watermark.tsx`.** Route screen: `SafeAreaView` + `Appbar.Header` with `BackAction` and title "Watermark Settings" + `<WatermarkSettingsForm />` in a `ScrollView`.
- [ ] **Step 5: Add the "Camera" section to `app/settings/index.tsx`.** New `List.Section` after the Inspection Form section: `List.Subheader` "Camera", `List.Item` title "Watermark", description "Size, position, colors and GPS options", `List.Icon "watermark"`, `onPress={() => router.push("/settings/watermark")}`.
- [ ] **Step 6: Add the gear to the capture screen.** In `app/inspection/capture.tsx`, add `<Appbar.Action icon="cog" onPress={() => router.push("/settings/watermark")} />` after `<Appbar.Content title="Capture Photo" />`. `useRouter` is already imported.
- [ ] **Step 7: Run all gates.** tsc, eslint (all touched files), jest full suite. No perf impact.
- [ ] **Step 8: Commit.**
```bash
cd frontend
git add src/components/settings/WatermarkSettingsForm.tsx app/settings/watermark.tsx app/settings/index.tsx app/inspection/capture.tsx src/__tests__/components/settings/WatermarkSettingsForm.test.tsx
git commit -m "feat(watermark): add watermark settings screen"
```

---

## Phase 3: Watermark Content per Spec Layout

**Goal:** Change WHAT the watermark shows (not its styling): line order Site ID / Date / Coordinates / Accuracy / Address, hemisphere coordinates, date/time formats from settings, configurable accuracy + address visibility, offline hides address (never shows an error line), and a single composed `lines` array drives both preview and saved image.

**Files:**
- Modify: `src/components/inspection/photoUtils.ts` (formatters)
- Create: `src/utils/watermarkLayout.ts`
- Modify: `src/components/camera/useAddressLookup.ts` (hide on failure)
- Modify: `src/components/camera/WatermarkOverlay.tsx` (accept `lines` array)
- Modify: `app/inspection/capture.tsx` (compose once; use settings; drop ADDRESS_UNAVAILABLE)
- Modify: `jest.config.js` (threshold for `watermarkLayout.ts`)
- Test: `src/__tests__/components/inspection/photoUtils.test.ts` (extend), `src/__tests__/utils/watermarkLayout.test.ts` (new), `src/__tests__/components/camera/useAddressLookup.test.tsx` (update), `src/__tests__/components/camera/WatermarkOverlay.test.tsx` (update)

**Interfaces produced:**
```ts
// src/components/inspection/photoUtils.ts (changed)
export function formatDatePart(iso: string, dateFormat: WatermarkDateFormat): string;  // "05-Aug-2026" | "05/08/2026" | "2026-08-05"
export function formatTimePart(iso: string, timeFormat: WatermarkTimeFormat): string;  // "06:02 PM" | "18:02"
export function formatWatermarkDate(iso: string, dateFormat?: WatermarkDateFormat, timeFormat?: WatermarkTimeFormat): string; // defaults keep current output
export function formatLatLngWM(lat: number, lng: number): string; // "27.608123N 75.151703E"
```
```ts
// src/utils/watermarkLayout.ts (new)
export const GPS_ACCURACY_HIGH_M: number;    // 15
export const GPS_ACCURACY_MEDIUM_M: number;  // 30
export type GpsAccuracyCategory = "high" | "medium" | "low";
export function gpsAccuracyCategory(accuracyM: number): GpsAccuracyCategory;
export function formatGpsAccuracyLine(accuracyM: number): string;   // "Accuracy : ±12 m"
export const GPS_CATEGORY_COLORS: Record<GpsAccuracyCategory, string>; // { high:"#76FF03", medium:"#FFEB3B", low:"#FF5252" }
export function gpsPillText(status: GpsStatus, accuracyM: number | null): string; // "GPS OK · ±12 m" | "GPS denied" | "Acquiring GPS…"
export interface WatermarkLineInput {
  siteId: string;
  timestampIso: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  addressLines: string[];
  settings: Pick<WatermarkSettings, "dateFormat" | "timeFormat" | "showGpsAccuracy" | "showAddress">;
}
export function composeWatermarkLines(input: WatermarkLineInput): string[];
```
```ts
// src/components/camera/WatermarkOverlay.tsx (changed props)
interface Props { width: number; height: number; lines: string[]; }
```
`GpsStatus` is imported from `useGpsTracker` (`type GpsStatus = "loading" | "acquiring" | "fixed" | "denied"`).

- [ ] **Step 1: Write failing tests for the photoUtils formatters.** Extend `src/__tests__/components/inspection/photoUtils.test.ts`:
```ts
describe("formatWatermarkDate with formats", () => {
  it("formats dd-MMM-yyyy 12h (default)", () => {
    expect(formatWatermarkDate("2024-06-15T14:30:00")).toBe("15-Jun-2024 02:30 PM");
  });
  it("formats dd/MM/yyyy 24h", () => {
    expect(formatWatermarkDate("2024-06-15T14:30:00", "dd/MM/yyyy", "24h")).toBe("15/06/2024 14:30");
  });
  it("formats yyyy-MM-dd 12h", () => {
    expect(formatWatermarkDate("2024-01-01T00:05:00", "yyyy-MM-dd", "12h")).toBe("2024-01-01 12:05 AM");
  });
});
describe("formatLatLngWM hemisphere", () => {
  it("appends N/E for north-east", () => {
    expect(formatLatLngWM(27.608123, 75.151703)).toBe("27.608123N 75.151703E");
  });
  it("appends S/W for south-west", () => {
    expect(formatLatLngWM(-33.856784, -151.215297)).toBe("33.856784S 151.215297W");
  });
  it("handles zero", () => {
    expect(formatLatLngWM(0, 0)).toBe("0.000000N 0.000000E");
  });
});
```
  Remove the old `formatLatLngWM` expectations that assert the comma form (lines 89–97 in the current test).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Write failing tests for `watermarkLayout.ts`.** `src/__tests__/utils/watermarkLayout.test.ts`:
```ts
import { composeWatermarkLines, gpsAccuracyCategory, formatGpsAccuracyLine, gpsPillText } from "@/src/utils/watermarkLayout";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";

const base = {
  siteId: "SIK/001",
  timestampIso: "2026-08-05T18:02:00",
  latitude: 27.608123,
  longitude: 75.151703,
  accuracyM: 12,
  addressLines: ["Police Lines", "Sikar"],
  settings: DEFAULT_WATERMARK_SETTINGS,
};

describe("composeWatermarkLines", () => {
  it("composes SiteID / Date / LatLng / Accuracy / Address in order", () => {
    expect(composeWatermarkLines(base)).toEqual([
      "SIK/001",
      "05-Aug-2026 06:02 PM",
      "27.608123N 75.151703E",
      "Accuracy : ±12 m",
      "Police Lines",
      "Sikar",
    ]);
  });
  it("uses 24h and dd/MM/yyyy when configured", () => {
    expect(composeWatermarkLines({ ...base, settings: { ...DEFAULT_WATERMARK_SETTINGS, dateFormat: "dd/MM/yyyy", timeFormat: "24h" } })).toEqual([
      "SIK/001", "05/08/2026 18:02", "27.608123N 75.151703E", "Accuracy : ±12 m", "Police Lines", "Sikar",
    ]);
  });
  it("omits accuracy when showGpsAccuracy is false", () => {
    const lines = composeWatermarkLines({ ...base, settings: { ...DEFAULT_WATERMARK_SETTINGS, showGpsAccuracy: false } });
    expect(lines).not.toContain("Accuracy : ±12 m");
  });
  it("omits accuracy when accuracyM is null", () => {
    const lines = composeWatermarkLines({ ...base, accuracyM: null });
    expect(lines).not.toContain("Accuracy : ±12 m");
  });
  it("omits address lines when showAddress is false", () => {
    const lines = composeWatermarkLines({ ...base, settings: { ...DEFAULT_WATERMARK_SETTINGS, showAddress: false } });
    expect(lines).not.toContain("Police Lines");
  });
  it("shows the acquiring placeholder when coords are null", () => {
    const lines = composeWatermarkLines({ ...base, latitude: null, longitude: null, accuracyM: null });
    expect(lines).toEqual(["SIK/001", "05-Aug-2026 06:02 PM", "Acquiring GPS…"]);
  });
});

describe("gpsAccuracyCategory", () => {
  it("is high ≤15, medium ≤30, low >30", () => {
    expect(gpsAccuracyCategory(15)).toBe("high");
    expect(gpsAccuracyCategory(16)).toBe("medium");
    expect(gpsAccuracyCategory(30)).toBe("medium");
    expect(gpsAccuracyCategory(31)).toBe("low");
  });
});

describe("formatGpsAccuracyLine", () => {
  it("formats rounded accuracy", () => {
    expect(formatGpsAccuracyLine(12.4)).toBe("Accuracy : ±12 m");
    expect(formatGpsAccuracyLine(12.6)).toBe("Accuracy : ±13 m");
  });
});

describe("gpsPillText", () => {
  it("shows accuracy when fixed", () => {
    expect(gpsPillText("fixed", 12)).toBe("GPS OK · ±12 m");
  });
  it("shows plain status when fixed but accuracy unknown", () => {
    expect(gpsPillText("fixed", null)).toBe("GPS OK");
  });
  it("shows denied and acquiring states", () => {
    expect(gpsPillText("denied", null)).toBe("GPS denied");
    expect(gpsPillText("acquiring", null)).toBe("Acquiring GPS…");
  });
});
```
- [ ] **Step 4: Run to verify failure.**
- [ ] **Step 5: Update `useAddressLookup` behavior test.** In `src/__tests__/components/camera/useAddressLookup.test.tsx`, change the "shows Address Unavailable when geocoding fails" test to expect `[]`:
```ts
it("hides the address when geocoding fails (never shows errors)", async () => {
  __setMockReverseGeocode(null);
  await TestRenderer.act(async () => { tree = TestRenderer.create(<DriverHost />); });
  await TestRenderer.act(async () => { setDriverCoords!({ latitude: 27.6, longitude: 75.15 }); });
  await flush();
  expect(lastLines).toEqual([]);
});
```
  Remove the `ADDRESS_UNAVAILABLE` import.
- [ ] **Step 6: Run to verify failure.**
- [ ] **Step 7: Implement the formatters in `photoUtils.ts`.** Import types `WatermarkDateFormat`, `WatermarkTimeFormat` via `import type` from `@/src/utils/watermarkSettings`. Implement `formatDatePart`, `formatTimePart`, rewrite `formatWatermarkDate(iso, dateFormat = "dd-MMM-yyyy", timeFormat = "12h")`, rewrite `formatLatLngWM` with hemisphere letters using `Math.abs`. The `dd-MMM-yyyy` month array is already in the file.
- [ ] **Step 8: Implement `src/utils/watermarkLayout.ts`.** Import `formatWatermarkDate`, `formatLatLngWM` from `photoUtils` and `type { WatermarkSettings }` from `watermarkSettings`. Implement `composeWatermarkLines` exactly as tested:
  `[siteId, formatWatermarkDate(timestampIso, df, tf)]`; if coords null → `"Acquiring GPS…"`, else push `formatLatLngWM` and (if `showGpsAccuracy && accuracyM != null`) `formatGpsAccuracyLine`; then if `showAddress` push `...addressLines`. Export `gpsAccuracyCategory`, `formatGpsAccuracyLine`, `GPS_CATEGORY_COLORS`, `gpsPillText`.
- [ ] **Step 9: Update `useAddressLookup.ts`.** Remove `ADDRESS_UNAVAILABLE`. On `formatAddressLines` returning empty OR on rejection → `setLines([])` (never cache a failure). Keep `RESOLVING_ADDRESS` for the transient state. Do NOT update the cache on failure.
- [ ] **Step 10: Update `WatermarkOverlay.tsx`.** Change props to `{ width, height, lines }`; build `const linesRender = lines;` and render exactly the current visual (metrics stay local for now — Phase 4 moves them). Remove the `poleId/districtBlock/dateLine/gpsLine/addressLines` props.
- [ ] **Step 11: Update `capture.tsx`.** Import `useWatermarkSettings`, `composeWatermarkLines`; remove the `ADDRESS_UNAVAILABLE` import; compute settings from context. Compute once for the overlay:
```tsx
const previewLines = composeWatermarkLines({
  siteId: values.pole_id || "NA",
  timestampIso: now.toISOString(),
  latitude: gps.coords?.latitude ?? null,
  longitude: gps.coords?.longitude ?? null,
  accuracyM: gps.accuracyM,
  addressLines,
  settings,
});
```
  Render `<WatermarkOverlay width={cameraSize.width} height={cameraSize.height} lines={previewLines} />`. In `handleShutter`, replace the inline `lines` array with:
```tsx
const lines = composeWatermarkLines({
  siteId: poleId,
  timestampIso: timestamp,
  latitude: coords.latitude,
  longitude: coords.longitude,
  accuracyM: gps.accuracyM,
  addressLines,
  settings,
});
```
  Update `resolvedAddress` to drop the `ADDRESS_UNAVAILABLE` branch (keep the `RESOLVING_ADDRESS` guard).
- [ ] **Step 12: Update `WatermarkOverlay.test.tsx`** to pass `lines` instead of individual props. Add one assertion that the rendered lines match the input array order (the existing `collectStrings` helper still works). Add a case for a 7-line input mirroring the spec example (`SIK/001`, date, `27.608123N 75.151703E`, `Accuracy : ±12 m`, `Police Lines`, `Sikar`, `Rajasthan`).
- [ ] **Step 13: Add the `watermarkLayout.ts` coverage threshold** to `jest.config.js`.
- [ ] **Step 14: Run all gates** (tsc, eslint, jest full). Then **performance verification on device**: build, capture 5 photos, confirm `[Perf:watermark] ... captureToSaved=...ms` ≤ 1000ms and lines in the saved image match the spec example layout. This phase changes visible content only — no pipeline change — but the perf gate is mandatory per constraint 7.
- [ ] **Step 15: Commit.**
```bash
cd frontend
git add src/components/inspection/photoUtils.ts src/utils/watermarkLayout.ts src/components/camera/useAddressLookup.ts src/components/camera/WatermarkOverlay.tsx app/inspection/capture.tsx jest.config.js src/__tests__/components/inspection/photoUtils.test.ts src/__tests__/utils/watermarkLayout.test.ts src/__tests__/components/camera/useAddressLookup.test.tsx src/__tests__/components/camera/WatermarkOverlay.test.tsx
git commit -m "feat(watermark): watermark content per UI spec layout"
```

---

## Phase 4: Configurable WYSIWYG Watermark Appearance

**Goal:** The watermark's size, position, background opacity, text color, corner radius, font, and shadow become configurable and render **identically** in the preview overlay and the canvas renderer. The renderer receives the resolved style config inside the existing `injectJavaScript` payload — the static page keeps no duplicated maps, so drift is impossible.

**Files:**
- Create: `src/utils/watermarkStyle.ts`
- Modify: `src/utils/watermarkHtml.ts`
- Modify: `src/components/camera/WatermarkOverlay.tsx`
- Modify: `src/components/inspection/useWatermarkProcessor.ts`
- Modify: `app/inspection/capture.tsx`
- Modify: `jest.config.js` (threshold for `watermarkStyle.ts`)
- Test: `src/__tests__/utils/watermarkStyle.test.ts` (new), `src/__tests__/utils/watermarkHtml.test.ts` (update), `src/__tests__/components/camera/WatermarkOverlay.test.tsx` (update), `src/__tests__/components/inspection/useWatermarkProcessor.test.tsx` (extend)

**Interfaces produced:**
```ts
// src/utils/watermarkStyle.ts (new)
export interface WatermarkStyleConfig {
  fontScale: number;      // 0.8 | 1.0 | 1.25
  position: WatermarkPosition;
  bgOpacity: number;      // 0.2..0.8
  textColor: string;      // resolved hex
}
export const WATERMARK_SIZE_FONT_SCALE: Record<WatermarkSize, number>; // { small:0.8, medium:1.0, large:1.25 }
export const WATERMARK_TEXT_COLORS: Record<WatermarkTextColor, string>; // { green:"#76FF03", white:"#FFFFFF", yellow:"#FFEB3B" }
export function toWatermarkStyleConfig(s: WatermarkSettings): WatermarkStyleConfig;
export interface WatermarkMetrics { fSize: number; lh: number; padY: number; rPad: number; gapX: number; gapY: number; corner: number; }
export function computeWatermarkMetrics(width: number, height: number, config: WatermarkStyleConfig): WatermarkMetrics;
```
```ts
// src/utils/watermarkHtml.ts (changed signature)
export function buildRenderWatermarkScript(photoId: number, imageBase64: string, lines: string[], style?: WatermarkStyleConfig): string;
```
```ts
// src/components/inspection/useWatermarkProcessor.ts (changed)
export function enqueueWatermark(photoId: number, inputPath: string, fileName: string, lines: string[], style: WatermarkStyleConfig): void;
```

**Metrics formula (mirror of today, plus font scale and corner; `corner` class = 12px at the current default preview scale):**
```
baseSize = min(width, height)
fSize    = max(22, round(baseSize/18 * config.fontScale))
lh       = round(fSize*1.15)
padY     = round(fSize*0.35)
rPad     = round(fSize*0.4)
gapX     = max(16, round(fSize*0.75))
gapY     = max(20, round(fSize*1.0))
corner   = max(4, round(fSize*0.2))
```
Background: `rgba(0,0,0,config.bgOpacity)`; text: `config.textColor`, bold, `sans-serif`; small box shadow `0 2px 8px rgba(0,0,0,0.35)`; small text shadow (existing `rgba(0,0,0,0.9)` 1px/2). Position: `bottomRight` puts `right: gapX` (box anchored `cv.width-rw-gapX`), else `left: gapX`.

- [ ] **Step 1: Write failing tests for `watermarkStyle.ts`.**
`src/__tests__/utils/watermarkStyle.test.ts`:
```ts
import {
  computeWatermarkMetrics,
  toWatermarkStyleConfig,
  WATERMARK_SIZE_FONT_SCALE,
  WATERMARK_TEXT_COLORS,
} from "@/src/utils/watermarkStyle";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";

describe("toWatermarkStyleConfig", () => {
  it("resolves defaults to the current visual", () => {
    expect(toWatermarkStyleConfig(DEFAULT_WATERMARK_SETTINGS)).toEqual({
      fontScale: 1, position: "bottomLeft", bgOpacity: 0.5, textColor: "#76FF03",
    });
  });
  it("resolves overrides", () => {
    expect(toWatermarkStyleConfig({ ...DEFAULT_WATERMARK_SETTINGS, size: "large", position: "bottomRight", opacity: 0.8, textColor: "yellow" })).toEqual({
      fontScale: 1.25, position: "bottomRight", bgOpacity: 0.8, textColor: "#FFEB3B",
    });
  });
  it("maps all size and color options", () => {
    expect(WATERMARK_SIZE_FONT_SCALE).toEqual({ small: 0.8, medium: 1.0, large: 1.25 });
    expect(WATERMARK_TEXT_COLORS).toEqual({ green: "#76FF03", white: "#FFFFFF", yellow: "#FFEB3B" });
  });
});

describe("computeWatermarkMetrics", () => {
  it("keeps the medium scale identical to the current default at 1080x1920", () => {
    expect(computeWatermarkMetrics(1080, 1920, { fontScale: 1, position: "bottomLeft", bgOpacity: 0.5, textColor: "#76FF03" })).toEqual({
      fSize: 60, lh: 69, padY: 21, rPad: 24, gapX: 45, gapY: 60, corner: 12,
    });
  });
  it("scales font by the size factor", () => {
    const small = computeWatermarkMetrics(1080, 1920, { fontScale: 0.8, position: "bottomLeft", bgOpacity: 0.5, textColor: "#76FF03" });
    const large = computeWatermarkMetrics(1080, 1920, { fontScale: 1.25, position: "bottomLeft", bgOpacity: 0.5, textColor: "#76FF03" });
    expect(small.fSize).toBe(48);
    expect(large.fSize).toBe(75);
  });
  it("applies the corner radius class", () => {
    expect(computeWatermarkMetrics(4000, 3000, { fontScale: 1, position: "bottomLeft", bgOpacity: 0.5, textColor: "#76FF03" }).corner).toBe(33);
  });
});
```
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Write failing tests for the renderer script.** Update `src/__tests__/utils/watermarkHtml.test.ts`:
  - `buildRenderWatermarkScript(1, "data", ["x"], { fontScale: 1.25, position: "bottomRight", bgOpacity: 0.8, textColor: "#FFEB3B" })` → assert `script` contains `"style":{"fontScale":1.25,"position":"bottomRight","bgOpacity":0.8,"textColor":"#FFEB3B"}` (JSON key order follows property order).
  - `buildRenderWatermarkScript(1, "data", ["x"])` (no style) → assert `script` does NOT contain `"style"`.
  - The WYSIWYG mirror test (currently asserting `fSize=Math.max(22,Math.round(baseSize/18))` and `roundRect(ctx,rx,ry,rw,rh,8)`) must be updated to assert the new formula strings: `"var fSize=Math.max(22,Math.round(baseSize/18*style.fontScale));"`, `"var corner=Math.max(4,Math.round(fSize*0.2));"`, `"ctx.font='bold '+fSize+'px sans-serif';"`, and `"if(style.position==='bottomRight'){rx=cv.width-rw-gapX;}else{rx=gapX;}"`.
  - Keep the existing assertions that the page still emits `{__ready:true}`, `decode:`, `draw:`, `encode:`, `window.ReactNativeWebView.postMessage(JSON.stringify({photoId:photoId,base64:raw,perf:`, and `'image/jpeg',0.95`.
- [ ] **Step 4: Run to verify failure.**
- [ ] **Step 5: Write the processor style-flow test.** Extend `src/__tests__/components/inspection/useWatermarkProcessor.test.tsx`. Mock `@/src/utils/watermarkHtml` is NOT needed; instead drive the real flow:
```tsx
it("passes the style config into the injected render script", async () => {
  const result = renderHookInProvider(() => useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() }));
  const webviewRef = result.current.webViewRef;
  const injectJavaScript = jest.fn();
  (webviewRef as unknown as { current: { injectJavaScript: jest.Mock } }).current = { injectJavaScript } as never;
  (require("expo-file-system/legacy").readAsStringAsync as jest.Mock).mockResolvedValueOnce("b64data");
  result.current.handleWebViewMessage({ nativeEvent: { data: JSON.stringify({ __ready: true }) } } as never);
  result.current.enqueueWatermark(9, "file:///tmp/a.jpg", "a.jpg", ["L1"], { fontScale: 1.25, position: "bottomRight", bgOpacity: 0.8, textColor: "#FFEB3B" });
  await flushMicrotasks();
  expect(injectJavaScript).toHaveBeenCalledWith(expect.stringContaining('"style":{"fontScale":1.25'));
});
```
  Add a `flushMicrotasks` helper (`await new Promise((r) => setTimeout(r, 50))` inside an async act). The mock for `expo-file-system/legacy` already stubs `readAsStringAsync`.
- [ ] **Step 6: Run to verify failure.**
- [ ] **Step 7: Implement `src/utils/watermarkStyle.ts`** with the exact interfaces and formula above. `toWatermarkStyleConfig` returns a fresh object each call.
- [ ] **Step 8: Update `src/utils/watermarkHtml.ts`.**
  - `buildRenderWatermarkScript(photoId, imageBase64, lines, style?)`: include `style` in the payload object **only when provided** (spread conditionally), keep the sanitize + U+2028/2029 escaping.
  - `buildWatermarkRendererPage()`: the embedded JS `renderWatermark(photoId, imageBase64, lines, style)` — default `style = { fontScale: 1, position: "bottomLeft", bgOpacity: 0.5, textColor: "#76FF03" }` when falsy; compute metrics per the formula above (with `style.fontScale`); `font = 'bold ' + fSize + 'px sans-serif'`; corner from formula; box shadow (set `ctx.shadowColor='rgba(0,0,0,0.35)', shadowBlur=8, shadowOffsetY=2` before the box fill, reset after); text shadow exactly as today; `rx` = `cv.width-rw-gapX` for `bottomRight` else `gapX`; **keep the exact perf timings** (`t0/tSet/tDecode/tDraw/tEncode`) and the same `postMessage` payload shape with `decode/draw/encode/total`. `renderWatermarkFromJson` passes `payload.style || {}` through.
- [ ] **Step 9: Update `WatermarkOverlay.tsx`.** Props become `{ width, height, lines, settings: WatermarkSettings }`. Compute `config = toWatermarkStyleConfig(settings)` and `m = computeWatermarkMetrics(width, height, config)` (import from `watermarkStyle`; delete the local `computeWatermarkMetrics`). Render the box absolutely positioned at `bottom: m.gapY`, `left/right: m.gapX` per `config.position`, `paddingVertical: m.padY`, `paddingHorizontal: m.rPad`, `borderRadius: m.corner`, `backgroundColor: rgba(0,0,0,config.bgOpacity)`, `boxShadow: "0 2px 8px rgba(0,0,0,0.35)"`. Text style: `color: config.textColor`, `fontFamily: "sans-serif"`, existing text shadow. Keep `pointerEvents="none"`.
- [ ] **Step 10: Update `useWatermarkProcessor.ts`.** Add `style: WatermarkStyleConfig` to `WatermarkJob`; `enqueueWatermark(photoId, inputPath, fileName, lines, style)` stores it; `retryWatermark` uses `job.style`; `processNext` calls `buildRenderWatermarkScript(job.photoId, base64, job.lines, job.style)`.
- [ ] **Step 11: Update `capture.tsx`.** In `handleShutter`, `enqueueWatermark(photoId, result.uri, fileName, lines, toWatermarkStyleConfig(settings))`. Pass `settings={settings}` to `WatermarkOverlay`. Import `toWatermarkStyleConfig` from `watermarkStyle`.
- [ ] **Step 12: Add the `watermarkStyle.ts` coverage threshold** to `jest.config.js`.
- [ ] **Step 13: Run all gates** (tsc, eslint, jest). **Critical device perf verification:** build, capture 10 photos, verify `captureToSaved` average ≤ 1000ms and no stage regression >50ms vs baseline; verify a `Large`/`bottomRight`/`yellow` watermark looks identical between preview and saved image (WYSIWYG).
- [ ] **Step 14: Commit.**
```bash
cd frontend
git add src/utils/watermarkStyle.ts src/utils/watermarkHtml.ts src/components/camera/WatermarkOverlay.tsx src/components/inspection/useWatermarkProcessor.ts app/inspection/capture.tsx jest.config.js src/__tests__/utils/watermarkStyle.test.ts src/__tests__/utils/watermarkHtml.test.ts src/__tests__/components/camera/WatermarkOverlay.test.tsx src/__tests__/components/inspection/useWatermarkProcessor.test.tsx
git commit -m "feat(watermark): configurable WYSIWYG watermark appearance"
```

---

## Phase 5: GPS Accuracy Header Indicator

**Goal:** The camera status pill shows the live accuracy and colors it by the High/Medium/Low thresholds from the spec (≤15m green, 16–30m yellow, >30m red). Pure helpers were added in Phase 3; this phase wires them into the capture screen UI.

**Files:**
- Modify: `app/inspection/capture.tsx` (GPS pill)
- Test: `src/__tests__/utils/watermarkLayout.test.ts` (add `GPS_CATEGORY_COLORS` coverage if missing)

**Interfaces consumed:** `gpsPillText(status, accuracyM)` and `GPS_CATEGORY_COLORS[gpsAccuracyCategory(accuracyM)]` from `watermarkLayout`.

- [ ] **Step 1: Write failing tests** (extend `watermarkLayout.test.ts`):
```ts
import { GPS_CATEGORY_COLORS } from "@/src/utils/watermarkLayout";
it("maps accuracy categories to spec colors", () => {
  expect(GPS_CATEGORY_COLORS).toEqual({ high: "#76FF03", medium: "#FFEB3B", low: "#FF5252" });
});
```
- [ ] **Step 2: Run to verify failure** (only if the export is missing — Phase 3 already defines it, so this step may already pass; adjust accordingly).
- [ ] **Step 3: Update the GPS pill in `capture.tsx`.** Replace the pill `Text` with:
```tsx
<View style={styles.gpsPill}>
  <Text style={[styles.gpsPillText, { color: gps.color }]}>{gpsPillText(gps.status, gps.accuracyM)}</Text>
</View>
```
  where `gps.color` is derived once in render:
```tsx
const gpsPillColor =
  gps.status === "fixed" && gps.accuracyM != null
    ? GPS_CATEGORY_COLORS[gpsAccuracyCategory(gps.accuracyM)]
    : gps.status === "denied"
    ? "#FF5252"
    : "#FFEB3B";
```
  Remove the now-unused `gpsLine` variable if it becomes dead after Phase 3 (verify; the overlay no longer takes `gpsLine`).
- [ ] **Step 4: Run all gates** (tsc, eslint, jest). Manual device verify: watch the pill color/text change as accuracy changes.
- [ ] **Step 5: Commit.**
```bash
cd frontend
git add app/inspection/capture.tsx src/__tests__/utils/watermarkLayout.test.ts
git commit -m "feat(camera): GPS accuracy indicator in status pill"
```

---

## Phase 6: Smart GPS Refresh

**Goal:** Implement the spec's refresh policy: refresh only when the fix is older than 10s, accuracy >25m, or movement >10m; run in background; never freeze the preview. Capture always uses a fresh, sufficiently-accurate fix.

**Files:**
- Modify: `src/components/camera/captureConfig.ts`
- Modify: `src/components/camera/useGpsTracker.ts`
- Modify: `app/inspection/capture.tsx` (shutter uses smart capture)
- Test: `src/__tests__/components/camera/useGpsTracker.test.tsx` (extend)

**Interfaces produced / changed:**
```ts
// src/components/camera/captureConfig.ts
export const GPS_REFRESH_AGE_MS: number;        // 10000  (fix older than this → refresh)
export const GPS_ACCURACY_REFRESH_M: number;    // 25     (worse than this → refresh)
export const GPS_MOVE_THRESHOLD_M: number;      // 10     (was 15; watch distance interval)
// GPS_STALE_MS stays 60000 and now ONLY gates last-known-cache acceptance.
```
```ts
// src/components/camera/useGpsTracker.ts (changed behavior)
captureGps(graceMs?: number): Promise<GpsFix | null>;   // returns cached fix only if fresh(≤10s) AND accuracy≤25m; otherwise fires one one-shot and resolves within grace
refreshNow(): Promise<GpsFix | null>;                   // forces one one-shot, returns fix or cached fallback
// return value additionally exposes: currentFix: GpsFix | null
```

- [ ] **Step 1: Write failing tests** in `src/__tests__/components/camera/useGpsTracker.test.tsx` (read the existing file first; it uses `__setMockLocation`/`__setMockLastKnown`/`__emitWatchLocation` from the expo-location mock). Add:
```tsx
it("returns a fresh usable cached fix without a new one-shot", async () => {
  __setMockLastKnown(1, 2, 5, 0);          // fresh, accuracy 5
  await act(...);                           // let the tracker settle on lastKnown
  const gps = result.current;
  const spy = jest.spyOn(Location, "getCurrentPositionAsync");
  const fix = await gps.captureGps(500);
  expect(fix).not.toBeNull();
  expect(spy).not.toHaveBeenCalled();
});

it("refreshes when the cached fix is older than 10s", async () => {
  __setMockLastKnown(1, 2, 5, 11_000);      // stale
  await act(...);
  const spy = jest.spyOn(Location, "getCurrentPositionAsync");
  __setMockLocation(3, 4, 6);               // new one-shot result
  const fix = await result.current.captureGps(500);
  expect(spy).toHaveBeenCalled();
  expect(fix?.latitude).toBe(3);
});

it("refreshes when accuracy is worse than 25m", async () => {
  __setMockLastKnown(1, 2, 40, 0);          // fresh but inaccurate
  await act(...);
  const spy = jest.spyOn(Location, "getCurrentPositionAsync");
  __setMockLocation(3, 4, 6);
  const fix = await result.current.captureGps(500);
  expect(spy).toHaveBeenCalled();
  expect(fix?.accuracyM).toBe(6);
});

it("refreshNow performs a one-shot and returns the fix", async () => {
  __setMockLocation(9, 9, 4);
  const fix = await result.current.refreshNow();
  expect(fix).not.toBeNull();
  expect(fix!.accuracyM).toBe(4);
});
```
  These tests need the existing harness structure (a Driver component capturing `useGpsTracker()` into a ref). Read and extend it; use `jest.spyOn` for `getCurrentPositionAsync` and reset with `__resetLocationState()` in `beforeEach`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Update `captureConfig.ts`** with the three constants; set `GPS_MOVE_THRESHOLD_M = 10`.
- [ ] **Step 4: Update `useGpsTracker.ts`.**
  - Add `isUsableFix(fix)`: `isLocationFresh(fix.timestamp, Date.now(), GPS_REFRESH_AGE_MS) && fix.accuracyM <= GPS_ACCURACY_REFRESH_M`.
  - Add `oneShotFix()` (internal): `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })`, accept if `isAcceptableFix`, return `GpsFix | null`, never throw.
  - Rewrite `captureGps`: if `fixRef.current` is usable → resolve it immediately. Else register a waiter (existing pattern) AND fire `oneShotFix()` once (guard with a `oneShotPendingRef`); waiters are resolved by `acceptFix` or the grace timeout.
  - Add `refreshNow()`: `const f = await oneShotFix(); return f ?? fixRef.current;`.
  - Change the polling interval to `GPS_REFRESH_AGE_MS`: every tick, if `fixRef.current` exists and is stale (`age > GPS_REFRESH_AGE_MS`) OR `accuracyM > GPS_ACCURACY_REFRESH_M`, fire `oneShotFix()` (background; does not await in the interval).
  - Watch `distanceInterval: GPS_MOVE_THRESHOLD_M` (now 10).
  - Expose `currentFix` (`fixRef.current`) in the returned object.
- [ ] **Step 5: Update `capture.tsx` shutter.** Replace the top of `handleShutter`:
```tsx
const fix = await gps.captureGps(GPS_GRACE_MS);
if (!fix) {
  Alert.alert("GPS is still being acquired", "Wait a moment and try again.", [{ text: "Wait" }, { text: "Cancel", style: "cancel" }]);
  return;
}
const coords = { latitude: fix.latitude, longitude: fix.longitude };
```
  Use `fix.accuracyM` for the accuracy line: pass `accuracyM: fix.accuracyM` to `composeWatermarkLines` in the shutter path (keep `gps.accuracyM` for the live preview). Remove the old `let coords = gps.coords; if (!coords) {...}` branch.
- [ ] **Step 6: Run all gates.** Manual device verify: with the phone idle, confirm no one-shots fire while the fix is fresh; confirm a one-shot fires after ~10s idle; confirm shutter never waits when GPS is fresh.
- [ ] **Step 7: Commit.**
```bash
cd frontend
git add src/components/camera/captureConfig.ts src/components/camera/useGpsTracker.ts app/inspection/capture.tsx src/__tests__/components/camera/useGpsTracker.test.tsx
git commit -m "feat(camera): smart GPS refresh per UI spec"
```

---

## Phase 7: Tap To Focus

**Goal:** Tapping the preview shows a focus reticle animation, triggers a GPS refresh, and updates the live watermark (spec flow: Tap → Focus → Auto Exposure → GPS Refresh → Update Live Watermark). Hardware focus-point control is not exposed by expo-camera v17 (D6).

**Files:**
- Create: `src/components/camera/TapToFocusOverlay.tsx`
- Modify: `app/inspection/capture.tsx`
- Test: `src/__tests__/components/camera/TapToFocusOverlay.test.tsx`

**Interfaces produced:**
```tsx
interface TapToFocusOverlayProps {
  onTap: (x: number, y: number) => void;
}
export default function TapToFocusOverlay({ onTap }: TapToFocusOverlayProps): JSX.Element;
// Full-size Pressable (absolute fill) with an animated reticle that appears at the tap point.
```

- [ ] **Step 1: Write failing tests.**
`src/__tests__/components/camera/TapToFocusOverlay.test.tsx`:
```tsx
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import TapToFocusOverlay from "@/src/components/camera/TapToFocusOverlay";

describe("TapToFocusOverlay", () => {
  it("calls onTap with the tap coordinates", () => {
    const onTap = jest.fn();
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(<TapToFocusOverlay onTap={onTap} />); });
    const press = tree.root.find((n) => n.props.testID === "tap-to-focus-area");
    act(() => { press.props.onPress({ nativeEvent: { locationX: 120, locationY: 340 } }); });
    expect(onTap).toHaveBeenCalledWith(120, 340);
  });

  it("shows a focus reticle after a tap", () => {
    const tree = TestRenderer.create(<TapToFocusOverlay onTap={jest.fn()} />);
    act(() => {
      tree.root.find((n) => n.props.testID === "tap-to-focus-area").props.onPress({ nativeEvent: { locationX: 10, locationY: 20 } });
    });
    expect(tree.root.findAll((n) => n.props.testID === "focus-reticle").length).toBeGreaterThan(0);
  });
});
```
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement `TapToFocusOverlay.tsx`.** Absolute-fill `Pressable` (`testID="tap-to-focus-area"`) behind the watermark overlay but in front of the camera. On press, set reticle state `{x,y}` and render a small bordered `View` (`testID="focus-reticle"`) at that point with an `Animated` scale-in/scale-out (RN core `Animated.spring`), clearing after ~600ms. Do NOT render the reticle until the first tap.
- [ ] **Step 4: Wire into `capture.tsx`.** Render `<TapToFocusOverlay onTap={handleTapFocus} />` inside `cameraWrap` between `CameraView` and `WatermarkOverlay`. `handleTapFocus`:
```tsx
const handleTapFocus = useCallback(() => {
  void gps.refreshNow();
  setNow(new Date());
}, [gps]);
```
  (refreshNow from Phase 6; `setNow` already triggers the live overlay date re-render, and acceptFix updates coords + accuracy which re-renders the overlay lines.)
- [ ] **Step 5: Run all gates.** Manual device verify: tap shows reticle, GPS pill re-freshes, live watermark coordinates update.
- [ ] **Step 6: Commit.**
```bash
cd frontend
git add src/components/camera/TapToFocusOverlay.tsx app/inspection/capture.tsx src/__tests__/components/camera/TapToFocusOverlay.test.tsx
git commit -m "feat(camera): tap-to-focus with GPS refresh"
```

---

## Phase 8: Camera Controls — Flash, Front/Rear, Pinch Zoom, Aspect Ratio

**Goal:** Flash (Auto/On/Off), camera switch (Front/Rear), pinch zoom (preview-only, D8), and aspect ratio (4:3/16:9). Manual Exposure is out of scope (D7).

**Files:**
- Create: `src/utils/cameraControls.ts`
- Create: `src/components/camera/CameraControlsBar.tsx`
- Modify: `src/components/camera/captureConfig.ts` (ratio constants)
- Modify: `app/inspection/capture.tsx` (state + CameraView props + pinch + ratio-driven wrap aspect)
- Modify: `app/_layout.tsx` (wrap in `GestureHandlerRootView` for pinch)
- Modify: `__mocks__/expo-camera.ts` (render props onto the View so tests can assert forwarded props)
- Modify: `jest.config.js` (threshold for `cameraControls.ts`)
- Test: `src/__tests__/utils/cameraControls.test.ts` (new), `src/__tests__/components/camera/CameraControlsBar.test.tsx` (new)

**Interfaces produced:**
```ts
// src/utils/cameraControls.ts
export type CameraFlashMode = "auto" | "on" | "off";
export type CameraFacing = "front" | "back";
export type CameraRatio = "4:3" | "16:9";
export const CAMERA_RATIOS: CameraRatio[];                 // ["4:3","16:9"]
export function nextFlashMode(current: CameraFlashMode): CameraFlashMode;  // auto→on→off→auto
export function nextRatio(current: CameraRatio): CameraRatio;              // 4:3→16:9→4:3
export function clampZoom(prev: number, pinchScale: number): number;       // clamp(prev + (scale-1)*0.5, 0, 1)
```
```tsx
interface CameraControlsBarProps {
  flash: CameraFlashMode;  onFlash: () => void;
  facing: CameraFacing;    onFacing: () => void;
  ratio: CameraRatio;      onRatio: () => void;
}
export default function CameraControlsBar(props: CameraControlsBarProps): JSX.Element;
```

- [ ] **Step 1: Write failing tests.**
`src/__tests__/utils/cameraControls.test.ts`:
```ts
import { nextFlashMode, nextRatio, clampZoom, CAMERA_RATIOS } from "@/src/utils/cameraControls";
describe("cameraControls", () => {
  it("cycles flash auto→on→off→auto", () => {
    expect(nextFlashMode("auto")).toBe("on");
    expect(nextFlashMode("on")).toBe("off");
    expect(nextFlashMode("off")).toBe("auto");
  });
  it("toggles ratio", () => {
    expect(CAMERA_RATIOS).toEqual(["4:3", "16:9"]);
    expect(nextRatio("4:3")).toBe("16:9");
    expect(nextRatio("16:9")).toBe("4:3");
  });
  it("clamps zoom into 0..1", () => {
    expect(clampZoom(0.5, 2)).toBeCloseTo(1, 5);
    expect(clampZoom(0.1, 0.5)).toBe(0);
    expect(clampZoom(0.5, 1)).toBe(0.5);
  });
});
```
`src/__tests__/components/camera/CameraControlsBar.test.tsx`:
```tsx
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import CameraControlsBar from "@/src/components/camera/CameraControlsBar";

describe("CameraControlsBar", () => {
  it("renders flash, facing and ratio buttons with current values", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(
      <CameraControlsBar flash="auto" facing="back" ratio="4:3" onFlash={jest.fn()} onFacing={jest.fn()} onRatio={jest.fn()} />
    ); });
    expect(tree.root.find((n) => n.props.testID === "ctrl-flash").props.accessibilityLabel).toContain("Flash");
    expect(tree.root.find((n) => n.props.testID === "ctrl-facing").props.accessibilityLabel).toContain("Back");
    expect(tree.root.find((n) => n.props.testID === "ctrl-ratio").props.accessibilityLabel).toContain("4:3");
  });

  it("invokes the callbacks on press", () => {
    const onFlash = jest.fn(); const onFacing = jest.fn(); const onRatio = jest.fn();
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(
      <CameraControlsBar flash="off" facing="back" ratio="16:9" onFlash={onFlash} onFacing={onFacing} onRatio={onRatio} />
    ); });
    act(() => { tree.root.find((n) => n.props.testID === "ctrl-flash").props.onPress(); });
    act(() => { tree.root.find((n) => n.props.testID === "ctrl-facing").props.onPress(); });
    act(() => { tree.root.find((n) => n.props.testID === "ctrl-ratio").props.onPress(); });
    expect(onFlash).toHaveBeenCalledTimes(1);
    expect(onFacing).toHaveBeenCalledTimes(1);
    expect(onRatio).toHaveBeenCalledTimes(1);
  });
});
```
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement `src/utils/cameraControls.ts`** with the pure functions above (no expo-camera import — the flash strings are the string union, which `CameraView` accepts).
- [ ] **Step 4: Implement `CameraControlsBar.tsx`.** A row of `IconButton`s (react-native-paper) with testIDs `ctrl-flash`, `ctrl-facing`, `ctrl-ratio`, accessibilityLabels including the current value (e.g. "Flash: Auto", "Camera: Back", "Ratio: 4:3"), `mode="contained"`, semi-transparent background.
- [ ] **Step 5: Update `__mocks__/expo-camera.ts`.** Change the inner render to `React.createElement(View, { ..._props, ref: undefined as never })` so forwarded props are inspectable, keeping the `useImperativeHandle` for `takePictureAsync`.
- [ ] **Step 6: Update `capture.tsx`.**
  - State: `const [facing, setFacing] = useState<CameraFacing>("back"); const [flash, setFlash] = useState<CameraFlashMode>("off"); const [zoom, setZoom] = useState(0); const [ratio, setRatio] = useState<CameraRatio>("4:3");`
  - `CameraView`: add `facing={facing} flash={flash} zoom={zoom} ratio={ratio}` (keep existing `ref`, `style`, `onLayout`-independent props).
  - `cameraWrap` aspect: `style={[styles.cameraWrap, { aspectRatio: ratio === "16:9" ? 9 / 16 : 3 / 4 }]}`.
  - Pinch: wrap the preview container with `GestureDetector`:
```tsx
const pinch = Gesture.Pinch().onUpdate((e) => setZoom((prev) => clampZoom(prev, e.scale)));
...
<GestureDetector gesture={pinch}>
  <View style={[styles.cameraWrap, { aspectRatio: ... }]} onLayout={...}>
    ...
  </View>
</GestureDetector>
```
  - Render `<CameraControlsBar flash={flash} onFlash={() => setFlash(nextFlashMode)} facing={facing} onFacing={() => setFacing(f => f === "back" ? "front" : "back")} ratio={ratio} onRatio={() => setRatio(nextRatio)} />` inside the camera wrap (bottom area), below the watermark overlay.
  - Import `Gesture`, `GestureDetector` from `react-native-gesture-handler`; import the three helpers from `cameraControls`.
- [ ] **Step 7: Wrap the root in `GestureHandlerRootView`** in `app/_layout.tsx` (outermost, around `PaperProvider`) so the pinch gesture works on Android.
- [ ] **Step 8: Add `CAMERA_RATIOS`/ratio default to `captureConfig.ts`** if useful for the wrap aspect (optional; the literal in `capture.tsx` is fine).
- [ ] **Step 9: Add the `cameraControls.ts` coverage threshold** to `jest.config.js`.
- [ ] **Step 10: Run all gates** (tsc, eslint, jest). Manual device verify: flash cycles, front camera mirrors, pinch zooms the preview, ratio switches the framing and the watermark overlay still overlays correctly in both ratios.
- [ ] **Step 11: Commit.**
```bash
cd frontend
git add src/utils/cameraControls.ts src/components/camera/CameraControlsBar.tsx src/components/camera/captureConfig.ts app/inspection/capture.tsx app/_layout.tsx __mocks__/expo-camera.ts jest.config.js src/__tests__/utils/cameraControls.test.ts src/__tests__/components/camera/CameraControlsBar.test.tsx
git commit -m "feat(camera): flash, camera switch, pinch zoom and aspect ratio controls"
```

---

## Self-Review against the UI spec

| Spec item | Where |
|-----------|-------|
| Watermark style: professional, compact, bottom-left, semi-transparent | Defaults in Phase 1/4; `computeWatermarkMetrics` unchanged-at-medium |
| Watermark layout: Site ID / Date / Lat/Long / Accuracy / Reverse address | Phase 3 `composeWatermarkLines` |
| "Coordinates always displayed"; offline hides address only, no error lines | Phase 3 (coords null → "Acquiring GPS…" only pre-fix; failure → `[]`) |
| Appearance: opacity 45–55%, 12px-class corners, small shadow, padding, bright green bold sans-serif, small text shadow | Phase 4 (`bgOpacity` default 0.5, `corner` class, box+text shadow, `sans-serif`, `#76FF03`) |
| WYSIWYG preview = saved | Phase 3 (single `lines` array) + Phase 4 (single `toWatermarkStyleConfig` injected into the renderer; metrics mirrored + tested) |
| Size small/medium/large, auto-scaled with resolution | Phase 4 `WATERMARK_SIZE_FONT_SCALE` × `baseSize/18` |
| Settings: size, position, opacity, text color, GPS accuracy on/off, reverse address on/off, date format, time format, remember preferences | Phases 1–2 |
| GPS accuracy header High/Med/Low thresholds + `Accuracy : ±12 m` watermark line | Phases 3, 5 |
| Reverse geocoding: cache, reuse ≤10m, offline hide, never block, never display errors | Phase 3 (existing cache kept; failure → hide) |
| Smart GPS refresh: >10s OR >25m OR >10m, background, never freeze preview | Phase 6 |
| Tap to focus → GPS refresh → live watermark update | Phase 7 (soft focus; hardware focus not in expo-camera v17 — D6) |
| Flash Auto/On/Off, Front/Rear, Pinch Zoom, Aspect Ratio 4:3/16:9, Highest Quality (full-res), Offline First | Phase 8 (+D5/D7/D8) |
| Folder structure DCIM/ACCC Inspection/<District>_<ProjectName> | Already implemented (`storageManager` + `folderNaming`); no work |
| UI principles / accessibility: large targets, contrast, one-handed | Phase 2/8 styling (paper controls, icon + label indicators) |
| Performance remains within perf spec | Every phase gate 7d; Phases 3 and 4 require device measurement |
