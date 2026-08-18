# Project Uniqueness (District + ProjectName) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate projects — a project must be unique by the *normalized* combination of District name + Project Name, enforced authoritatively at the repository + SQLite level, with a friendly "Project Already Exists" UX and zero resource creation on rejection.

**Architecture:** Two-layer enforcement. (1) Primary: normalized key columns `DistrictKey`/`ProjectKey` on the global `Projects` table, populated by `ProjectRepository` on every create/update/clone, with an explicit pre-check that rejects duplicates before any filesystem resource is created. (2) Backstop: a SQLite `UNIQUE` index on `(DistrictKey, ProjectKey)` so concurrent/raced attempts are rejected atomically; constraint violations are converted to a typed `ProjectAlreadyExistsError`. Normalization (`trim().toLowerCase()`) is shared between repository and migration via a pure helper. New projects get district-qualified DB folders (`Projects/<District>_<ProjectName>/inspection.db`) so allowed same-name-different-district projects can never share a DB file.

**Tech Stack:** TypeScript (strict), expo-sqlite v16 (sequential open/close model — NEVER dual connections), expo-file-system/legacy, Jest (jest-expo, in-memory SQLite mock that does NOT enforce UNIQUE constraints), react-native-paper dialogs.

## Global Constraints

- **Normalization rule (verbatim):** `normalizedDistrict = trim(District).toLowerCase()`, `normalizedProjectName = trim(ProjectName).toLowerCase()`; uniqueness on the pair.
- **Never rewrite stored/displayed values.** Keys are internal-only columns; `ProjectName`/`DistrictID` stay exactly as the user entered them.
- **Rejection must create zero resources:** no project row, no `Projects/<...>` folder, no `inspection.db`, no Download photo folder. Rejection happens inside `ProjectRepository.createProject` — the first step after UI validation, before any FS call.
- **Repository is the source of truth; UI validation is only UX.** `ProjectRepository.createProject` / `cloneProject` / `updateProject` guard programmatic + concurrent + future callers.
- **Duplicate UX (verbatim):** Title `Project Already Exists`, Message `A project with the same District and Project Name already exists.` User stays on the creation screen.
- **Cleanup on partial failure:** delete ONLY resources created by the failed attempt; never touch a pre-existing project.
- **Existing-data safety:** never auto-delete/merge/rename duplicate records. Migration detects existing duplicates, reports them, and STOPS before creating the unique index (non-blocking app start).
- **Sequential DB model:** never hold two SQLite handles; route all access through `getGlobalDatabase()`/`setActiveProject()`.
- **Logging (verbatim prefixes):** `[ProjectCreate] start district=... project=...`, `[ProjectCreate] duplicateDetected projectId=...`, `[ProjectCreate] rejectedDuplicate`, `[ProjectCreate] success projectId=...`, `[ProjectCreate] failed=...`. No inspection/photo contents logged.
- **Do NOT change:** inspection data, photo handling/storage/preview, backup ZIP format, transactional restore, WAL/SHM, template backup/restore, Pole ID rename, watermark, GPS/geocoding, Excel/CSV export, camera logic, existing project folders.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/database/projectIdentity.ts` (NEW) | `normalizeKey`, `buildProjectIdentity`, `detectProjectDuplicates` — pure, shared normalization + dup-grouping |
| `frontend/src/database/repositories/ProjectRepository.ts` (MODIFY) | `ProjectAlreadyExistsError`, `isUniqueConstraintError`, key columns in `createProject`/`updateProject`/`cloneProject`, pre-checks, constraint→typed-error conversion, `[ProjectCreate]` logs |
| `frontend/src/database/schema.ts` (MODIFY) | `Projects` DDL gains `DistrictKey`/`ProjectKey`; new `migrateProjectUniqueness()` (ALTER+backfill+detect+conditional unique index) |
| `frontend/src/database/DatabaseService.ts` (MODIFY) | call `migrateProjectUniqueness()` after `createGlobalSchema()`; expose `getProjectDuplicates()` |
| `frontend/src/utils/folderNaming.ts` (MODIFY) | `buildProjectFolderLabel(districtName, projectName)`; refactor `canonicalProjectLabel` onto it |
| `frontend/src/database/helpers/ProjectDBManager.ts` (MODIFY) | `getProjectDbPath(districtName, projectName)` — district-qualified label |
| `frontend/src/database/services/ProjectCreateService.ts` (NEW) | orchestrated create flow: log start → path → repo create → `createProjectDb` → `ensureProjectFolder`; cleanup-only-own-resources on failure |
| `frontend/app/projects/new.tsx` (MODIFY) | call service; catch `ProjectAlreadyExistsError` → exact dialog, stay on screen |
| `frontend/app/index.tsx` (MODIFY) | clone path: pass `selectedProject.DistrictName` to `getProjectDbPath` |
| `frontend/app/database/index.tsx` (MODIFY, optional) | surface `getProjectDuplicates()` warning when pre-existing duplicates exist |
| Tests (NEW/MODIFY) | `projectIdentity.test.ts` (new), `ProjectRepository.test.ts` (extend), `schema.test.ts` (extend), `ProjectCreateService.test.ts` (new), `ProjectDBManager.test.ts` (update path tests), `DatabaseService.test.ts` (extend) |
| Docs (MODIFY) | `docs/10-DATABASE_ARCHITECTURE.md`, `docs/09-Decisions.md` (new ADR) |

---

## Task 1: Normalization + duplicate detection primitives

**Files:**
- Create: `frontend/src/database/projectIdentity.ts`
- Test: `frontend/src/__tests__/database/projectIdentity.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2–4):
  - `normalizeKey(value: string): string` → `value.trim().toLowerCase()`
  - `buildProjectIdentity(districtName: string, projectName: string): { districtKey: string; projectKey: string }`
  - `interface ProjectDuplicateGroup { districtKey: string; projectKey: string; members: Array<{ ProjectID: number; ProjectName: string; DistrictName: string; DBPath: string | null }> }`
  - `detectProjectDuplicates(projects: Array<{ ProjectID: number; ProjectName: string; DistrictID: number; DBPath: string | null }>, districts: Array<{ DistrictID: number; DistrictName: string }>): ProjectDuplicateGroup[]`

