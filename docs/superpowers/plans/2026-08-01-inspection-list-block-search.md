# Inspection List Block Name + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the Block name on each inspection list card and let the search box filter by Block, in addition to the existing Pole ID / Division / District matching.

**Architecture:** Two small changes. First, add a pure, testable `filterByQuery` helper to `InspectionListRepository` (the filter predicate currently lives inline in the screen and has no test coverage). Second, wire it into `app/inspection/index.tsx`: render a `Block :` line on the card, replace the inline filter with the helper, and update the Searchbar placeholder. No data-model, schema, or SQL changes are needed — `InspectionListItem.Block` is already fetched by the repository.

**Tech Stack:** React Native (Expo), react-native-paper, TypeScript strict, Jest (jest-expo preset), Yarn.

## Global Constraints

- TypeScript strict mode; no `any` in production code.
- No comments unless requested.
- Per-project data stays in the project DB; route DB access through repositories (never query SQLite from UI).
- All commands run from `frontend/`.
- Verification gates per task: `npx tsc --noEmit`, `npx eslint <changed files>`, `npx jest <test file>` then full suite.

---

### Task 1: Add testable `filterByQuery` helper to `InspectionListRepository`

**Files:**
- Modify: `src/database/repositories/InspectionListRepository.ts`
- Test: `src/__tests__/database/repositories/InspectionListRepository.test.ts`

**Interfaces:**
- Consumes: existing `InspectionListItem` interface (already has `PoleID: string`, `Division: string | null`, `District: string | null`, `Block: string | null`).
- Produces: `InspectionListRepository.filterByQuery(items: InspectionListItem[], query: string): InspectionListItem[]` — case-insensitive match on PoleID, Division, District, OR Block. Empty/whitespace query returns all items unchanged. Null fields never throw.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/database/repositories/InspectionListRepository.test.ts`:

```ts
jest.mock("@/src/database/db");

import { InspectionListRepository, InspectionListItem } from "@/src/database/repositories/InspectionListRepository";

function makeItem(overrides: Partial<InspectionListItem>): InspectionListItem {
  return {
    InspectionID: 1,
    PoleID: "P-101",
    Division: "North",
    District: "D-1",
    Block: "B-2",
    InspectionDate: "2026-08-01",
    Status: "Completed",
    ...overrides,
  };
}

describe("InspectionListRepository.filterByQuery", () => {
  const items = [
    makeItem({ InspectionID: 1, PoleID: "P-101", Division: "North", District: "D-1", Block: "B-2" }),
    makeItem({ InspectionID: 2, PoleID: "P-202", Division: "South", District: "D-2", Block: "B-3" }),
    makeItem({ InspectionID: 3, PoleID: "P-303", Division: null, District: null, Block: null }),
  ];

  it("matches PoleID case-insensitively", () => {
    expect(InspectionListRepository.filterByQuery(items, "p-202").map((i) => i.InspectionID)).toEqual([2]);
  });

  it("matches Division", () => {
    expect(InspectionListRepository.filterByQuery(items, "south").map((i) => i.InspectionID)).toEqual([2]);
  });

  it("matches District", () => {
    expect(InspectionListRepository.filterByQuery(items, "d-1").map((i) => i.InspectionID)).toEqual([1]);
  });

  it("matches Block", () => {
    expect(InspectionListRepository.filterByQuery(items, "b-3").map((i) => i.InspectionID)).toEqual([2]);
  });

  it("handles null Division/District/Block without throwing", () => {
    expect(() => InspectionListRepository.filterByQuery(items, "nothing")).not.toThrow();
    expect(InspectionListRepository.filterByQuery(items, "nothing")).toEqual([]);
  });

  it("returns all items for an empty query", () => {
    expect(InspectionListRepository.filterByQuery(items, "")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/database/repositories/InspectionListRepository.test.ts`
Expected: FAIL — `InspectionListRepository.filterByQuery` is not a function.

- [ ] **Step 3: Add the helper**

In `src/database/repositories/InspectionListRepository.ts`, inside the `InspectionListRepository` class, add:

```ts
static filterByQuery(items: InspectionListItem[], query: string): InspectionListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.PoleID.toLowerCase().includes(q) ||
      (item.Division ?? "").toLowerCase().includes(q) ||
      (item.District ?? "").toLowerCase().includes(q) ||
      (item.Block ?? "").toLowerCase().includes(q)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/database/repositories/InspectionListRepository.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify typecheck + lint**

Run: `npx tsc --noEmit` then `npx eslint src/database/repositories/InspectionListRepository.ts src/__tests__/database/repositories/InspectionListRepository.test.ts`
Expected: clean (eslint 0 errors; warnings in test files for `require()`/import order are pre-existing conventions).

- [ ] **Step 6: Commit**

```bash
git add src/database/repositories/InspectionListRepository.ts src/__tests__/database/repositories/InspectionListRepository.test.ts
git commit -m "feat(inspection-list): add testable filterByQuery helper"
```

---

### Task 2: Show Block on the card and search by it

**Files:**
- Modify: `app/inspection/index.tsx`

**Interfaces:**
- Consumes: `InspectionListRepository.filterByQuery(items, query)` from Task 1.
- Produces: the inspection list screen renders a `Block :` line and searches across Pole ID / Division / District / Block.

- [ ] **Step 1: Replace the inline filter with the helper**

In `app/inspection/index.tsx`, replace the `filtered` computation (currently around lines 162-169):

```ts
const filtered = inspections.filter((item) =>
  item.PoleID.toLowerCase().includes(query) ||
  (item.Division ?? "").toLowerCase().includes(query) ||
  (item.District ?? "").toLowerCase().includes(query)
);
```

with:

```ts
const filtered = InspectionListRepository.filterByQuery(inspections, search);
```

And remove the now-unused local `const query = search.toLowerCase();` (the helper trims + lowercases internally). Keep the `search` state as-is — it feeds the helper.

- [ ] **Step 2: Render the Block line**

In the card body (currently around lines 355-377, after the `District :` line), add:

```tsx
<Text>
  Block : {item.Block || "N/A"}
</Text>
```

- [ ] **Step 3: Update the Searchbar placeholder**

Change the placeholder (currently line 273) from:

```tsx
placeholder="Search Pole ID, Division, District"
```

to:

```tsx
placeholder="Search Pole ID, Division, District, Block"
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` (clean), `npx eslint app/inspection/index.tsx` (0 errors), then full `npx jest` (all suites pass; expect 23 suites / 226 tests minimum — the new repository suite adds 6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/inspection/index.tsx
git commit -m "feat(inspection-list): show block name and search by it"
```

---

## Self-Review Notes

- **Spec coverage:** Display block line (Task 2 Step 2), search by Block (Task 1 + Task 2 Step 1), placeholder text (Task 2 Step 3). All spec requirements map to tasks.
- **No placeholders:** every step has concrete code and commands.
- **Type consistency:** `filterByQuery` signature (Task 1) matches its use in Task 2; `InspectionListItem` fields used in both are the same interface.
- **Testing:** Task 1 is TDD (failing test first). Task 2's UI change is verified via typecheck + lint + full suite (no screen-render test infra for this screen, per repo precedent).
