# Draft Inspection Visibility & Export Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide Draft inspections from Preview, Excel export, and the final inspection list while keeping them editable on a new Drafts tab of `/inspection`.

**Architecture:** One shared `INSPECTION_FINAL_STATUSES = ["Completed", "Submitted"]` constant is the single source of truth. `InspectionListRepository.getByProject` gains a `statuses` parameter; `/inspection` gets two tabs (Final default, Drafts). `buildReportTableInternal` in `exportData.ts` adds `AND Status IN (...)` to both the project-wide and explicit-ID inspection queries.

**Tech Stack:** TypeScript strict, React Native (Expo SDK 54), react-native-paper, Jest (jest-expo preset), in-memory expo-sqlite mock.

## Global Constraints

- ADR-014: never call `getGlobalDatabase()` inside the inspection/project flow. All reads via `getDatabase()` (active project handle). No new DB access paths.
- TypeScript strict; no `any`; no new comments unless required.
- No schema/migration change. No changes to forms, photos, watermark, dashboard counts, or project management.
- Do not change `validateBeforeExit` / the hardware-back handler in `new.tsx`.
- Status filter values: `INSPECTION_FINAL_STATUSES = ["Completed", "Submitted"]`; Draft tab uses `["Draft"]`.
- Work on `main`. Commits use the repo's conventional style (`feat(...)`, `fix(...)`, `test(...)`).

---

### Task 1: Shared final-status constant

**Files:**
- Modify: `src/database/repositories/InspectionRepository.ts`
- Test: `src/__tests__/repositories/InspectionRepository.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const INSPECTION_FINAL_STATUSES = ["Completed", "Submitted"] as const;` — consumed by Task 2 (`InspectionListRepository`) and Task 3 (`exportData`), imported as `{ INSPECTION_FINAL_STATUSES }`.

- [ ] **Step 1: Write the failing test**

Add to the top-level `describe` block in `src/__tests__/repositories/InspectionRepository.test.ts`:

```ts
import {
  InspectionRepository,
  INSPECTION_FINAL_STATUSES,
} from "@/src/database/repositories/InspectionRepository";

describe("INSPECTION_FINAL_STATUSES", () => {
  it("includes Completed and Submitted but not Draft", () => {
    expect(INSPECTION_FINAL_STATUSES).toEqual(["Completed", "Submitted"]);
    expect(INSPECTION_FINAL_STATUSES).not.toContain("Draft");
  });
});
```

(If `InspectionRepository` is already imported in the file, add `INSPECTION_FINAL_STATUSES` to that existing import instead of adding a duplicate import line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --silent src/__tests__/repositories/InspectionRepository.test.ts`
Expected: FAIL — `INSPECTION_FINAL_STATUSES is not defined` (or `Cannot read properties of undefined`).

- [ ] **Step 3: Add the constant**

At the top of `src/database/repositories/InspectionRepository.ts`, after the imports:

```ts
export const INSPECTION_FINAL_STATUSES = ["Completed", "Submitted"] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --silent src/__tests__/repositories/InspectionRepository.test.ts`
Expected: PASS — 1 new test green, existing tests unaffected.

- [ ] **Step 5: Verify the whole suite still passes**

Run: `npx tsc --noEmit` and `yarn test --silent`
Expected: tsc clean; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/database/repositories/InspectionRepository.ts src/__tests__/repositories/InspectionRepository.test.ts
git commit -m "feat(inspection): add shared INSPECTION_FINAL_STATUSES constant"
```

---

### Task 2: Status-filtered inspection list repository

**Files:**
- Modify: `src/database/repositories/InspectionListRepository.ts`
- Test: Create `src/__tests__/repositories/InspectionListRepository.test.ts`

**Interfaces:**
- Consumes: `INSPECTION_FINAL_STATUSES` from Task 1.
- Produces: `InspectionListRepository.getByProject(projectId: number, statuses: readonly string[]): Promise<InspectionListItem[]>` — consumed by Task 4 (`app/inspection/index.tsx`). Signature change is source-compatible only via the new param; Task 4 updates the sole caller.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/repositories/InspectionListRepository.test.ts`:

```ts
jest.mock("@/src/database/db");

import { InspectionListRepository } from "@/src/database/repositories/InspectionListRepository";
import { getDatabase } from "@/src/database/db";
import { INSPECTION_FINAL_STATUSES } from "@/src/database/repositories/InspectionRepository";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  };
}

