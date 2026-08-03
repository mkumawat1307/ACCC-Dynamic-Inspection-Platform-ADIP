# Dashboard Auto-Refresh Implementation Plan

> **Status: ? Implemented** � All 5 tasks completed and committed.


**Goal:** Make the project dashboard reload its statistic cards automatically when inspection data changes, the app returns to the foreground, the date rolls past midnight, or every 60s while focused — without manual refresh.

**Architecture:** A zero-dependency module event bus (`InspectionDataBus`) is emitted to by `InspectionRepository` after each successful inspection mutation. A `useDashboardAutoRefresh(projectId, focused)` hook consumes the bus (project-filtered), React Native `AppState`, a self-rescheduling midnight timer, and a 60s focused poll, and returns a `reloadKey` counter. `DashboardCardGrid` feeds that counter into its load effect; `app/projects/dashboard.tsx` passes `focused` from `useIsFocused()`.

**Tech Stack:** React Native (Expo), TypeScript strict, react-test-renderer + Jest (jest-expo preset), `@react-navigation/native` `useIsFocused`, React Native `AppState`.

## Global Constraints

- All code lives under `frontend/`; run commands from there. Yarn 1.22. `npx` only for tools.
- TypeScript strict. Avoid `any`. No code comments unless a file already documents itself.
- Repository pattern: never query SQLite from UI; all DB access via `src/database/repositories/` through `getDatabase()`.
- ADR-014: never call `getGlobalDatabase()` during the inspection flow. Auto-refresh only reads the **project** DB.
- Isolation: per-project data lives in the project DB only; the event bus must be project-filtered (Project A events never refresh Project B).
- Coverage thresholds (jest.config.js): `src/database/repositories/InspectionRepository.ts` 80 lines / 80 statements / 80 functions / 70 branches. All touched source files keep their thresholds.
- `DashboardCard.ts` model: `CountMode: "count" | "distinct"`; `SectionLabel`, `AggregateField`, `BreakdownField` nullable.
- Tests use `react-test-renderer` directly (no testing-library); mock `@/src/database/db` for repository tests.
- `getDatabase()` returns `{ getAllAsync, getFirstAsync, runAsync, withTransactionAsync }` (see `__mocks__` and existing tests).
- Commit after every task with `feat(dashboard): ...` / `test(dashboard): ...` style messages.

---

### Task 1: `InspectionDataBus` module + unit tests

**Files:**
- Create: `src/utils/InspectionDataBus.ts`
- Test: `src/__tests__/utils/InspectionDataBus.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface InspectionChangeEvent { projectId: number }
  export const InspectionDataBus: {
    subscribe(listener: (e: InspectionChangeEvent) => void): () => void;
    emitInspectionsChanged(projectId: number): void;
    __reset(): void;
  };
  ```

- [x] **Step 1: Write the failing test**

`src/__tests__/utils/InspectionDataBus.test.ts`:

```ts
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";

describe("InspectionDataBus", () => {
  beforeEach(() => {
    InspectionDataBus.__reset();
  });

  it("delivers emitted events to subscribed listeners with the projectId", () => {
    const listener = jest.fn();
    InspectionDataBus.subscribe(listener);
    InspectionDataBus.emitInspectionsChanged(7);
    expect(listener).toHaveBeenCalledWith({ projectId: 7 });
  });

  it("does not deliver after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = InspectionDataBus.subscribe(listener);
    unsubscribe();
    InspectionDataBus.emitInspectionsChanged(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers to multiple listeners", () => {
    const a = jest.fn();
    const b = jest.fn();
    InspectionDataBus.subscribe(a);
    InspectionDataBus.subscribe(b);
    InspectionDataBus.emitInspectionsChanged(3);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("does not fail when a listener throws", () => {
    InspectionDataBus.subscribe(() => {
      throw new Error("boom");
    });
    const ok = jest.fn();
    InspectionDataBus.subscribe(ok);
    expect(() => InspectionDataBus.emitInspectionsChanged(2)).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("__reset clears all listeners", () => {
    const listener = jest.fn();
    InspectionDataBus.subscribe(listener);
    InspectionDataBus.__reset();
    InspectionDataBus.emitInspectionsChanged(4);
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/utils/InspectionDataBus.test.ts`
Expected: FAIL — `Cannot find module "@/src/utils/InspectionDataBus"`

- [x] **Step 3: Write minimal implementation**

`src/utils/InspectionDataBus.ts`:

