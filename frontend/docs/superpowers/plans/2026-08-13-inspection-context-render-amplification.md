# InspectionContext Render Amplification — Analysis & Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the ~470ms `[Perf:UI] stateUpdated → reactRenderEnd` gap (and shrink the `reactRenderEnd → uiReady` second commit) by removing render amplification through `InspectionContext`.

**Architecture:** The gap is two React render/commit cycles. Commit 1 is a `photoStates` context update that re-renders **every mounted consumer** (including the full inspection form screen stacked below the camera). Commit 2 is a local `useCaptureFlow` phase change re-rendering only the capture screen. Fix = split `photoStates` into its own context + derived `photosProcessing` boolean, stabilize callback identities, and memoize the heavy capture subtree.

**Tech Stack:** React Native (Expo), React 18 contexts, expo-router native stack, Jest + react-test-renderer.

## Global Constraints

- Never call `getGlobalDatabase()` during the inspection flow (ADR-014) — do not touch DB code in this work.
- All DB access stays in repositories; this work is UI/context-only.
- TypeScript strict; no `any`; no comments unless requested.
- Behavior must be identical — this is a perf pass, not a refactor of photo-state semantics.
- Full gate must stay green: `yarn test` (currently 72 suites / 835 pass / 1 skip), `npx tsc --noEmit`, `yarn lint`.
- `.npmrc` has `save-exact=true`; do not add dependencies — the plan intentionally uses only React primitives.

---

## Completed Analysis (evidence from code inspection)

### Render graph — InspectionContext consumers (9 production)

Mounted order during the measured window (capture pushed on top of the inspection form):

```
InspectionProvider (src/context/InspectionContext.tsx — value useMemo'd, recreated on ANY slice change)
├─ HomeScreen app/index.tsx                 {openProject, closeProject}
├─ ProjectDashboard app/projects/dashboard.tsx  {project}
│   └─ DashboardCardGrid, DashboardActionCards
├─ InspectionListScreen app/inspection/index.tsx {project}
│   └─ FlatList of Cards + ExportDialogs
├─ NewInspectionScreen app/inspection/new.tsx    {project, setProject, setInspectionDate,
│   │   setInspectionId, inspectionId, setPoleId, photoStates}   ← SUBSCRIBES TO photoStates DIRECTLY
│   ├─ GeneralInformation (useInspection) → FieldRenderer ×~10
│   ├─ SectionRenderer ×N (useInspection) → FieldRenderer ×~8 each, DeviceSection
│   │   └─ PhotoSection (useInspection + useWatermarkProcessor{photoStates})
│   │       └─ PhotoCard ×M + WatermarkMergeWebView
│   └─ Save/Cancel (depend on photosProcessing)
├─ CaptureScreen app/inspection/capture.tsx {project, poleId, photoStates}
│   ├─ CameraView (native view, un-memoized)
│   ├─ WatermarkOverlay (metrics/layout math every render; 1s clock tick)
│   ├─ WatermarkMergeWebView (unstable onMessage prop)
│   └─ useCaptureFlow — LOCAL reducer, NOT in context (verified: only capture.tsx imports it)
└─ WatermarkSettingsContext — separate tree, unaffected
```

### Answers to the 7 investigation questions