const sampleRows = [
  { InspectionID: 3, PoleID: "P003", Division: "D", District: "C", Block: "B", InspectionDate: "2026-08-07", Status: "Completed" },
  { InspectionID: 2, PoleID: "P002", Division: "D", District: "C", Block: "B", InspectionDate: "2026-08-06", Status: "Draft" },
  { InspectionID: 1, PoleID: "P001", Division: "D", District: "C", Block: "B", InspectionDate: "2026-08-05", Status: "Completed" },
];

describe("InspectionListRepository.getByProject", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    mockDb.getAllAsync.mockResolvedValue(sampleRows);
  });

  it("filters by the final status set in SQL and returns rows sorted by date desc", async () => {
    const rows = await InspectionListRepository.getByProject(7, INSPECTION_FINAL_STATUSES);

    const sql = mockDb.getAllAsync.mock.calls[0][0] as string;
    const params = mockDb.getAllAsync.mock.calls[0][1] as unknown[];

    expect(sql).toContain("i.ProjectID = ?");
    expect(sql).toContain("i.Status IN (?,?)");
    expect(params).toEqual([7, "Completed", "Submitted"]);
    expect(rows.map((r) => r.InspectionID)).toEqual([3, 2, 1]);
  });

  it("filters by Draft status in SQL for the drafts surface", async () => {
    await InspectionListRepository.getByProject(7, ["Draft"]);

    const sql = mockDb.getAllAsync.mock.calls[0][0] as string;
    const params = mockDb.getAllAsync.mock.calls[0][1] as unknown[];

    expect(sql).toContain("i.Status IN (?)");
    expect(params).toEqual([7, "Draft"]);
  });

  it("projects the expected InspectionListItem fields", async () => {
    const rows = await InspectionListRepository.getByProject(7, ["Completed"]);
    expect(rows[0]).toEqual({
      InspectionID: 3,
      PoleID: "P003",
      Division: "D",
      District: "C",
      Block: "B",
      InspectionDate: "2026-08-07",
      Status: "Completed",
    });
  });
});
```

Note: the test asserts the SQL carries the status filter (the in-memory SQLite mock cannot execute the subquery-based `getByProject` SQL). The filtering behavior is proven by the SQL + params assertion — this matches the repo's established test convention (`DashboardCardRepository.test.ts` asserts `expect.stringContaining(...)` on SQL).

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --silent src/__tests__/repositories/InspectionListRepository.test.ts`
Expected: FAIL — `getByProject` called with 2 args but the current signature accepts 1 (`Expected 1 arguments, but got 2`).

- [ ] **Step 3: Implement the status parameter**

Edit `src/database/repositories/InspectionListRepository.ts`:

```ts
import { getDatabase } from "../db";
import { parseInspectionDate } from "../../utils/date";

export interface InspectionListItem {
  InspectionID: number;
  PoleID: string;
  Division: string | null;
  District: string | null;
  Block: string | null;
  InspectionDate: string;
  Status: string;
}

export class InspectionListRepository {

  static async getByProject(
    projectId: number,
    statuses: readonly string[]
  ): Promise<InspectionListItem[]> {

    const db = await getDatabase();

    const statusPlaces = statuses.map(() => "?").join(",");

    const rows = await db.getAllAsync<InspectionListItem>(
      `
      SELECT
          i.InspectionID,
          i.PoleID,
          i.InspectionDate,
          i.Status,
          (SELECT v.FieldValue FROM InspectionValues v
             JOIN InspectionFields f ON v.FieldID = f.FieldID
            WHERE v.InspectionID = i.InspectionID
              AND f.FieldKey = 'division'
            LIMIT 1) AS Division,
          (SELECT v.FieldValue FROM InspectionValues v
             JOIN InspectionFields f ON v.FieldID = f.FieldID
            WHERE v.InspectionID = i.InspectionID
              AND f.FieldKey = 'district'
            LIMIT 1) AS District,
          (SELECT v.FieldValue FROM InspectionValues v
             JOIN InspectionFields f ON v.FieldID = f.FieldID
            WHERE v.InspectionID = i.InspectionID
              AND f.FieldKey = 'block'
            LIMIT 1) AS Block
      FROM Inspections i
      WHERE i.ProjectID = ?
        AND i.Status IN (${statusPlaces})
      ORDER BY i.InspectionID DESC;
      `,
      [projectId, ...statuses]
    );

    return rows.sort((a, b) => {
      const tsA = parseInspectionDate(a.InspectionDate);
      const tsB = parseInspectionDate(b.InspectionDate);
      const safeA = Number.isNaN(tsA) ? -Infinity : tsA;
      const safeB = Number.isNaN(tsB) ? -Infinity : tsB;
      return safeB - safeA;
    });
  }

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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --silent src/__tests__/repositories/InspectionListRepository.test.ts`
Expected: PASS — 3 new tests green.