```ts
export interface InspectionChangeEvent {
  projectId: number;
}

type Listener = (event: InspectionChangeEvent) => void;

const listeners = new Set<Listener>();

export const InspectionDataBus = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  emitInspectionsChanged(projectId: number): void {
    const snapshot = [...listeners];
    for (const listener of snapshot) {
      try {
        listener({ projectId });
      } catch {
        // A listener failure must never break the write path.
      }
    }
  },

  __reset(): void {
    listeners.clear();
  },
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/utils/InspectionDataBus.test.ts`
Expected: PASS — 5 tests

- [x] **Step 5: Commit**

```bash
git add src/utils/InspectionDataBus.ts src/__tests__/utils/InspectionDataBus.test.ts
git commit -m "feat(dashboard): add InspectionDataBus pub/sub for inspection data changes"
```

---

### Task 2: `useDashboardAutoRefresh` hook + unit tests

**Files:**
- Create: `src/hooks/useDashboardAutoRefresh.ts`
- Test: `src/__tests__/hooks/useDashboardAutoRefresh.test.tsx`

**Interfaces:**
- Consumes: `InspectionDataBus` from `@/src/utils/InspectionDataBus` (Task 1).
- Produces:
  ```ts
  useDashboardAutoRefresh(projectId: number, focused: boolean): number; // reloadKey counter
  ```

**Behavior contract:**
- Bumps the counter on a bus event where `event.projectId === projectId` (ignores other projectIds and `0`).
- Bumps on `AppState` "active".
- Bumps when the clock crosses midnight, then reschedules for the next midnight.
- Runs a 60s `setInterval` bump **only while `focused === true`**; clears on blur/unmount.
- All listeners/timers cleaned up on unmount.

- [x] **Step 1: Write the failing test**

`src/__tests__/hooks/useDashboardAutoRefresh.test.tsx`:

```tsx
import React from "react";
import { Text } from "react-native";
import TestRenderer from "react-test-renderer";
import { AppState } from "react-native";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
import useDashboardAutoRefresh from "@/src/hooks/useDashboardAutoRefresh";

type AppStateHandler = (state: string) => void;

let appStateHandler: AppStateHandler | null = null;

jest.spyOn(AppState, "addEventListener").mockImplementation(
  ((_type: string, handler: AppStateHandler) => {
    appStateHandler = handler;
    return { remove: jest.fn() };
  }) as never
);

function Probe({ projectId, focused }: { projectId: number; focused?: boolean }) {
  const reloadKey = useDashboardAutoRefresh(projectId, focused ?? true);
  return <Text>{reloadKey}</Text>;
}

async function renderProbe(props: { projectId: number; focused?: boolean }) {
  let tree!: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<Probe {...props} />);
    await Promise.resolve();
  });
  return tree;
}

function renderedKey(tree: ReturnType<typeof TestRenderer.create>): string {
  const text = tree.root.findByType(Text as never);
  return (text as unknown as { props: { children: number } }).props.children as unknown as string;
}

describe("useDashboardAutoRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    InspectionDataBus.__reset();
    appStateHandler = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts at 0", async () => {
    const tree = await renderProbe({ projectId: 1 });
    expect(renderedKey(tree)).toBe("0");
    tree.unmount();
  });

  it("bumps on a matching-projectId bus event", async () => {
    const tree = await renderProbe({ projectId: 5 });
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(5);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");
    tree.unmount();
  });

  it("does not bump on a non-matching projectId event", async () => {
    const tree = await renderProbe({ projectId: 5 });
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(6);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("0");
    tree.unmount();
  });

  it("does not bump on projectId 0 (unknown project) events", async () => {
    const tree = await renderProbe({ projectId: 5 });
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(0);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("0");
    tree.unmount();
  });

  it("bumps when AppState becomes active", async () => {
    const tree = await renderProbe({ projectId: 1 });
    await TestRenderer.act(async () => {
      appStateHandler?.("background");
      appStateHandler?.("active");
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");
    tree.unmount();
  });

  it("bumps on the 60s interval while focused, and stops when unfocused", async () => {
    const tree = await renderProbe({ projectId: 1, focused: true });
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");

    await TestRenderer.act(async () => {
      tree.update(<Probe projectId={1} focused={false} />);
      jest.advanceTimersByTime(120_000);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");
    tree.unmount();
  });

  it("bumps across a midnight boundary and reschedules", async () => {
    jest.setSystemTime(new Date(2026, 7, 2, 23, 59, 58, 0));
    const tree = await renderProbe({ projectId: 1 });
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
    });
    expect(renderedKey(tree)).toBe("1");
    tree.unmount();
  });

  it("unsubscribes from the bus and clears timers on unmount", async () => {
    const tree = await renderProbe({ projectId: 5 });
    tree.unmount();
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(5);
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(jest.getTimerCount()).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/hooks/useDashboardAutoRefresh.test.tsx`
Expected: FAIL — `Cannot find module "@/src/hooks/useDashboardAutoRefresh"`

