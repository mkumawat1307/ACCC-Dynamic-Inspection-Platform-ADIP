# Design: Dashboard Auto-Refresh

## Purpose

Make the project dashboard reload its statistic cards automatically when the inspection data it
displays changes, without manual refresh or navigating away. This is the first sub-project of the
full dashboard roadmap (see "Out of Scope").

The dashboard already reloads on every screen focus (`useFocusEffect` in `app/projects/dashboard.tsx`).
This spec adds four more triggers:

1. **Inspection data-change events** — repositories signal the dashboard the moment inspection data is
   written (create / save / status change / delete).
2. **App foreground return** — reload when the app returns from the background.
3. **Midnight rollover** — re-evaluate "Today's" cards when the date rolls to a new day while the app is open.
4. **Periodic poll** — reload every 60s while the dashboard screen is focused (backstop for anything
   the event path misses).

## Requirements (confirmed with user)

- Repository-layer event bus (not UI-screen emits, not poll-only).
- All four triggers above are in scope.
- 60s polling cadence, active **only while the dashboard screen is focused**; other triggers fire regardless.
- Strict project isolation: a data change in one project must never refresh another project's dashboard.
- No database schema changes; no new runtime dependencies.
- Writes must not be swallowed: a failing repository write still throws before any event is emitted.

## Context (verified in code)

- `DashboardCardGrid.tsx` loads via `DashboardService.getEnabledCardsWithCounts(projectId)` on
  `[projectId, reloadKey]`. `dashboard.tsx` bumps `reloadKey` via `useFocusEffect`. The grid keeps its
  `reloadKey` prop as an extra manual trigger.
- `useIsFocused()` requires a navigation context; the grid is unit-tested by rendering it directly with
  `react-test-renderer` (no navigation provider), so focus state is passed in as a prop rather than read
  inside the grid. `app/projects/dashboard.tsx` (a screen inside the navigator) owns the `useIsFocused()` call.
- `InspectionRepository` (`src/database/repositories/InspectionRepository.ts`) is the only write path for
  inspection data: `createInspection`, `saveFieldValue`, `updateInspectionPoleId`, `updateInspectionStatus`,
  `deleteInspection`, `deleteMultipleInspections`. The write-only methods receive `inspectionId`, not
  `projectId`; `getInspectionProjectId(inspectionId)` (line 364) resolves the project for the event.
- `AppState` (React Native) and `useIsFocused()` (`@react-navigation/native`, already a dependency) are
  available. No existing event/notification mechanism exists in the codebase.
- Tests use `react-test-renderer` directly (no testing-library). Jest `fake timers` are available.
- ADR-014 prohibits calling `getGlobalDatabase()` during the inspection flow; reading the **project** DB
  (which `DashboardService` does) is safe because it uses the same sequential project handle.

## Architecture

```text
InspectionRepository  ──emit──▶  InspectionDataBus (pub/sub, module-level)
                                      │  event: { projectId }
                                      ▼
                  useDashboardAutoRefresh(projectId)  ── reloadKey counter ──▶  DashboardCardGrid
                      ▲ triggers: bus events (project-filtered),
                      │            AppState "active",
                      │            midnight timer (self-rescheduling),
                      │            60s poll while focused (useIsFocused)
```

### New files

| File | Purpose |
|------|---------|
| `src/utils/InspectionDataBus.ts` | Zero-dependency pub/sub signal bus |
| `src/hooks/useDashboardAutoRefresh.ts` | Bundles all four triggers into a `reloadKey` counter |
| `src/__tests__/utils/InspectionDataBus.test.ts` | Bus unit tests |
| `src/__tests__/hooks/useDashboardAutoRefresh.test.tsx` | Hook trigger tests (probe component, fake timers, mocked AppState) |
| `src/__tests__/repositories/InspectionRepository.test.ts` | Asserts emits after each mutation |
| `src/utils/SmartCardGenerator.ts` | Auto-creates Total + Today cards from a selected inspection form field |
| `src/components/dashboard/DashboardCardManager.tsx` | Smart Add Card flow + Custom Card manual editor |
| `src/__tests__/utils/SmartCardGenerator.test.ts` | Unit tests for SmartCardGenerator |
| `src/__tests__/components/dashboard/DashboardCardManager.test.tsx` | Tests for Smart Add Card flow and Custom Card editor |