- [ ] **Step 5: Fix the existing caller (compile break)**

`app/inspection/index.tsx` currently calls `InspectionListRepository.getByProject(Number(projectId))` with one argument. Task 4 rewrites this screen's data loading; for now, make the minimal change to keep compilation green:

Edit `app/inspection/index.tsx`, in `loadInspections()`:

```ts
const data =
  await InspectionListRepository.getByProject(
    Number(projectId),
    INSPECTION_FINAL_STATUSES
  );
```

Add the import at the top of `app/inspection/index.tsx` (next to the existing `InspectionListRepository` import):

```ts
import {
  InspectionListRepository,
  InspectionListItem,
} from "@/src/database/repositories/InspectionListRepository";
import { INSPECTION_FINAL_STATUSES } from "@/src/database/repositories/InspectionRepository";
```

This makes the screen temporarily Final-only; Task 4 adds the tabs.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` and `yarn test --silent`
Expected: tsc clean; all suites pass (existing `app/inspection` tests, if any, unaffected — none exist).

- [ ] **Step 7: Commit**

```bash
git add src/database/repositories/InspectionListRepository.ts src/__tests__/repositories/InspectionListRepository.test.ts app/inspection/index.tsx
git commit -m "feat(inspection): status-filtered InspectionListRepository.getByProject"
```

---

### Task 3: Status filter in Preview and Excel export

**Files:**
- Modify: `src/utils/exportData.ts` (imports + `buildReportTableInternal` inspections query, lines ~1-8 and ~256-263)
- Test: `src/__tests__/utils/exportData.test.ts`

**Interfaces:**
- Consumes: `INSPECTION_FINAL_STATUSES` from Task 1.
- Produces: unchanged public API — `buildReportTable`, `getReportCounts`, `exportInspections`, `createExportFile` keep their signatures. Behavior change only: Draft inspections are excluded from project-wide and explicit-ID builds.

- [ ] **Step 1: Add the import**

Edit `src/utils/exportData.ts`, after the existing `getDatabase` import:

```ts
import { getDatabase, getGlobalDatabase } from "../database/db";
import { INSPECTION_FINAL_STATUSES } from "../database/repositories/InspectionRepository";
import { getCurrentInspectionDate } from "./date";
```

- [ ] **Step 2: Write the failing tests**

Append these to `describe("buildReportTable", () => { ... })` in `src/__tests__/utils/exportData.test.ts` (reusing the existing `templateRows` and `deviceDefs` fixtures and the `createMockDb` helper already in that file):

```ts
it("filters the project-wide inspections query by final statuses", async () => {
  mockDb.getAllAsync
    .mockResolvedValueOnce(templateRows)
    .mockResolvedValueOnce(deviceDefs)
    .mockResolvedValueOnce([
      { InspectionID: 1, Status: "Completed" },
      { InspectionID: 2, Status: "Draft" },
    ])
    .mockResolvedValueOnce([
      { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
    ])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);

  const { buildReportTable } = require("@/src/utils/exportData");
  const table = await buildReportTable(1);

  const inspectionsCall = mockDb.getAllAsync.mock.calls[2] as [string, unknown[]];
  expect(inspectionsCall[0]).toContain("WHERE ProjectID = ?");
  expect(inspectionsCall[0]).toContain("AND Status IN (?,?)");
  expect(inspectionsCall[1]).toEqual([1, "Completed", "Submitted"]);
  expect(table.rows).toEqual([
    { cells: ["P001", "", "", "", ""], isDeviceRow: false },
  ]);
});

it("filters the explicit-ID inspections query by final statuses", async () => {
  mockDb.getAllAsync
    .mockResolvedValueOnce(templateRows)
    .mockResolvedValueOnce(deviceDefs)
    .mockResolvedValueOnce([
      { InspectionID: 1, Status: "Completed" },
    ])
    .mockResolvedValueOnce([
      { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
    ])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);

  const { buildReportTable } = require("@/src/utils/exportData");
  const table = await buildReportTable(1, [1, 2]);

  const inspectionsCall = mockDb.getAllAsync.mock.calls[2] as [string, unknown[]];
  expect(inspectionsCall[0]).toContain("InspectionID IN (?,?)");
  expect(inspectionsCall[0]).toContain("AND Status IN (?,?)");
  expect(inspectionsCall[1]).toEqual([1, 2, "Completed", "Submitted"]);
  expect(table.inspectionCount).toBe(1);
});