- [ ] **Step 1: Write the failing tests** in `projectIdentity.test.ts` covering the spec matrix:
  - `normalizeKey(" SIKAR ")` === `"sikar"`; `normalizeKey("XYZ")` === `"xyz"` (trim + lowercase, both sides).
  - `detectProjectDuplicates` with `SIKAR/XYZ` + `sikar/xyz` → one group with 2 members.
  - `SIKAR/XYZ` + `SIKAR/ABC` + `JAIPUR/XYZ` → `[]` (allowed combos never flagged).
  - `SIKAR/XYZ` + `SIKAR/xyz` + `sikar/XyZ` + `" SIKAR "/" XYZ "` → one group, 4 members (all normalization variants).
  - `SIKAR/XYZ` + `SIKAR/ABC` → `[]`; `SIKAR/XYZ` + `JAIPUR/XYZ` → `[]`.
  - A lone project → `[]`. Empty districts map (orphaned DistrictID) → member counted with `DistrictName: ""`, still grouped by name when names match.
- [ ] **Step 2: Run to verify failure.** `yarn test projectIdentity` — expected FAIL (module missing).
- [ ] **Step 3: Implement** `projectIdentity.ts` (pure functions per the code below).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(db): add project identity normalization primitives`

```ts
// src/database/projectIdentity.ts
export function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export function buildProjectIdentity(
  districtName: string,
  projectName: string
): { districtKey: string; projectKey: string } {
  return {
    districtKey: normalizeKey(districtName),
    projectKey: normalizeKey(projectName),
  };
}

export interface ProjectDuplicateGroup {
  districtKey: string;
  projectKey: string;
  members: Array<{
    ProjectID: number;
    ProjectName: string;
    DistrictName: string;
    DBPath: string | null;
  }>;
}

export interface DuplicateScanProject {
  ProjectID: number;
  ProjectName: string;
  DistrictID: number;
  DBPath: string | null;
}