### Modified files

| File | Change |
|------|--------|
| `src/database/repositories/InspectionRepository.ts` | Emit `inspections-changed` after each successful mutation |
| `src/components/dashboard/DashboardCardGrid.tsx` | Accept optional `focused` prop (default `true`); use `useDashboardAutoRefresh(projectId, focused)`; load on `[projectId, reloadKey, autoKey]` |
| `app/projects/dashboard.tsx` | Pass `focused={useIsFocused()}` to the grid (screen already inside the navigator; its `useFocusEffect` stays) |
| `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx` | Add bus-triggered reload case (mock bus + service) |
| `docs/07-Changelog.md` | Entry |

`DashboardCardManager` now supports the Smart Add Card flow: selecting a field from the inspection form auto-creates Total + Today cards via `SmartCardGenerator`, and the Custom Card option opens a manual editor.

## Event Bus (`InspectionDataBus`)

Plain module, no React, no DB, no state beyond a listener set.

```ts
interface InspectionChangeEvent { projectId: number }

export const InspectionDataBus = {
  subscribe(listener: (e: InspectionChangeEvent) => void): () => void,
  emitInspectionsChanged(projectId: number): void,
  __reset(): void,          // test-only: clears all listeners
};
```

- Backed by a module-level `Set<Listener>`; `subscribe` returns an unsubscribe function;
  `__reset()` clears the set (used in test `beforeEach`).
- `emitInspectionsChanged` iterates a snapshot of the set and calls each listener synchronously.
- Emit errors are caught inside the bus so a listener failure never breaks the write path.

## Repository Emits

`InspectionRepository` emits after each successful mutation:

| Method | Emit after | Project ID source |
|--------|-----------|-------------------|
| `createInspection` | after INSERT | the `projectId` argument |
| `saveFieldValue` | after INSERT/UPDATE | `getInspectionProjectId(inspectionId)` |
| `updateInspectionPoleId` | after UPDATE | `getInspectionProjectId(inspectionId)` |
| `updateInspectionStatus` | after UPDATE | `getInspectionProjectId(inspectionId)` |
| `deleteInspection` | after transaction | `getInspectionProjectId(inspectionId)` — resolved **before** the delete transaction, since the row is gone afterward |
| `deleteMultipleInspections` | after transaction | `getInspectionProjectId(firstId)` — resolved **before** the delete transaction |

- Emits happen **after** the write succeeds, so the dashboard always re-queries committed data.
- For deletes, the projectId is resolved **before** the delete transaction (the row no longer exists after),
  so the event still carries the correct projectId.
- `getInspectionProjectId` returning `null` yields an emit with `projectId = 0`; the hook filters
  `0 !== projectId`, so no spurious reload.
- Fire-and-forget: a failing write still throws before any emit (writes are not swallowed).
- The `inspectionId` is resolved to `projectId` before the write is discarded, matching the sequential
  project handle (no `getGlobalDatabase()` call).

## Hook (`useDashboardAutoRefresh`)

```ts
useDashboardAutoRefresh(projectId: number, focused: boolean): number   // returns reloadKey
```

The hook is **navigation-free**: focus is passed in as a `focused` prop (defaulted to `true` by the grid)
rather than calling `useIsFocused()` internally, so it can be tested with a plain probe component and no
navigation provider.

State: `const [reloadKey, setReloadKey] = useState(0); const bump = () => setReloadKey(k => k + 1);`

1. **Event bus** — `useEffect` subscribes to `InspectionDataBus`; on `event.projectId === projectId`
   call `bump`. Unsubscribe on cleanup.