it("emits no rows when the filtered query returns only Drafts (draft ID passed explicitly)", async () => {
  mockDb.getAllAsync
    .mockResolvedValueOnce(templateRows)
    .mockResolvedValueOnce(deviceDefs)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);

  const { buildReportTable } = require("@/src/utils/exportData");
  const table = await buildReportTable(1, [999]);

  expect(table.rows).toEqual([]);
  expect(table.inspectionCount).toBe(0);
});
```

Note on the explicit-ID test: the DB layer (SQLite) applies `AND Status IN (...)` so a Draft ID returns zero rows. The unit test asserts the SQL + params contract (the `mockDb.getAllAsync` stub returns exactly what SQLite would return after filtering — here empty for a Draft-only request). This matches the spec's decision 2 (block Draft export everywhere).

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test --silent src/__tests__/utils/exportData.test.ts`
Expected: FAIL — `inspectionsCall[0]` does not contain `AND Status IN (?,?)`.

- [ ] **Step 4: Implement the filter**

Edit `src/utils/exportData.ts`, inside `buildReportTableInternal`, replacing the inspections query (currently around lines 256-263):

```ts
  const statusPlaces = INSPECTION_FINAL_STATUSES.map(() => "?").join(",");

  const inspections = await db.getAllAsync<{ InspectionID: number; Status: string }>(
    idList
      ? `SELECT InspectionID, Status FROM Inspections WHERE InspectionID IN (${placeholders}) AND Status IN (${statusPlaces}) ORDER BY InspectionID`
      : `SELECT InspectionID, Status FROM Inspections WHERE ProjectID = ? AND Status IN (${statusPlaces}) ORDER BY InspectionID`,
    idList ? [...idList, ...INSPECTION_FINAL_STATUSES] : [projectId, ...INSPECTION_FINAL_STATUSES]
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test --silent src/__tests__/utils/exportData.test.ts`
Expected: PASS — 3 new tests green, existing exportData tests unaffected (their mocks return the same rows they always did).

- [ ] **Step 6: Verify the whole suite**

Run: `npx tsc --noEmit` and `yarn test --silent`
Expected: tsc clean; all suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/utils/exportData.ts src/__tests__/utils/exportData.test.ts
git commit -m "feat(export): exclude Draft inspections from preview and export"
```

---

### Task 4: Drafts / Final tabs on the inspection list

**Files:**
- Modify: `app/inspection/index.tsx`

**Interfaces:**
- Consumes: `InspectionListRepository.getByProject(projectId, statuses)` (Task 2), `INSPECTION_FINAL_STATUSES` (Task 1).
- Produces: tabbed list UI. No new exported API.

- [ ] **Step 1: Add the tab state and per-tab loading**

Edit `app/inspection/index.tsx`:

Add a tab type near the other state:

```ts
const [tab, setTab] = useState<"final" | "drafts">("final");
```

Update `loadInspections` to load the active tab's statuses:

```ts
async function loadInspections() {
  if (!projectId) return;
  const statuses = tab === "final" ? INSPECTION_FINAL_STATUSES : ["Draft"];
  const data =
    await InspectionListRepository.getByProject(
      Number(projectId),
      statuses
    );
  setInspections(data);
}
```

Update `useFocusEffect` to reload when the tab changes:

```ts
useFocusEffect(
  useCallback(() => {
    loadInspections();
  }, [projectId, tab])
);
```

Add a tab switch handler that clears selection:

```ts
function switchTab(next: "final" | "drafts") {
  if (next === tab) return;
  clearSelection();
  setTab(next);
}
```

- [ ] **Step 2: Render the tab control**

In the JSX, above the `Searchbar`, add react-native-paper `SegmentedButtons`:

```tsx
<SegmentedButtons
  value={tab}
  onValueChange={(v) => switchTab(v as "final" | "drafts")}
  buttons={[
    { value: "final", label: "Final" },
    { value: "drafts", label: "Drafts" },
  ]}
  style={styles.segmented}