export function detectProjectDuplicates(
  projects: DuplicateScanProject[],
  districts: Array<{ DistrictID: number; DistrictName: string }>
): ProjectDuplicateGroup[] {
  const nameByDistrict = new Map(districts.map((d) => [d.DistrictID, d.DistrictName]));
  const groups = new Map<string, ProjectDuplicateGroup>();
  for (const p of projects) {
    const districtName = nameByDistrict.get(p.DistrictID) ?? "";
    const { districtKey, projectKey } = buildProjectIdentity(districtName, p.ProjectName);
    const key = `${districtKey}|${projectKey}`;
    const group = groups.get(key) ?? { districtKey, projectKey, members: [] };
    group.members.push({
      ProjectID: p.ProjectID,
      ProjectName: p.ProjectName,
      DistrictName: districtName,
      DBPath: p.DBPath,
    });
    groups.set(key, group);
  }
  return [...groups.values()].filter((g) => g.members.length > 1);
}
```

---

## Task 2: Typed duplicate error + SQLite constraint detection

**Files:**
- Modify: `frontend/src/database/repositories/ProjectRepository.ts`
- Test: extend `frontend/src/__tests__/repositories/ProjectRepository.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3, 6, 7):
  - `export class ProjectAlreadyExistsError extends Error` — `name = "ProjectAlreadyExistsError"`, message `"A project with the same District and Project Name already exists."`, optional `existingProjectId?: number`
  - `export function isUniqueConstraintError(e: unknown): boolean` — true when `e.code === "SQLITE_CONSTRAINT_UNIQUE"` OR message matches `/UNIQUE constraint failed/i`

- [ ] **Step 1: Write failing tests**:
  - `isUniqueConstraintError({ code: "SQLITE_CONSTRAINT_UNIQUE" })` → true.
  - `isUniqueConstraintError(new Error("UNIQUE constraint failed: Projects.DistrictKey, Projects.ProjectKey"))` → true.
  - `isUniqueConstraintError(new Error("disk I/O error"))` → false; `isUniqueConstraintError(null)` → false.
  - `new ProjectAlreadyExistsError(7).existingProjectId === 7` and message matches spec copy.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** in `ProjectRepository.ts` (below the imports).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(db): add ProjectAlreadyExistsError and constraint detection`

```ts
export class ProjectAlreadyExistsError extends Error {
  constructor(public readonly existingProjectId?: number) {
    super("A project with the same District and Project Name already exists.");
    this.name = "ProjectAlreadyExistsError";
  }
}