1. **Subscribers:** 9 consumers listed above (grep-verified). Only 4 touch `photoStates`: `useWatermarkProcessor` (2 instances), `capture.tsx`, `new.tsx`.
2. **Provider value recreated on every render?** No — `useMemo` (lines 82-103). **But** it is recreated whenever *any* slice changes (deps include `photoStates`), so a photo-states transition re-renders all 9 consumers, even dashboard/list screens that only read `project`.
3. **Large objects replaced wholesale?** `photoStates` map is spread-copied on every transition (`{...prev, [id]: state}`) — necessary but it trips the whole context. `flow` (useCaptureFlow) returns a brand-new object with new function identities every render.
4. **Callbacks unstable?** YES, three places: (a) `useCaptureFlow` action wrappers are inline arrows — new identity per render, breaking the merge-complete effect deps (capture.tsx:202) and any memoization; (b) capture.tsx:122 passes `onPhotosUpdated: () => {}` inline → `handleWebViewMessage` (deps `[project, onPhotosUpdated]`) is recreated per render → `WatermarkMergeWebView` receives a fresh `onMessage` every render; (c) `deletePhoto`/`handleCapture` etc. in PhotoSection are un-memoized (minor — not in the hot window).
5. **Does markMergeCompleted trigger a second full-context update?** NO. `flow` is local `useReducer` state in capture.tsx. `markMergeCompleted()` only re-renders capture.tsx (commit 2). The second context-wide update does not happen — commit 2's cost is purely the capture screen's own subtree.
6. **Can capture subscribe to a smaller context/selector?** Yes. It needs `project` (DistrictName in `handleShutter`/`previewLines`), `poleId` (values init), and `photoStates` (merge-complete effect). With a split, a `photoStates` update still re-renders capture (unavoidable — it must react), but no longer drags the form below.
7. **Largest render cost?** `new.tsx`'s full form tree — it subscribes to `photoStates` directly (line 57) for `photosProcessing` (line 64), so every photo-state transition re-renders ~80 FieldRenderers + PhotoCards + a second WebView. This dominates commit 1. Second: capture.tsx itself, paid twice (commits 1 and 2).

### Top 5 render amplifiers (share of the ~470ms commit 1)

| # | Amplifier | Evidence | Est. share | Est. savings |
|---|---|---|---|---|
| 1 | **new.tsx whole-form re-render per photoStates transition** | new.tsx:57,64 subscribes to the raw map; descendant consumers (GeneralInformation, SectionRenderer, PhotoSection) re-render via context | 55-65% (~260-310ms) | ~250-300ms once new.tsx subscribes to a derived boolean instead |
| 2 | **Flat provider value — any slice change re-renders all 9 consumers** | InspectionContext.tsx:82-103 deps include photoStates | 15-25% (capture + stacked screens share) | ~30-80ms from splitting contexts (dashboard/list skip photoStates updates) |
| 3 | **capture.tsx subtree un-memoized, paid in BOTH commits** | CameraView + WatermarkMergeWebView + WatermarkOverlay re-render in commit 1 and commit 2 | 10-15% per commit (~45-70ms × 2) | ~60-140ms total from memo + stable props |
| 4 | **Unstable callback identities** | useCaptureFlow.ts:56-66; capture.tsx:122 → handleWebViewMessage | 5-10% compounding | ~10-30ms + removes effect churn, enables #3 |
| 5 | **1s `setNow` tick re-renders capture.tsx + overlay math** | capture.tsx:148-151, WatermarkOverlay recompute | ~5% variance | stabilizes measurements; ~20-50ms when coincident |

### Verdict: split contexts, not selectors

- Three coherent consumer groups exist: **meta** (project/date/id/poleId), **photoStates** (map), **derived processing flag** (boolean). This maps 1:1 onto nested contexts.
- No selector infrastructure exists in the repo (no `useSyncExternalStore` anywhere); introducing a store pattern is a bigger change than a context split and adds an external dependency (forbidden by constraints).
- Provider nesting: `PhotoStatesProvider` OUTER → `InspectionProvider` (meta) INNER. `InspectionProvider`'s `closeProject` (line 69 `setPhotoStates({})`) consumes the outer context, so reset-on-close still works.
- `new.tsx`'s save-time need for the raw map (`validatePhotosForSave`, line 235) is handled by a ref-based getter exposed by `PhotoStatesProvider` (`getPhotoStatesRef`), so the screen never re-renders on map changes — only on the boolean flag.

### Concrete code locations