- [x] **Step 3: Write minimal implementation**

`src/hooks/useDashboardAutoRefresh.ts`:

```ts
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";

const POLL_INTERVAL_MS = 60_000;

function msUntilNextMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export default function useDashboardAutoRefresh(
  projectId: number,
  focused: boolean
): number {
  const [reloadKey, setReloadKey] = useState(0);
  const bump = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const unsubscribe = InspectionDataBus.subscribe((event) => {
      if (event.projectId === projectId) {
        bump();
      }
    });
    return unsubscribe;
  }, [projectId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        bump();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        bump();
        schedule();
      }, msUntilNextMidnight(new Date()));
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!focused) return;
    const interval = setInterval(bump, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [focused]);

  return reloadKey;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/hooks/useDashboardAutoRefresh.test.tsx`
Expected: PASS — 8 tests

- [x] **Step 5: Commit**

```bash
git add src/hooks/useDashboardAutoRefresh.ts src/__tests__/hooks/useDashboardAutoRefresh.test.tsx
git commit -m "feat(dashboard): add useDashboardAutoRefresh hook (bus, AppState, midnight, 60s focused poll)"
```

---

### Task 3: Repository emits in `InspectionRepository`

**Files:**
- Modify: `src/database/repositories/InspectionRepository.ts` (add import; emit in 6 methods)
- Test: `src/__tests__/repositories/InspectionRepository.test.ts` (new)

**Interfaces:**
- Consumes: `InspectionDataBus` from `@/src/utils/InspectionDataBus` (Task 1).
- Produces: after each of `createInspection`, `saveFieldValue`, `updateInspectionPoleId`, `updateInspectionStatus`, `deleteInspection`, `deleteMultipleInspections`, `InspectionDataBus.emitInspectionsChanged(projectId)` is called with the correct projectId.

**Emit points (projectId resolved BEFORE deletes):**
- `createInspection`: after `runAsync`, emit with the `projectId` argument (already in scope).
- `saveFieldValue`: after the INSERT/UPDATE `runAsync`, `const projectId = await this.getInspectionProjectId(inspectionId); emit(projectId ?? 0)`.
- `updateInspectionPoleId`: after `runAsync`, resolve + emit.
- `updateInspectionStatus`: after `runAsync`, resolve + emit.
- `deleteInspection`: resolve `const projectId = await this.getInspectionProjectId(inspectionId) ?? 0` **before** `withTransactionAsync`, then emit after.
- `deleteMultipleInspections`: resolve `const projectId = await this.getInspectionProjectId(inspectionIds[0]) ?? 0` **before** `withTransactionAsync`, then emit after.

- [x] **Step 1: Write the failing test**

`src/__tests__/repositories/InspectionRepository.test.ts`:

```ts
jest.mock("@/src/database/db");
jest.mock("@/src/utils/InspectionDataBus");

import { getDatabase } from "@/src/database/db";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => {
      await fn();
    }),
  };
}

describe("InspectionRepository auto-refresh emits", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("createInspection emits with its projectId", async () => {
    const id = await InspectionRepository.createInspection(9, 1, "02-Aug-2026");
    expect(id).toBe(42);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(9);
  });

  it("saveFieldValue emits with the resolved projectId", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 }) // parents
      .mockResolvedValueOnce(null)                               // no existing value -> INSERT
      .mockResolvedValueOnce({ ProjectID: 5 });                  // getInspectionProjectId
    await InspectionRepository.saveFieldValue(3, 7, "Yes");
    expect(mockDb.runAsync).toHaveBeenCalled();
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(5);
  });

  it("saveFieldValue emits after an UPDATE path", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
      .mockResolvedValueOnce({ ValueID: 11 })                    // existing -> UPDATE
      .mockResolvedValueOnce({ ProjectID: 5 });
    await InspectionRepository.saveFieldValue(3, 7, "No");
    expect(mockDb.runAsync).toHaveBeenCalled();
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(5);
  });

  it("updateInspectionPoleId emits with the resolved projectId", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 4 });
    await InspectionRepository.updateInspectionPoleId(2, "P-100");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(4);
  });

  it("updateInspectionStatus emits with the resolved projectId", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 6 });
    await InspectionRepository.updateInspectionStatus(2, "Completed");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(6);
  });

  it("deleteInspection resolves projectId before deleting and emits after", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 8 });
    await InspectionRepository.deleteInspection(2);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(8);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
  });

  it("deleteMultipleInspections resolves projectId from the first id and emits after", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 3 });
    await InspectionRepository.deleteMultipleInspections([2, 5, 9]);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(3);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
  });

  it("emits 0 when projectId cannot be resolved (save path)", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null); // getInspectionProjectId -> null
    await InspectionRepository.saveFieldValue(3, 7, "Yes");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/repositories/InspectionRepository.test.ts`