export function isUniqueConstraintError(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (!err) return false;
  return (
    err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (typeof err.message === "string" && /UNIQUE constraint failed/i.test(err.message))
  );
}
```

---

## Task 3: Repository-level uniqueness enforcement

**Files:**
- Modify: `frontend/src/database/repositories/ProjectRepository.ts`
- Test: extend `frontend/src/__tests__/repositories/ProjectRepository.test.ts`
- Test (integration): new `frontend/src/__tests__/database/projectUniqueness.test.ts` (uses the real in-memory `expo-sqlite` mock)

**Interfaces:**
- Consumes: `buildProjectIdentity` (Task 1), `ProjectAlreadyExistsError`/`isUniqueConstraintError` (Task 2)
- Produces:
  - `createProject(data): Promise<number>` — now also inserts `DistrictKey`/`ProjectKey`; throws `ProjectAlreadyExistsError` on pre-check hit or constraint violation
  - `updateProject(projectId, data): Promise<void>` — recomputes keys, guards against colliding with *another* project (`ProjectID != ?`), throws `ProjectAlreadyExistsError` on collision
  - `cloneProject(sourceProjectId, newName): Promise<number>` — guards (source district + new name), throws `ProjectAlreadyExistsError`

- [ ] **Step 1: Write failing tests** (mocked-db style, mirroring existing patterns in `ProjectRepository.test.ts`):
  1. First create succeeds and INSERT includes `DistrictKey`/`ProjectKey` with normalized values (assert SQL contains both columns; assert original `projectName` passed through unchanged — stored value not rewritten).
  2. Exact duplicate (same district name + same project name) → pre-check `getFirstAsync` returns existing row → rejects with `ProjectAlreadyExistsError`, `runAsync` NOT called.
  3. Same district + different project name → pre-check returns null → succeeds.
  4. Different district + same project name → succeeds.
  5. `XYZ` vs `xyz`: seed row with `ProjectKey = "xyz"` (via mock `getFirstAsync`) → attempt `projectName: "XYZ"` → rejected.
  6. `SIKAR` vs `sikar` (different DistrictID but same DistrictName — mock `getFirstAsync` returns district row for name lookup) → rejected.
  7. Both differ only by case → rejected.
  8. `" XYZ "` with leading/trailing whitespace → rejected against `"xyz"`.
  9. Stored/displayed values not modified: assert `runAsync` received the ORIGINAL `projectName` string, and `updateProject` SQL keeps original `ProjectName` in SET.
  14. Repository works when UI bypassed: call `createProject` directly with duplicate → throws `ProjectAlreadyExistsError`.
  15. Concurrent duplicate: two `createProject` calls; `getFirstAsync` → null for BOTH (pre-checks miss); `runAsync` first call OK, second call rejects with `{ code: "SQLITE_CONSTRAINT_UNIQUE" }` → expect second call rejects with `ProjectAlreadyExistsError`.
  16. Constraint message variant: `runAsync` rejects with `new Error("UNIQUE constraint failed: Projects.DistrictKey, Projects.ProjectKey")` → converted to `ProjectAlreadyExistsError`.
  17. Unexpected failure propagates as-is (does not get converted): `runAsync` rejects with `new Error("disk I/O error")` → original error rethrown.
  - `cloneProject`: clone to colliding name in same district → rejected; clone to new name → succeeds, INSERT includes keys.
  - `updateProject`: renaming to a name that collides with a DIFFERENT project → rejected; updating self to its own current values → allowed (excludes self).
- [ ] **Step 2: Run to verify failures.**
- [ ] **Step 3: Implement**:
  - Private helper `static async getDistrictName(districtId: number): Promise<string>` → `SELECT DistrictName FROM Districts WHERE DistrictID = ?` (throw `Error("District not found")` when absent).
  - Private helper `static async findExistingByKeys(districtKey, projectKey, excludeProjectId?): Promise<number | null>` → `SELECT ProjectID FROM Projects WHERE DistrictKey = ? AND ProjectKey = ?` (+ `AND ProjectID != ?` when excluding) `LIMIT 1`.
  - `createProject`: fetch district name → `buildProjectIdentity` → pre-check → INSERT with `DistrictKey`, `ProjectKey` → catch: if `isUniqueConstraintError(e)` → log `duplicateDetected` + throw `ProjectAlreadyExistsError()`. Logs: on pre-check hit → `[ProjectCreate] duplicateDetected projectId=${id}` + `[ProjectCreate] rejectedDuplicate`; on success → `[ProjectCreate] success projectId=${newId}`.
  - `updateProject`: fetch district name for the NEW `districtId` → keys → pre-check excluding self → UPDATE sets `DistrictKey = ?, ProjectKey = ?` as well → catch constraint → `ProjectAlreadyExistsError`.
  - `cloneProject`: uses `source.DistrictName` (already fetched by `getProjectById`) → keys → pre-check (no self-exclusion — clone always creates a new row; a clone name equal to the source's own name in the same district IS a duplicate) → INSERT with keys → catch constraint → typed error.
  - All `[ProjectCreate]` log lines use district NAME (not ID) where available; no inspection/photo data logged.
- [ ] **Step 4: Run repository tests + integration test to verify pass.**
- [ ] **Step 5: Commit** `feat(db): enforce normalized District+ProjectName uniqueness in repository`

Integration test (`projectUniqueness.test.ts`) — real in-memory mock, mirroring `isolation.test.ts` setup (`jest.mock("expo-sqlite")`, path-aware handles):
- Creates Projects rows with DistrictKey/ProjectKey directly via `getGlobalDatabase().runAsync` (simulating existing data), then asserts `createProject` pre-check rejects.
- Cross-project isolation add-on (AGENTS.md mandate): inserting a duplicate row never touches any project DB handle (`setActiveProject` never called during repo create).

---

## Task 4: Schema migration — key columns + unique index + duplicate report

**Files:**
- Modify: `frontend/src/database/schema.ts`
- Modify: `frontend/src/database/DatabaseService.ts`
- Test: extend `frontend/src/__tests__/database/schema.test.ts`
- Test: extend `frontend/src/__tests__/database/DatabaseService.test.ts`

**Interfaces:**
- Consumes: `detectProjectDuplicates` (Task 1)
- Produces:
  - `export async function migrateProjectUniqueness(): Promise<ProjectDuplicateGroup[]>` — idempotent; returns current duplicate groups (empty when clean)
  - `export function getProjectDuplicates(): ProjectDuplicateGroup[]` (DatabaseService) — non-blocking report state

**Migration semantics (non-destructive):**
1. Fast path: if index `uq_projects_district_project` already exists in `sqlite_master` → return `[]` (nothing to do).
2. `ALTER TABLE Projects ADD COLUMN DistrictKey TEXT;` + `ADD COLUMN ProjectKey TEXT;` (each in try/catch — "column already exists" is fine; existing pattern at schema.ts:66-80).
3. Read `SELECT ProjectID, ProjectName, DistrictID, DBPath, DistrictKey, ProjectKey FROM Projects` + `SELECT DistrictID, DistrictName FROM Districts`.
4. Backfill in JS (not SQL — the test mock cannot evaluate correlated-subquery SET values): for each row where `ProjectKey` is NULL or empty → compute `buildProjectIdentity(districtName, projectName)` → `UPDATE Projects SET DistrictKey = ?, ProjectKey = ? WHERE ProjectID = ?`.
5. `detectProjectDuplicates(...)` → groups.
6. If `groups.length === 0` → `CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_district_project ON Projects(DistrictKey, ProjectKey);`
7. If duplicates exist → SKIP index creation (never destructively migrate), log each group at `logger.warn` (ProjectID / District / ProjectName / DBPath), return groups.
8. Fresh-install DDL (schema.ts:48-63): add `DistrictKey TEXT, ProjectKey TEXT` to the CREATE TABLE so new installs start with the columns.

**DatabaseService wiring:**
- `let projectDuplicates: ProjectDuplicateGroup[] = [];`
- `export function getProjectDuplicates(): ProjectDuplicateGroup[] { return projectDuplicates; }`
- In `initializeDatabase()` after `await createGlobalSchema();`: `projectDuplicates = await migrateProjectUniqueness();` — MUST NOT throw on duplicates (app start stays functional; `_layout.tsx` only shows the error screen on real failures).

- [ ] **Step 1: Write failing tests** (extend `schema.test.ts`; it already mocks the db module — assert call sequences; plus a new in-memory-mock test file `projectUniquenessMigration.test.ts` for behavior):
  18. Existing duplicate records detected BEFORE index creation: seed two Projects rows with same `DistrictKey`/`ProjectKey` → `migrateProjectUniqueness()` returns one group with both ProjectIDs; `CREATE UNIQUE INDEX` NOT issued.
  - Clean data → index statement issued; returns `[]`.
  - Idempotent: index already exists (sqlite_master row present) → returns `[]`, no ALTER/UPDATE issued.
  - Backfill: row with NULL `ProjectKey` gets `DistrictKey`/`ProjectKey` computed from Districts lookup (assert UPDATE params).
  - Fresh DDL includes the two columns (assert `createGlobalSchema` execAsync SQL contains `DistrictKey TEXT`).
  - `DatabaseService.test.ts`: `initializeDatabase` stores dup groups via `getProjectDuplicates()`; does NOT throw when duplicates exist.
- [ ] **Step 2: Run to verify failures.**
- [ ] **Step 3: Implement** per semantics above.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(db): add project uniqueness migration with non-destructive duplicate report`