| File | Lines | Change |
|---|---|---|
| `src/context/InspectionContext.tsx` | 17-35, 51, 69, 82-103, 105-109 | Remove `photoStates`/`setPhotoStates` from meta context; add `PhotoStatesContext` (map + setter + ref getter + derived `photosProcessing` boolean). Export `usePhotoStates()`, `usePhotosProcessing()`, keep `useInspection()` meta-only |
| `app/_layout.tsx` | 9, provider wrap | No change needed if nesting is inside `InspectionProvider` export — prefer keeping it internal to the context file |
| `app/inspection/new.tsx` | 57, 64-66, 235 | Consume `usePhotosProcessing()` boolean; save-time map via ref getter (or `usePhotoStates()` read at save time through a callback) |
| `src/components/camera/useCaptureFlow.ts` | 56-66 | Wrap `beginCapture`/`markMergeCompleted`/`markMergeFailed`/`savedTimeout`/`retry`/`discard` in `useCallback` (deps: `dispatch` is stable) |
| `app/inspection/capture.tsx` | 51, 122, 192-202 | Split subscription (`useInspection()` meta + `usePhotoStates()`); `onPhotosUpdated: useCallback(() => {}, [])`; memoize banners; optional tick isolation (148-151) |
| `src/components/inspection/useWatermarkProcessor.ts` | 138 | `usePhotoStates()` instead of `useInspection().photoStates` |
| `src/components/inspection/PhotoSection.tsx` | 36, 76-82 | Meta from `useInspection()`, watermarkState from `usePhotoStates()` |
| `src/components/camera/WatermarkMergeWebView.tsx` | 13-40 | Wrap export in `React.memo` (props become stable once callbacks are) |
| `src/components/camera/WatermarkOverlay.tsx` | — | Optional: `React.memo` + isolate clock; only after Phases 1-4 verified |
| `src/__tests__/context/InspectionContext.test.tsx` | photoStates tests 177-199 | Move to a new `PhotoStatesContext` suite; meta suite unchanged |

---

## Implementation Phases

### Phase 1: Baseline measurement gate (no behavior change)

- [ ] **Step 1.1**: Confirm current probe timestamps. Capture 5 photos on device, record `stateUpdated → reactRenderEnd` and `reactRenderEnd → uiReady` deltas (release build) for both the 1st and 10th photo.
- [ ] **Step 1.2**: Commit the measured baseline numbers into the plan's completion record (used as the acceptance gate in every later phase).
- [ ] **Step 1.3**: Run the full gate once to confirm green starting state: `yarn test`, `npx tsc --noEmit`, `yarn lint`.

### Phase 2: Callback stability + memoization (lowest risk, zero behavior change)

- [ ] **Step 2.1**: `src/components/camera/useCaptureFlow.ts` — wrap the six action creators in `useCallback`. Tests: `src/__tests__/components/camera/useCaptureFlow.test.tsx` (already exists — add an assertion that `markMergeCompleted` identity is stable across renders).
- [ ] **Step 2.2**: `app/inspection/capture.tsx:122` — replace inline `onPhotosUpdated: () => {}` with a module-level no-op or `useCallback(() => {}, [])` so `handleWebViewMessage` becomes stable.
- [ ] **Step 2.3**: `src/components/camera/WatermarkMergeWebView.tsx` — wrap in `React.memo`.
- [ ] **Step 2.4**: Gate: `yarn test`, `tsc`, `lint`, then re-measure. Record deltas. Commit.

### Phase 3: Split contexts (behavior-preserving)

- [ ] **Step 3.1**: `src/context/InspectionContext.tsx` — add `PhotoStatesContext` (value: `{ photoStates, setPhotoStates, photosProcessing, getPhotoStatesRef }`), `usePhotoStates()`, `usePhotosProcessing()`; remove `photoStates`/`setPhotoStates` from `InspectionContextType` and its `useMemo` deps. `InspectionProvider` now consumes the outer `PhotoStatesContext` setter in `closeProject`.
- [ ] **Step 3.2**: Migrate consumers: `useWatermarkProcessor.ts:138`, `capture.tsx:51`, `PhotoSection.tsx`.
- [ ] **Step 3.3**: Tests — new `src/__tests__/context/PhotoStatesContext.test.tsx` mirroring the moved photoStates tests (lines 177-199) + derived `photosProcessing` flag behavior (pending/processing → true; all completed/failed → false); keep meta suite green.
- [ ] **Step 3.4**: Gate: `yarn test`, `tsc`, `lint`, re-measure. Record deltas. Commit.