Expected: FAIL — `expect(received).toHaveBeenCalledWith(9)` etc. (no emits yet)

- [x] **Step 3: Write minimal implementation**

Add the import at the top of `src/database/repositories/InspectionRepository.ts` (after the existing imports):

```ts
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
```

Modify `createInspection` to emit (it currently returns `result.lastInsertRowId as number`):

```ts
  const newId = result.lastInsertRowId as number;
  InspectionDataBus.emitInspectionsChanged(projectId);
  return newId;
```

Modify `saveFieldValue` — after the existing `if (existing) { ... } else { ... }` block, add:

```ts
  const projectId = await this.getInspectionProjectId(inspectionId);
  InspectionDataBus.emitInspectionsChanged(projectId ?? 0);
```

Modify `updateInspectionPoleId` — after `runAsync`:

```ts
  const projectId = await this.getInspectionProjectId(inspectionId);
  InspectionDataBus.emitInspectionsChanged(projectId ?? 0);
```

Modify `updateInspectionStatus` — after `runAsync`:

```ts
  const projectId = await this.getInspectionProjectId(inspectionId);
  InspectionDataBus.emitInspectionsChanged(projectId ?? 0);
```

Modify `deleteInspection` — resolve **before** the transaction, emit after:

```ts
  const db = await getDatabase();
  const projectId = (await this.getInspectionProjectId(inspectionId)) ?? 0;

  await db.withTransactionAsync(async () => {
    await deleteInspectionData(db, inspectionId);
  });

  InspectionDataBus.emitInspectionsChanged(projectId);
```

Modify `deleteMultipleInspections` — resolve **before** the transaction, emit after:

```ts
  const db = await getDatabase();
  const firstId = inspectionIds[0];
  const projectId = firstId == null ? 0 : ((await this.getInspectionProjectId(firstId)) ?? 0);

  await db.withTransactionAsync(async () => {
    for (const id of inspectionIds) {
      await deleteInspectionData(db, id);
    }
  });

  InspectionDataBus.emitInspectionsChanged(projectId);
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/InspectionRepository.test.ts`
Expected: PASS — 8 tests

Then run the full suite to confirm no regression and thresholds hold:
Run: `npx jest`
Expected: PASS — all existing suites plus the new ones; `InspectionRepository.ts` coverage threshold still met.

- [x] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx eslint src/database/repositories/InspectionRepository.ts src/__tests__/repositories/InspectionRepository.test.ts`
Expected: no errors (pre-existing style warnings acceptable)

- [x] **Step 6: Commit**

```bash
git add src/database/repositories/InspectionRepository.ts src/__tests__/repositories/InspectionRepository.test.ts
git commit -m "feat(dashboard): emit inspection data changes from InspectionRepository"
```

---

### Task 4: Wire the hook into `DashboardCardGrid` and `dashboard.tsx`

**Files:**
- Modify: `src/components/dashboard/DashboardCardGrid.tsx`
- Modify: `app/projects/dashboard.tsx`
- Test: `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`

**Interfaces:**
- Consumes: `useDashboardAutoRefresh(projectId, focused)` from `@/src/hooks/useDashboardAutoRefresh` (Task 2).
- Produces: `DashboardCardGrid` gains optional prop `focused?: boolean` (default `true`); its load effect reloads on `[projectId, reloadKey, autoKey]`. `app/projects/dashboard.tsx` passes `focused={useIsFocused()}`.

- [x] **Step 1: Write the failing test**

Append these cases to `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`. Add the imports at the top of the file:

```ts
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
```

And add a `beforeEach` reset (keep existing `jest.clearAllMocks()` and add):

```ts
  beforeEach(() => {
    jest.clearAllMocks();
    InspectionDataBus.__reset();
  });