---

## Task 5: District-qualified project DB folders

> ⚠️ **DECISION GATE (approved in assessment):** New projects now use `Projects/<District>_<ProjectName>/inspection.db`. Existing projects keep their stored `DBPath` untouched. Required so allowed combos (e.g., `SIKAR/XYZ` + `JAIPUR/XYZ`) never share one `inspection.db`. Backup/restore whitelist (`Projects/[^/]+/inspection.db`) is generic and unaffected.

> ✅ **APPROVED DEVIATION (15 Aug 2026, during review):** Implemented folder names carry a deterministic 8-hex FNV-1a suffix of the normalized identity — `Projects/<District>_<ProjectName>_<8-hex>/inspection.db` — instead of the verbatim `District_Project` scheme above. The suffix makes folder paths collision-proof, fixing the scheme's own `A_B`+`C` vs `A`+`B_C` ambiguity and case/whitespace variants; labels (`buildProjectFolderLabel`, Download photo folder) keep the verbatim scheme. Documented in ADR-028. Existing project folders are untouched.

**Files:**
- Modify: `frontend/src/utils/folderNaming.ts`
- Modify: `frontend/src/database/helpers/ProjectDBManager.ts`
- Modify: `frontend/src/database/repositories/ProjectRepository.ts` (cloneProject call site)
- Modify: `frontend/app/projects/new.tsx`, `frontend/app/index.tsx` (call sites)
- Test: update `frontend/src/__tests__/database/helpers/ProjectDBManager.test.ts`, extend `frontend/src/__tests__/utils/folderNaming.test.ts`