/>
```

Add `SegmentedButtons` to the react-native-paper import in `app/inspection/index.tsx` (currently imports `Appbar, Card, Text, Searchbar, Button, Checkbox, IconButton`).

Add the style to the `StyleSheet.create` in the same file:

```ts
segmented: {
  marginHorizontal: 20,
  marginBottom: 15,
},
```

- [ ] **Step 3: Hide export affordances on the Drafts tab**

In the per-row action icons (currently `{!selectionMode && (...)}`), hide **only the export icon** on the Drafts tab — the pencil/edit icon MUST stay visible because Drafts remains editable (open via `openEdit`, unchanged):

```tsx
{!selectionMode && (
  <View style={{ flexDirection: "row", alignItems: "center" }}>
    {tab === "final" && (
      <IconButton
        icon="export-variant"
        size={20}
        disabled={exportFlow.busy}
        onPress={() => handleSingleExport(item)}
      />
    )}
    <IconButton
      icon="pencil"
      size={20}
      onPress={() => openEdit(item)}
    />
  </View>
)}
```

In the selection card, hide the "Export Selected" button when on the Drafts tab (keep "Delete Selected" — it is the Draft discard path):

```tsx
{tab === "final" && (
  <Button
    mode="contained"
    icon="export-variant"
    compact
    disabled={selectedIds.length === 0 || exportFlow.busy}
    onPress={handleBulkExport}
  >
    Export Selected
  </Button>
)}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` and `yarn lint`
Expected: tsc clean; lint 0 errors. (`app/` route screens are not unit-tested — consistent with the codebase; correctness is verified via tsc + lint + manual device pass.)

- [ ] **Step 5: Run the full suite**

Run: `yarn test --silent`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add app/inspection/index.tsx
git commit -m "feat(inspection): Drafts and Final tabs on inspection list"
```

---

### Task 5: Full-branch verification

**Files:** none (verification only)

- [ ] **Step 1: Full verification**

Run, from `frontend/`:
- `npx tsc --noEmit` → clean
- `yarn lint` → 0 errors
- `yarn test --silent` → all suites pass (64 suites / 741+ tests)

- [ ] **Step 2: Confirm final status flow end-to-end**

Confirm the four surfaces from the spec:
1. `/inspection` Final tab → `getByProject(id, INSPECTION_FINAL_STATUSES)`.
2. `/inspection` Drafts tab → `getByProject(id, ["Draft"])`, no export affordances, Delete remains.
3. Reports Preview → `buildReportTable` → filtered project-wide query.
4. Excel/CSV export (project-wide and per-ID) → filtered queries; a Draft ID yields no rows.

- [ ] **Step 3: Update docs (changelog)**

Add a one-line entry to `docs/07-Changelog.md` under the current version's Unreleased/next bullet:

```
- Draft inspections are excluded from Reports preview, Excel/CSV export, and the final inspection list; `/inspection` now has Final and Drafts tabs (Drafts stays editable, no export).
```

- [ ] **Step 4: Commit**

```bash
git add docs/07-Changelog.md
git commit -m "docs: changelog entry for draft visibility and export filtering"
```

---

## Self-Review

**1. Spec coverage:**
- Drafts hidden from Preview → Task 3 (project-wide query filter feeds `buildReportTable`).
- Drafts hidden from Excel export (project-wide + per-ID) → Task 3 (both branches).
- Drafts hidden from final inspection list → Task 2 (Final statuses) + Task 4 (Final tab).
- Drafts editable from Drafts/Continue surface → Task 4 (Drafts tab, opens `/inspection/edit` unchanged).
- Save/Complete → Completed visible → no code change needed; `updateInspectionStatus(id, "Completed")` already flips status, and the status lands in the Final set. Covered by Task 4 tab reload on focus + Task 3 filter.
- Back without Save keeps Draft → no change (rows already created as `'Draft'`; validation block preserved per decision 3).
- Filter everywhere `WHERE Status IN ('Completed','Submitted')` → Tasks 2 + 3 use the shared constant.
- Do not change forms/photos/watermark/dashboard/schema → no files for those touched.
- Tests → Task 1 (constant), Task 2 (repo filter), Task 3 (preview + per-ID export).

**2. Placeholder scan:** Every step has concrete code; no TBD/TODO/"add error handling" placeholders.

**3. Type consistency:** `getByProject(projectId: number, statuses: readonly string[])` is defined in Task 2 and called the same way in Tasks 2 and 4. `INSPECTION_FINAL_STATUSES` is `readonly ["Completed", "Submitted"]` and spread into params in Task 2/3 consistently (`...INSPECTION_FINAL_STATUSES`). `tab` is `"final" | "drafts"` throughout Task 4.