```

Append the new test cases inside the describe block:

```tsx
  it("reloads when an inspection data change event fires for its project", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 12 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    expect(mockedService.getEnabledCardsWithCounts).toHaveBeenCalledTimes(1);

    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 99 }),
    ]);
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(1);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("99");
    expect(mockedService.getEnabledCardsWithCounts).toHaveBeenCalledTimes(2);
  });

  it("does not reload on an event for a different project", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 12 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    await TestRenderer.act(async () => {
      InspectionDataBus.emitInspectionsChanged(2);
      await flushPromises();
    });
    expect(mockedService.getEnabledCardsWithCounts).toHaveBeenCalledTimes(1);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: FAIL — new cases fail (grid doesn't subscribe yet). If the file's existing `beforeEach` lacks the bus reset, add it (Step 1 includes it).

- [x] **Step 3: Write minimal implementation**

In `src/components/dashboard/DashboardCardGrid.tsx`:

Add the import:

```ts
import useDashboardAutoRefresh from "@/src/hooks/useDashboardAutoRefresh";
```

Change the props interface:

```ts
interface Props {
  projectId: number;
  reloadKey?: number;
  focused?: boolean;
}

export default function DashboardCardGrid({ projectId, reloadKey = 0, focused = true }: Props) {
  const [cards, setCards] = useState<CardWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const autoKey = useDashboardAutoRefresh(projectId, focused);
```

Change the load effect dependency array:

```ts
  useEffect(() => {
    load();
  }, [projectId, reloadKey, autoKey]);
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: PASS — existing 13 cases + 2 new cases

- [x] **Step 5: Wire `dashboard.tsx`**

In `app/projects/dashboard.tsx`, add `useIsFocused` to the existing `@react-navigation/native` import:

```ts
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
```

Inside the component body (top, near the other state hooks), add:

```ts
const isFocused = useIsFocused();
```

Pass it to the grid at the call site (line ~141):

```tsx
<DashboardCardGrid projectId={project.ProjectID} reloadKey={statReloadKey} focused={isFocused} />
```

- [x] **Step 6: Run typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx eslint src/components/dashboard/DashboardCardGrid.tsx app/projects/dashboard.tsx src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: no errors (pre-existing style warnings acceptable)

- [x] **Step 7: Run full suite**

Run: `npx jest`
Expected: PASS — all suites green, coverage thresholds met

- [x] **Step 8: Commit**

```bash
git add src/components/dashboard/DashboardCardGrid.tsx app/projects/dashboard.tsx src/__tests__/components/dashboard/DashboardCardGrid.test.tsx
git commit -m "feat(dashboard): wire auto-refresh into dashboard grid and screen"
```

---

### Task 5: Changelog + final verification

**Files:**
- Modify: `docs/07-Changelog.md`

- [x] **Step 1: Add changelog entry**

Under the `[Unreleased]` `Added` section of `docs/07-Changelog.md`, add a bullet (mirror the existing dashboard entries' phrasing):

```md
- **Dashboard auto-refresh** — dashboard cards now reload automatically when inspection data changes (via a repository-layer `InspectionDataBus`), when the app returns to the foreground, at midnight (keeps "Today's" cards accurate), and every 60 seconds while the dashboard is focused.
```

If there is no `[Unreleased]` section yet, create one at the top of the file following the file's existing format.

- [x] **Step 2: Final verification**

Run: `npx jest`
Expected: PASS — all suites, coverage thresholds met

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx eslint src/database/repositories/InspectionRepository.ts src/components/dashboard/DashboardCardGrid.tsx app/projects/dashboard.tsx src/utils/InspectionDataBus.ts src/hooks/useDashboardAutoRefresh.ts`
Expected: no errors (pre-existing style warnings acceptable)

- [x] **Step 3: Commit**

```bash
git add docs/07-Changelog.md
git commit -m "docs(dashboard): changelog entry for auto-refresh"
```

---

## Self-Review

**Spec coverage:**
- Event bus module + emit → Tasks 1 & 3.
- Bus: subscribe/emit/unsubscribe/`__reset`/listener-error → Task 1 tests.
- Hook: bus (matching/non-matching/0), AppState, midnight reschedule, 60s focused poll, cleanup → Task 2 tests.
- Repository: emits after all 6 mutations with correct projectId, delete resolves before transaction, null→0 → Task 3 tests.
- Grid: reload on matching event, no reload on non-matching, `focused` prop default, existing `reloadKey` still works → Task 4.
- Screen wiring (`useIsFocused` passed down) → Task 4 Step 5.
- Isolation (Project A event does not refresh Project B) → Task 2 "non-matching projectId" test + Task 4 "different project" test.
- Changelog → Task 5.

**Placeholder scan:** no TBD/TODO; all steps carry concrete code, runnable commands, and expected outcomes.

**Type consistency:** `InspectionDataBus.subscribe(listener): () => void`, `emitInspectionsChanged(projectId: number): void`, `__reset(): void` — same in Task 1, 2, 3. `useDashboardAutoRefresh(projectId: number, focused: boolean): number` — same in Task 2 and 4. `DashboardCardGrid` prop `focused?: boolean` default `true` — consistent in Task 4 across implementation and tests.