**Interfaces:**
- Produces:
  - `export function buildProjectFolderLabel(districtName: string, projectName: string): string` — `sanitizeFolderName(`${districtName}_${projectName}`)` with trim fallback (identical to current `canonicalProjectLabel` behavior)
  - `getProjectDbPath(districtName: string, projectName: string): string` — label-based path

- [ ] **Step 1: Write failing/updated tests**:
  - `buildProjectFolderLabel("SIKAR", "XYZ")` → `"SIKAR_XYZ"`; illegal chars sanitized (`"A:B/C"` → `"A_B_C"`).
  - `getProjectDbPath("Jaipur", "AMC 2026")` → contains `Projects/Jaipur_AMC 2026/inspection.db` (replaces the old `getProjectDbPath("MyProject")` assertions at ProjectDBManager.test.ts:51-63).
  - `canonicalProjectLabel` still matches `buildProjectFolderLabel` output for the same project (regression).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**:
  - `folderNaming.ts`: add `buildProjectFolderLabel`; refactor `canonicalProjectLabel` to delegate to it.
  - `ProjectDBManager.ts`: `getProjectDbPath(districtName, projectName)` uses `buildProjectFolderLabel`.
  - `ProjectRepository.cloneProject`: `getProjectDbPath(source.DistrictName ?? "", newName)`.
  - `app/index.tsx` handleClone: `getProjectDbPath(selectedProject.DistrictName ?? "", cloneName.trim())`.
  - `app/projects/new.tsx`: pass district name (done as part of Task 6/7 wiring).
- [ ] **Step 4: Run tests to verify pass.**
- [ ] **Step 5: Commit** `feat(db): district-qualified project DB folder paths for new projects`

---

## Task 6: ProjectCreateService orchestrator (create + cleanup)

**Files:**
- Create: `frontend/src/database/services/ProjectCreateService.ts`
- Test: new `frontend/src/__tests__/database/services/ProjectCreateService.test.ts`

**Interfaces:**
- Consumes: `ProjectRepository.createProject`, `ProjectAlreadyExistsError`, `createProjectDb`, `getProjectDbPath`, `deleteProjectDb`, `buildProjectFolderLabel`, `ensureProjectFolder`, `requestAndroidBackup`
- Produces: `export async function createProjectFlow(input: { projectName: string; districtId: number; districtName: string; client?: string; description?: string; inspectorName?: string }): Promise<number>` — returns new ProjectID; throws `ProjectAlreadyExistsError` (rejected, nothing created) or rethrows unexpected failures after cleaning up ONLY its own resources.

**Flow (exact order — rejection precedes ALL resource creation):**
1. `logger.info("[ProjectCreate] start district=${input.districtName} project=${input.projectName}")`
2. `const dbPath = getProjectDbPath(input.districtName, input.projectName)` — string only, no FS writes.
3. `newId = await ProjectRepository.createProject({ projectName, districtId, dbPath, safPath: null, client, description, inspectorName })` — duplicate rejection happens here (repo pre-check + unique index backstop).
4. `await createProjectDb(input.projectName, dbPath, newId)` — folder + schema + seeds.
5. `await ensureProjectFolder(buildProjectFolderLabel(input.districtName, input.projectName))` — Download photo folder; failure logged, non-fatal (existing behavior at new.tsx:112-114).
6. Return `newId`.
7. Catch: `ProjectAlreadyExistsError` → log `[ProjectCreate] rejectedDuplicate`, rethrow untouched. Any other error → log `[ProjectCreate] failed=...`; if `newId != null` → `deleteProject(newId)`; `deleteProjectDb(dbPath)`; `requestAndroidBackup()` (fire-and-forget, matching delete/clone patterns); rethrow.