2. **App foreground** — `AppState.addEventListener("change", ...)`; on `state === "active"` call `bump`.
   Cleanup removes the listener.
3. **Midnight rollover** — compute `ms until next midnight`, `setTimeout` to `bump` **and reschedule**
   itself; cleanup clears the timeout. Keeps "Today's" cards correct when the app stays open overnight.
4. **60s poll (focused only)** — `useEffect([focused, projectId])` runs a 60s `setInterval` calling `bump`
   while `focused` is `true`, and clears it on blur/unmount.

All triggers are idempotent — bumping is cheap and the grid loads once per key change.

## Grid Integration

- `DashboardCardGrid` gains an optional `focused?: boolean` prop (default `true` for back-compat with
  tests that render it directly) and calls `const autoKey = useDashboardAutoRefresh(projectId, focused ?? true)`.
- Load effect dependencies become `[projectId, reloadKey, autoKey]`.
- The existing `reloadKey` prop (bumped by `dashboard.tsx`'s focus effect) remains an additional manual
  trigger — behavior is additive, not replaced.
- `app/projects/dashboard.tsx` passes `focused={useIsFocused()}` (the screen is inside the navigator, so
  the hook is available there); its `useFocusEffect` is unchanged.

## Edge Cases

- **Isolation:** events carry `projectId`; the hook ignores non-matching projectIds. A save in project A
  never refreshes project B's grid (regression test mirrors `isolation.test.ts`).
- **Unfocused polling:** the 60s interval runs only while focused; bus + AppState + midnight fire regardless,
  so returning to the app always refreshes.
- **Midnight while unfocused:** the timer still bumps; harmless because the grid dedupes on key change.
- **No inspection row:** `getInspectionProjectId` → `null` → emit `0` → filtered out.
- **App backgrounded at midnight:** JS timers pause in the background; the AppState "active" trigger covers
  the return.
- **Rapid writes (e.g., many `saveFieldValue` calls during form init):** each triggers an emit; the grid
  coalesces them by loading once per `reloadKey` change. If needed later, a debounce can be added — not
  required in this iteration.

## Error Handling

- The bus swallows listener errors (emits never break repository writes).
- The hook's timers and listeners are cleaned up on unmount; `AppState` listener removal uses the returned
  subscription handle.
- A failing repository write throws before any emit.

## Out of Scope

Remaining dashboard roadmap sub-projects — each gets its own spec → plan → implementation cycle after this ships:

- Universal aggregation engine (Average / Minimum / Maximum / Percentage; all field types auto-recognized).
- Rich filters (Date Range / Yesterday / This Week / This Month / Inspector / City / Zone / Ward / custom fields).
- Layout & UX (drag-and-drop, resize, save custom layouts, duplicate cards).
- Responsive desktop/tablet/mobile layout.

The north-star requirements doc (`Dashboard Requirements`) is the roadmap; this spec delivers only auto-refresh.

## Testing

- **Bus:** subscribe/emit/unsubscribe; `__reset` clears listeners; event carries `projectId`; listener error
  does not break `emit`.
- **Hook (probe component + `jest.useFakeTimers()`):** reloadKey bumps on — matching-projectId emit, AppState
  "active", advancing past midnight, 60s interval while focused; **does not** bump on non-matching projectId
  emit or while unfocused; cleanup removes listeners/timers (unmount test).
- **Repository:** each mutation calls `InspectionBus.emitInspectionsChanged` with the correct `projectId`
  (mock the bus); `getInspectionProjectId` resolution path is exercised.
- **Grid:** emitting on the bus triggers a reload (mock bus + `DashboardService`); existing `reloadKey` prop
  still triggers a reload.
- **Isolation:** bus event for project A does not reload a grid mounted for project B.
- Full suite green; `npx tsc --noEmit` clean; eslint clean; coverage thresholds for touched files hold.