### Phase 4: new.tsx subscription change (the big win)

- [ ] **Step 4.1**: `app/inspection/new.tsx` — drop `photoStates` from `useInspection()`; use `usePhotosProcessing()` for the Save button state (lines 64-66, 403).
- [ ] **Step 4.2**: Line 235 `validatePhotosForSave(photos, photoStates)` — read the latest map via `getPhotoStatesRef` (or `usePhotoStates()` held in a callback ref) so the screen has no map subscription.
- [ ] **Step 4.3**: Verify PhotoSection still updates live under the form (it consumes `usePhotoStates()` itself — PhotoCards must still flip to ✓/retry). Add/extend a test if none covers PhotoSection state display.
- [ ] **Step 4.4**: Gate: `yarn test`, `tsc`, `lint`, re-measure. **Target: `stateUpdated → reactRenderEnd` < 150ms.** Commit.

### Phase 5: Capture subtree polish (optional, only if target not met)

- [ ] **Step 5.1**: `WatermarkOverlay` — `React.memo` + stabilize `lines` (separate the ticking `now` into a leaf `<ClockLine>` so the 1s tick does not re-render CameraView/WebView).
- [ ] **Step 5.2**: Memoize the merge/saved/failed banner components in capture.tsx.
- [ ] **Step 5.3**: Gate: full suite + re-measure. Commit.

## Dependencies

- None external. React 18 built-ins only (`useMemo`, `useCallback`, `useContext`, `createContext`, `useRef`, `useState`).
- Existing probe instrumentation in `src/utils/perf.ts` (uiPerfStage/probe registry) is the measurement harness — no new instrumentation needed except per-commit delta logging if desired.

## Risks

- HIGH: **Navigation-stack assumptions** — the analysis assumes `new.tsx` is mounted below `capture.tsx` (verified: PhotoSection pushes capture). If other screens are stacked (list/dashboard), the split still wins because fewer consumers re-render, but absolute savings vary. Mitigation: measurement gate before/after each phase; the fix direction is load-bearing either way.
- MEDIUM: **Context nesting order** — `PhotoStatesProvider` must wrap the meta provider so `closeProject` can clear states. Getting this wrong breaks project-close reset. Mitigation: existing `InspectionContext.test.tsx` "clears photoStates when closing the project" test moved to the new suite catches it.
- MEDIUM: **new.tsx save validation** — reading the map via ref instead of context could return stale data if mis-wired. Mitigation: ref is updated synchronously inside `setPhotoStates`'s functional update path; add a unit test asserting `getPhotoStatesRef` sees the latest map immediately after a set.
- LOW: **WebView remount risk** — `React.memo` + stable props must not change WebView mount behavior (renderer persistence is critical to watermark warmup). Mitigation: memo keeps the same element type and props; existing useWatermarkProcessor lifecycle tests (835-suite) cover remount safety.
- LOW: Behavior drift in `photosProcessing` derivation (pending/processing vs completed/failed) — keep the same predicate, just relocated.

## Estimated Complexity

- Phase 1: LOW (~15 min)
- Phase 2: LOW (~30 min)
- Phase 3: MEDIUM (~1-1.5 h incl. new test suite)
- Phase 4: MEDIUM (~45 min + test adjustments)
- Phase 5: LOW-MEDIUM (~45 min, optional)
- Total: MEDIUM (~3-4 h end-to-end incl. two device measurement runs)

## Success Criteria

- [ ] `[Perf:UI] stateUpdated → reactRenderEnd` drops from ~470ms to **< 150ms** (target) — measure on same device/photo count as baseline.
- [ ] `reactRenderEnd → uiReady` (commit 2) measurably shrinks via Phases 2-3.
- [ ] `yarn test` full suite green (72 suites / 835+ pass), `tsc --noEmit` clean, `lint` 0 errors.
- [ ] Photo-state behavior identical: pending→processing→completed/failed flow, retry, discard, save-blocking while processing, project-close reset.
- [ ] No dependency added; no DB/`getGlobalDatabase()` usage touched.