**Safety note:** cleanup is safe because (a) the row ID belongs to this attempt only, and (b) the district-qualified folder path is unique to this attempt (verified Task 3/5). The pre-existing project is never referenced by either cleanup call.

- [ ] **Step 1: Write failing tests** (mock `ProjectRepository`, `ProjectDBManager`, `storageManager`, `androidBackup`):
  - Happy path: repo called with district-qualified dbPath; `createProjectDb` then `ensureProjectFolder` called with the label; returns id.
  - Duplicate: repo throws `ProjectAlreadyExistsError` → `createProjectDb`/`ensureProjectFolder`/`deleteProjectDb` NOT called; error rethrown.
  - No-resource-on-dup: assert `FileSystem.makeDirectoryAsync`/`deleteAsync` never called for the duplicate case.
  - Unexpected `createProjectDb` failure → `deleteProject(newId)` + `deleteProjectDb(dbPath)` called; existing project untouched (no calls referencing any other path).
  - Log line assertions: `[ProjectCreate] start`, `[ProjectCreate] rejectedDuplicate`, `[ProjectCreate] failed=` present at the right points.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** per flow above.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(db): add project creation orchestrator with duplicate-safe ordering and cleanup`

---

## Task 7: UI wiring — creation screen

**Files:**
- Modify: `frontend/app/projects/new.tsx`

**Changes (create branch of `saveProject` only; edit branch unchanged except error handling for collisions):**
- Import `createProjectFlow` and `ProjectAlreadyExistsError`.
- Create branch: replace steps 92-116 with a single `await createProjectFlow({ projectName: projectName.trim(), districtId: Number(district), districtName, client: client.trim(), description: description.trim(), inspectorName: inspectorName.trim() })` where `districtName` comes from the loaded `districts` list.
- Catch `ProjectAlreadyExistsError` → `Alert.alert("Project Already Exists", "A project with the same District and Project Name already exists.")` → `return` (stay on the creation screen; `router.back()` NOT called).
- Any other error → existing generic `Alert.alert("Error", "Unable to save project.")` → `return`.
- Edit branch: catch `ProjectAlreadyExistsError` (from `updateProject` collision guard) → same dialog copy → stay.
- Ensure `router.back()` only runs after a successful save (restructure so it is NOT inside a path that can throw).

- [ ] **Step 1: Write failing test** — no existing screen test harness for `new.tsx`; add a focused component test `frontend/src/__tests__/app/projects/new.test.tsx` if the project's render-test conventions allow, else cover via `ProjectCreateService` tests + a manual device check. (Confirm with reviewer before adding if harness overhead is high.)
- [ ] **Step 2: Implement** the wiring per above.
- [ ] **Step 3: Manual verification checklist (device/emulator)** — the spec's reproduce script:
  - Create `Jaipur` / `AMC 2026` → success.
  - Recreate exact same → dialog `Project Already Exists` / exact message; stays on screen; no new folder in `Documents/Projects/`; no new row (list still 1).
  - `Jaipur` / `amc 2026` → duplicate dialog. `Jaipur` / `AMC 2026 ` (trailing space) → duplicate dialog.
  - `Jaipur` / `AMC 2027` → success. `Sikar` / `AMC 2026` → success (verify separate `Projects/Sikar_AMC 2026/` folder).
  - Existing project's inspections untouched after rejected attempts.
- [ ] **Step 4: Commit** `feat(ui): block duplicate project creation with friendly dialog`

---

## Task 8: Surface pre-existing duplicates (Database screen)

**Files:**
- Modify: `frontend/app/database/index.tsx`

**Changes:**
- Read `getProjectDuplicates()` on focus; when non-empty, render a warning `List.Item`/banner: "Duplicate projects detected (N groups)" with expandable detail per group (ProjectID, District, ProjectName, DBPath, photo-folder label `buildProjectFolderLabel(...)`).
- Copy: "Duplicate projects were found in the project database. Resolve them before enabling full duplicate protection." (No destructive action offered.)
- This is the "ask for a migration decision" surface: the app never auto-merges/deletes; the report tells the user to stop and decide.

- [ ] **Step 1: Write failing test** — extend a small render test for the banner (mirror existing component test style) or cover via `getProjectDuplicates` unit assertions + manual check.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit** `feat(ui): surface pre-existing duplicate projects report on Database screen`

---

## Task 9: Docs

**Files:**
- Modify: `frontend/docs/10-DATABASE_ARCHITECTURE.md` (Projects table columns; `getProjectDbPath(districtName, projectName)` signature at line ~126; uniqueness section)
- Modify: `frontend/docs/09-Decisions.md` — new ADR: "Project uniqueness enforced on normalized (DistrictKey, ProjectKey); denormalized key columns + unique index; district-qualified folder paths for new projects; non-destructive duplicate migration report"

- [ ] **Step 1: Write ADR + update architecture doc.**
- [ ] **Step 2: Commit** `docs(db): document project uniqueness design and ADR`

---

## Task 10: Full verification gate

- [ ] **Step 1: Run `yarn test`** (expect 808+ tests, all suites green; watch per-glob coverage thresholds — new files must meet them).
- [ ] **Step 2: Run `npx tsc --noEmit`** — clean.
- [ ] **Step 3: Run `yarn lint`** — 0 errors (pre-existing warnings acceptable).
- [ ] **Step 4: Device smoke test** — reproduce script from Task 7 Step 3 + backup/restore round-trip (backup with a new-style project folder, restore, verify project opens and dup detection still works).
- [ ] **Step 5: Commit** `chore: verification gate for project uniqueness`

---

## Testing Strategy (spec mapping)

| # | Spec requirement | Covered by |
|---|------------------|------------|
| 1 | First create succeeds | Task 3 test 1, Task 6 happy path |
| 2 | Exact duplicate rejected | Task 3 test 2, Task 6 dup |
| 3 | Same district, different name OK | Task 3 test 3 |
| 4 | Different district, same name OK | Task 3 test 4 |
| 5 | Name case differs → rejected | Task 3 test 5 |
| 6 | District case differs → rejected | Task 3 test 6 |
| 7 | Both case differ → rejected | Task 3 test 7 |
| 8 | Whitespace ignored | Task 1 matrix, Task 3 test 8 |
| 9 | Stored values not modified | Task 3 test 9 |
| 10 | No second project DB | Task 6 no-resource-on-dup (makeDirectory never called) |
| 11 | No second photo/storage dir | Task 6 same assertion (ensureProjectFolder never called) |
| 12 | Existing project unchanged | Task 6 cleanup-safety test, Task 7 manual |
| 13 | Existing inspections unchanged | Task 7 manual + integration isolation add-on (Task 3) |
| 14 | Works without UI validation | Task 3 test 14 |
| 15 | Concurrent duplicates → one wins | Task 3 test 15 |
| 16 | UNIQUE error → duplicate result | Task 3 tests 15/16, Task 2 |
| 17 | Unexpected failure safe | Task 3 test 17, Task 6 cleanup |
| 18 | Existing dups detected pre-migration | Task 4 test 18 |

## Risks & Mitigations

- **HIGH — folder path scheme change (Task 5):** new projects get district-qualified folders. Mitigation: existing rows keep stored DBPath (zero migration); backup/restore whitelist generic; Download photo folder already uses this convention; flagged as DECISION GATE.
- **HIGH — pre-existing duplicates block unique index:** migration reports + skips index; repo-level check still prevents new duplicates; app stays usable; Database screen surfaces the report. No destructive action ever.
- **MEDIUM — mock lacks UNIQUE enforcement:** constraint-path tests use mocked db (sequenced rejections); integration tests rely on repo pre-check. Documented in Global Constraints.
- **MEDIUM — clone/update collision guard changes behavior:** clone to a colliding name and rename-to-collision now rejected with the friendly dialog (previously silently allowed). Intended per "any code path that creates a project".
- **LOW — restored old backup with duplicate projects:** after restore, app-start migration reports them (non-blocking) and skips index until resolved; ZIP format and restore logic untouched.
- **LOW — downgrade scenario:** restoring a future backup (with key columns) into an older app version leaves keys NULL → old app could recreate duplicates. Out of scope; documented in ADR.
- **LOW — `Projects` rows with orphaned DistrictID** (FK off historically) get `DistrictKey = ""`; they still group by name when names match; noted in migration logs.

## Estimated Complexity

**HIGH** — schema migration + repository enforcement + folder-path change + orchestrator + 18-point test matrix. Estimate: 2–3 focused sessions (each task is independently testable and committable).
