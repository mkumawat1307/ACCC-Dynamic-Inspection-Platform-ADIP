# Implementation Plan — Folder Management (SAF photo-folder standardization + lazy per-project migration)

- **Date:** 2026-08-05
- **Status:** Awaiting approval
- **Approved design:** `docs/superpowers/specs/2026-08-05-folder-management-design.md` (committed `25c17d5`)

## Goal

Standardize the SAF photo folder layout from legacy names (project-name-only folders and old alphanumeric-stripped labels) to the canonical `<District>_<ProjectName>` folder inside `DCIM/ACCC Inspection/`, and migrate existing photos lazily — per project, on project open — without data loss, without blocking the UI, and fully isolated per project DB.

## Architecture

- **Naming** (`src/utils/folderNaming.ts`): pure functions. Canonical label keeps spaces, replaces only `<>:"/\|?*` with `_`; legacy candidates are derived (not guessed) from the same project fields, so we never touch a folder we didn't create by a known prior rule.
- **Migration** (`src/utils/folderManager.ts`): fire-and-forget orchestrator. Runs inside the already-open **project** DB (never calls `getGlobalDatabase()`), uses the sequential-open/close SAF handle, guards against concurrent runs with an in-memory `Set<ProjectID>`, and is fully testable against the manual SAF mock.
- **Copy strategy:** SAF has no directory rename → recreate canonical folder (via existing `getProjectDir`), copy each non-duplicate file (createFile + read/write base64), and only after **all** copies for a legacy folder succeed, recursively `deleteAsync` the legacy folder (legacy SAF `deleteAsync` is recursive on SAF URIs — verified in expo-file-system source). Never overwrite existing canonical files. Partial failure leaves the legacy folder fully intact.
- **DB remap:** new `PhotoRepository.remapFilePaths(uriMap)` rewrites `Photos.FilePath` from old → new SAF URI per copied file, inside the project DB.
- **Trigger:** `InspectionContext.openProject` fires the migration after the project is opened/set; errors are caught + `logger.warn`-ed (never throw into the UI flow).

## Tech stack

React Native / Expo SDK 54, `expo-file-system/legacy` (SAF via `StorageAccessFramework`), expo-sqlite v16 (sequential open/close, ADR-014), AsyncStorage (legacy SAF cache keys), Jest (jest-expo preset), TypeScript strict.

## Spec

See `docs/superpowers/specs/2026-08-05-folder-management-design.md`. Key locked decisions this plan implements:

1. Canonical label = `District_Project`, spaces/punctuation kept, only `<>:"/\|?*` → `_`; empty district → project name alone.
2. Legacy candidates = project-name-only folder (current app behavior) + old alphanumeric-stripped label (pre-live-watermark behavior). Both are re-derived from project fields; lookup is by listing `ACCC Inspection/` + matching by name (no stale-URI dependence).
3. Lazy migration per project on open; in-flight guard; never run two migrations concurrently.
4. Recreate + copy; delete legacy folder **only after all copies succeed**; skip files already present in canonical; single `remapFilePaths` call after all folders processed.
5. Revoked/no SAF permission → `ensureTreeUri()` throws → migration logs a warning and exits silently.
6. Every project-scoped change ships with an isolation regression test.

## Global Constraints

- **Do NOT call `getGlobalDatabase()`** anywhere in the migration path. All DB access goes through `PhotoRepository` (`getDatabase()` returns the active project handle). Migration runs while the project DB is open (per `InspectionContext.openProject`).
- Respect the sequential open/close model — one `SQLiteDatabase` handle at a time; no second handle, no close/reopen.
- All new per-project data/files are created in the project DB / the project's SAF folder only. Nothing global.
- Follow repository pattern — UI never queries SQLite directly; the trigger only calls `migrateProjectPhotoFolder(project)`.
- TypeScript strict; no `any`; no code comments unless the existing file has them; PascalCase components/repos/interfaces, camelCase functions/vars, UPPER_CASE constants.
- Tests must use the manual mocks (`__mocks__/expo-file-system.ts`, `__mocks__/expo-sqlite.ts`, built-in async-storage jest mock) with per-test `beforeEach` reset. No factory-mock overrides that bypass the manual mock for the code under test.
- Do not push/merge anything to origin/main (local diverges 73/2 by design).

## The Tasks

### Task 1 — `src/utils/folderNaming.ts` + unit tests

**Context**

Pure naming functions. Nothing else depends on them until Task 4/5. Design §"Naming". Must be exact — the migration compares labels with actual on-disk folder names, so behavior is defined by tests.

**Tasks**

1. Create `src/utils/folderNaming.ts` exporting:
   - `sanitizeFolderName(name: string): string` — `name.replace(/[<>:"/\\|?*]/g, "_")`.
   - `canonicalProjectLabel(project: Project): string` — trims `DistrictName` and `ProjectName`; if both non-empty returns `sanitizeFolderName(`${district}_${projectName}`)`; else `sanitizeFolderName(district || projectName)`.
   - `legacyStrippedLabel(project: Project): string` — takes the same `district_project` (or single-name) source and replaces every non-alphanumeric char with `_`, collapses `_+` → `_`, trims leading/trailing `_` (old app's stripping rule).
   - `legacyProjectOnlyLabel(project: Project): string` — `sanitizeFolderName(ProjectName)` (the current app's label rule).
2. Create `src/__tests__/utils/folderNaming.test.ts` covering:
   - sanitize: each illegal char `<>:"/\|?*` → `_`; legal chars (`- . ' ( ) , &` and spaces) preserved; empty string preserved.
   - canonical: `{DistrictName:"New Delhi", ProjectName:"Project Alpha"}` → `"New Delhi_Project Alpha"`; empty district → `"Project Alpha"`; names with illegal chars sanitized; district trimmed.
   - legacyStrippedLabel: `"New Delhi_Project Alpha"` → `"New_Delhi_Project_Alpha"`; no leading/trailing `_`.
   - legacyProjectOnlyLabel: `"Project Alpha"` → `"Project Alpha"`.
   - Labels must be distinct where the rules produce different names (assert canonical ≠ stripped for a spaced district/project).
3. Build a `makeProject(overrides)` fixture matching the **full** `Project` interface in `src/models/Project.ts` (check the model for required fields — ProjectID, ProjectName, DistrictID, DBPath, SAFPath, DistrictName, DivisionName, Block, Client, and any others).

**Validation**

```powershell
npx jest src/__tests__/utils/folderNaming.test.ts
npx tsc --noEmit
npx eslint src/utils/folderNaming.ts src/__tests__/utils/folderNaming.test.ts
```

### Task 2 — Extend the manual expo-file-system mock with the SAF namespace + probe test

**Context**

`frontend/__mocks__/expo-file-system.ts` is the manual mock. `__mocks__/expo-file-system/legacy.ts` is a 37-byte re-export (`export * from "../expo-file-system"`) — extending the root mock automatically upgrades `expo-file-system/legacy`. All existing consumers either use per-test factories (unaffected) or no FileSystem calls in test (ProjectRepository), so extending is backward-safe. Real SAF semantics verified: `readDirectoryAsync` → child names, `makeDirectoryAsync(parent, name)` → full URI, `createFileAsync(parent, name, mime)` → full URI, `deleteAsync` recursive on SAF URIs, `requestDirectoryPermissionsAsync` → `{granted, directoryUri}`.

**Tasks**

1. Extend `__mocks__/expo-file-system.ts`:
   - Keep existing exports (documentDirectory, cacheDirectory, EncodingType, writeAsStringAsync, readAsStringAsync, getInfoAsync, makeDirectoryAsync, deleteAsync, getContentUriAsync) and existing top-level semantics (write creates-if-missing, read throws when missing).
   - Add a shared in-memory `entries: Map<string, { type: "file" | "dir"; content: string }>` keyed by URI (`content://mock/...`). Replace the old `files` map storage with `entries` for top-level read/write so SAF and non-SAF operations share state.
   - Add `export const StorageAccessFramework = { ... }`:
     - `requestDirectoryPermissionsAsync(initialUri?)` → `{ granted, directoryUri }`; `directoryUri = "content://mock/tree/"`; `granted` controlled by a new `__setPermissionGranted(value)`.
     - `readDirectoryAsync(dirUri)` → child entry names (throw `Directory not found` if missing/non-dir).
     - `makeDirectoryAsync(parentUri, dirName)` → creates dir entry, returns `${parentUri}/${dirName}` (throw if parent missing).
     - `createFileAsync(parentUri, fileName, mimeType)` → creates file entry, returns `${parentUri}/${fileName}` (throw if parent missing or file exists).
     - `writeAsStringAsync` / `readAsStringAsync` / `deleteAsync` — alias the top-level functions; `deleteAsync` deletes the entry **and recursively all entries under `${uri}/`**.
     - `getInfoAsync` — works for any entry (dir or file).
   - Add `__resetFsState()` that clears `entries` and resets permission-granted to `true` (keep `__resetFsState` exported as it already is).
2. Add module augmentation in `src/__tests__/test-module-augments.d.ts` (mirror the existing `expo-location`/`expo-document-picker` pattern): declare `expo-file-system/legacy` exports `__resetFsState(): void` and `__setPermissionGranted(value: boolean): void` so mock helpers typecheck.
3. Create `src/__tests__/mocks/expoFileSystemMock.test.ts` (pattern: `jest.mock("expo-file-system/legacy")`, `import * as FileSystem from "expo-file-system/legacy"`, `beforeEach(() => FileSystem.__resetFsState())`):
   - Creates `tree → "ACCC Inspection" → "New Delhi_Block A"`, writes base64 into a created file, asserts `readDirectoryAsync` returns `["New Delhi_Block A"]` / `["photo_a.jpg"]`, read back equals written content.
   - `deleteAsync` on the project dir removes it recursively (assert parent listing is `[]`).
   - Permission denied: `__setPermissionGranted(false)` → `requestDirectoryPermissionsAsync` returns `{granted:false}`.
   - Missing dir read rejects.

**Validation**

```powershell
npx jest src/__tests__/mocks/expoFileSystemMock.test.ts
npx jest src/__tests__/utils/useWatermarkProcessor.test.ts src/__tests__/database/repositories/PhotoRepository.test.ts src/__tests__/database/db.test.ts
npx tsc --noEmit
npx eslint __mocks__/expo-file-system.ts src/__tests__/mocks/expoFileSystemMock.test.ts src/__tests__/test-module-augments.d.ts
```

### Task 3 — `PhotoRepository.remapFilePaths` + unit test

**Context**

`PhotoRepository` (per-project DB via `getDatabase()`) already has `updateFilePath(photoId, filePath)` using `runAsync("UPDATE Photos SET FilePath = ? WHERE PhotoID = ?", ...)`. The expo-sqlite manual mock supports `UPDATE` + `parseWhere` and returns `{ lastInsertRowId, changes }`. Mirror existing methods (class style, repository pattern).

**Tasks**

1. Add to `src/database/repositories/PhotoRepository.ts`:
   ```ts
   public async remapFilePaths(uriMap: Record<string, string>): Promise<number> {
     let updated = 0;
     for (const [oldUri, newUri] of Object.entries(uriMap)) {
       const db = getDatabase();
       const result = await db.runAsync(
         "UPDATE Photos SET FilePath = ? WHERE FilePath = ?",
         newUri,
         oldUri
       );
       updated += result.changes;
     }
     return updated;
   }
   ```
   Match the existing `getDatabase()` access pattern in this repo (adjust if it uses a base-class helper).
2. Add `src/__tests__/database/repositories/PhotoRepository.test.ts` cases (follow the existing file's pattern — dynamic `require("@/src/database/repositories/PhotoRepository")` after `jest.mock("expo-sqlite")` + `jest.resetModules()` + `setActiveProject`):
   - Inserts two photos with `FilePath` values, then `remapFilePaths({ old1: new1, old2: new2 })` updates both; returns 2; re-fetch asserts new paths.
   - Non-matching old URI updates 0 rows.
   - Empty map returns 0 without running SQL (assert no error).

**Validation**

```powershell
npx jest src/__tests__/database/repositories/PhotoRepository.test.ts
npx tsc --noEmit
npx eslint src/database/repositories/PhotoRepository.ts
```

### Task 4 — `src/utils/folderManager.ts` (`migrateProjectPhotoFolder`) + unit tests

**Context**

Core migration. Uses `storageManager` (`ensureTreeUri`, `getProjectDir`, and a new `resolveInspectionRootDir` extraction), `folderNaming`, `PhotoRepository.remapFilePaths`, AsyncStorage legacy cache keys (`proj_dir_<label>`), and `logger.warn`. Fully testable against the Task-2 mock + built-in async-storage mock.

**Tasks**

1. Refactor `src/utils/storageManager.ts` (behavior-preserving): extract the ACCC-dir resolution currently inside `getProjectDir(treeUri, label)` into a new exported `resolveInspectionRootDir(treeUri): Promise<string>` (verifyDir cached at `accc_dir_v2`, else `makeDirectoryAsync(treeUri, "ACCC Inspection")` + cache). `getProjectDir` calls it first, then verifies/creates the per-project dir cached at `proj_dir_<label>`. Keep `ensureTreeUri`, `verifyDir`, `writePhoto`, `deletePhoto` as-is. No behavior change — Task 2's regressions (useWatermarkProcessor.test) must stay green.
2. Create `src/utils/folderManager.ts`:
   ```ts
   export interface MigrationResult {
     migratedFiles: number;
     updatedRows: number;
     legacyFoldersRemoved: number;
   }
   ```
   - Module-level `const inFlightMigrations = new Set<number>()`.
   - `migrateProjectPhotoFolder(project: Project): Promise<MigrationResult>`:
     - If `inFlightMigrations.size > 0` → `logger.warn("[FolderManager] Another migration already in flight, skipping")` and return zeros.
     - Add `project.ProjectID` to the set; `try { return await runMigration(project); } finally { inFlightMigrations.delete(project.ProjectID); }`.
   - `runMigration(project)`:
     - Compute `canonical = canonicalProjectLabel(project)`, `stripped = legacyStrippedLabel(project)`, `projectOnly = legacyProjectOnlyLabel(project)`.
     - `const treeUri = await ensureTreeUri();` (rejects → propagates to caller's catch; nothing else runs).
     - `const canonicalDir = await getProjectDir(treeUri, canonical);`.
     - Candidates = deduped `[stripped, projectOnly]` where `!= canonical`.
     - For each candidate call `migrateLegacyFolder(...)` accumulating `migratedFiles`, `legacyFoldersRemoved`, and a shared `uriMap`.
     - If `uriMap` non-empty → `updatedRows = await PhotoRepository.remapFilePaths(uriMap);`.
     - Return `MigrationResult`.
   - `migrateLegacyFolder(treeUri, canonicalDir, legacyLabel, uriMap)`:
     - Resolve legacy dir: check AsyncStorage `proj_dir_<label>` cache (probe with `readDirectoryAsync`, remove stale cache on failure), else list `resolveInspectionRootDir(treeUri)` and match name; return `null` if not found. Wrap the listing in try/catch → `null` on failure.
     - Read legacy names and canonical names. For each legacy name not present in canonical: `createFileAsync(canonicalDir, name, "image/jpeg")` → `readAsStringAsync(oldFile, {encoding: Base64})` → `writeAsStringAsync(newFile, data, {encoding: Base64})` → `uriMap[oldFile] = newFile`. **On any copy failure:** log + abort this folder, keep legacy folder fully intact, return partial counts with `folderRemoved: false`.
     - After the loop (all copies succeeded): `FileSystem.StorageAccessFramework.deleteAsync(legacyDir)` (recursive per SAF), then `AsyncStorage.removeItem("proj_dir_<label>")`. Log warning but don't fail if delete throws; return `folderRemoved` accordingly.
   - Import `* as FileSystem from "expo-file-system/legacy"` and use `FileSystem.StorageAccessFramework.*` for SAF ops (aliases verified present in legacy namespace). Mirror `storageManager.writePhoto`'s `createFileAsync` call exactly for target naming.
3. Create `src/__tests__/utils/folderManager.test.ts`:
   - `jest.mock("expo-file-system/legacy")` (manual mock) + `jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))` + factory-mock `@/src/database/repositories/PhotoRepository` to `{ __esModule: true, default: { remapFilePaths: jest.fn(async (m) => Object.keys(m).length) } }`.
   - `beforeEach`: `FileSystem.__resetFsState()`, `AsyncStorage.clear()`, reset remap mock.
   - Helper `seedFolder(label, files[])` builds the tree under `content://mock/tree/ACCC Inspection/` and sets the `proj_dir_<label>` cache key.
   - Cases:
     - **No-op canonical:** canonical folder exists, no legacy folders → result all zeros, `remapFilePaths` not called.
     - **Project-only legacy:** seed project-only label with 2 files → files appear under canonical dir, legacy dir removed, `remapFilePaths` called with the 2 old→new pairs, `proj_dir_<projectonly>` cache removed.
     - **Stripped legacy:** seed stripped label with 1 file → migrated to canonical.
     - **Both legacy folders merged:** seed both → canonical contains all files, both legacy dirs removed, one `remapFilePaths` call with combined map.
     - **Duplicate skip:** canonical already has `a.jpg`, legacy has `a.jpg` + `b.jpg` → `a.jpg` canonical untouched, `b.jpg` copied, map has only `b.jpg` pair.
     - **Copy failure aborts folder:** make `writeAsStringAsync` reject once (spy) → legacy folder fully intact (all original files still listed), `folderRemoved: false`, remap called only for already-copied files (or none), no throw.
     - **Permission revoked:** `__setPermissionGranted(false)` + no cached tree URI → `ensureTreeUri` throws → `migrateProjectPhotoFolder` rejects (test the catch at the trigger level is Task 6's job); assert remap not called.
     - **In-flight guard:** start migration, while it's mid-flight (a pending promise) call again → second returns zeros and logs warning (assert via logger spy).
     - **Cache key cleanup:** after successful stripped migration, `proj_dir_<stripped>` and `proj_dir_<projectonly>` are removed from AsyncStorage.
4. A logger spy: `jest.spyOn(require("@/src/utils/logger"), "warn").mockImplementation(() => {})`.

**Validation**

```powershell
npx jest src/__tests__/utils/folderManager.test.ts src/__tests__/utils/useWatermarkProcessor.test.ts
npx tsc --noEmit
npx eslint src/utils/folderManager.ts src/utils/storageManager.ts
```

### Task 5 — `useWatermarkProcessor` label swap

**Context**

`src/components/inspection/useWatermarkProcessor.ts:7` imports `{ writePhoto, ensureTreeUri, getProjectDir }` from storageManager; `:142-143` currently computes the target dir as `getProjectDir(treeUri, label)` where `label` is a local variable. The new canonical label must be used so new photos land in the canonical folder.

**Tasks**

1. Replace the local `label` computation with `canonicalProjectLabel(project)` (import from `@/src/utils/folderNaming`). Verify the hook has `project` in scope (it reads from `InspectionContext`); if the label was derived from `project.ProjectName` only, that's exactly the legacy rule being replaced.
2. Update/extend `src/__tests__/hooks/useWatermarkProcessor.test.tsx` if it asserts on the target folder name — assert `getProjectDir` was called with `canonicalProjectLabel` (e.g. `"New Delhi_Project Alpha"`), not the legacy name.

**Validation**

```powershell
npx jest src/__tests__/hooks/useWatermarkProcessor.test.tsx
npx tsc --noEmit
npx eslint src/components/inspection/useWatermarkProcessor.ts
```

### Task 6 — `InspectionContext.openProject` trigger

**Context**

`src/context/InspectionContext.tsx` `openProject` (~line 50): `if (p.DBPath) { await openProjectDb(p.DBPath, p.ProjectID); } setProject(p);`. The migration must run after the project DB is open, fire-and-forget, and never throw into the UI.

**Tasks**

1. After `setProject(p)` add:
   ```ts
   migrateProjectPhotoFolder(p).catch((err) => {
     logger.warn(`[FolderManager] Migration failed for project ${p.ProjectName}:`, err);
   });
   ```
   Import `migrateProjectPhotoFolder` from `@/src/utils/folderManager` and `logger` from `@/src/utils/logger` (both already-existed imports if any — reuse).
2. Update `src/__tests__/context/InspectionContext.test.tsx` (`renderHookInProvider` pattern): assert that calling `openProject` triggers `migrateProjectPhotoFolder` with the opened project (factory-mock the module; verify call, verify the promise rejection is swallowed — component render doesn't throw / no unhandled rejection).

**Validation**

```powershell
npx jest src/__tests__/context/InspectionContext.test.tsx
npx tsc --noEmit
npx eslint src/context/InspectionContext.tsx
```

### Task 7 — `src/__tests__/database/folderIsolation.test.ts` (isolation regression)

**Context**

AGENTS.md mandates an isolation regression test for every project-scoped feature. Mirror `src/__tests__/database/captureIsolation.test.ts` (create data in Project A, open Project B, assert it does NOT appear there). Also assert the migration path never touches the global DB.

**Tasks**

1. Create `folderIsolation.test.ts` mirroring the captureIsolation pattern (`jest.mock("expo-sqlite")`, `jest.resetModules()`, dynamic `require("@/src/database/repositories/PhotoRepository")`, `setActiveProject(path)` then `getDatabase()`):
   - Create Project A and Project B DBs; insert a photo in A with FilePath `content://mock/tree/ACCC Inspection/A_ProjectA/photo.jpg`.
   - Open B (active project = B): `PhotoRepository.remapFilePaths` must only affect rows in B (assert B has no rows, `getByInspection` empty) — proving remap runs against the active project DB.
   - Assert the DB handle used is the project handle (never `accc_global`): assert `getGlobalDatabase()` was not called during the migration-equivalent flow.
2. Keep mock state path-aware (distinct DB names per project).

**Validation**

```powershell
npx jest src/__tests__/database/folderIsolation.test.ts
npx jest src/__tests__/database/captureIsolation.test.ts src/__tests__/database/templateIsolation.test.ts
npx tsc --noEmit
```

### Task 8 — Docs + Changelog

**Context**

Docs describe the SAF photo folder as `DCIM/ACCC Inspection/<project>`. Update to the canonical `<District>_<ProjectName>` folder and document the lazy migration.

**Tasks**

1. `docs/07-Changelog.md` — add a bullet under `[Unreleased] > Added`: canonical `District_ProjectName` SAF photo folders + lazy per-project migration.
2. `docs/01-PRD.md:1014` — update "View watermarked photos saved via SAF (DCIM/ACCC Inspection/<project>)" to the canonical folder + note legacy folders migrate on open.
3. `docs/02-Architecture.md:518` — extend the storageManager.ts description to mention `resolveInspectionRootDir` and canonical folder naming.
4. `docs/02-Architecture.md:833` — Project model: note SAFPath + canonical folder label.
5. `docs/02-Architecture.md:1267` — SAF gallery write location → canonical folder + lazy migration note.
6. `docs/05-Design.md:783` — same canonical-folder wording.
7. `docs/06-Memory.md:174` — `SAF Photo Storage` entry → canonical `<District>_<ProjectName>` + migration note.
8. `docs/10-DATABASE_ARCHITECTURE.md:27` — `DCIM/ACCC Inspection/<ProjectName>/` → `<District>_<ProjectName>`.
9. `README.md:77` and `docs/08-README.md:160` (and `README.md:343` if it describes folder naming — verify content first) — update photo-capture/folder wording.
10. Confirm no other docs mention the old folder naming (`grep -ri "ACCC Inspection" docs README.md`).

**Validation**

```powershell
npx tsc --noEmit
npx eslint docs 2>$null; # skip if not lintable
```

## Task Dependencies

```
Task 1 (naming)      ──┐
Task 2 (mock)        ──┼──►  Task 4 (folderManager) ──► Task 7 (isolation)
Task 3 (remapPaths)  ──┘               │                      │
Task 1 ──► Task 5 (watermark label)    │                      │
Task 4 ──► Task 6 (InspectionContext) ─┘                      │
Tasks 1-7 ──► Task 8 (docs) ──────────────────────────────────┘
```

- **Parallelizable:** Tasks 1, 2, 3 together. Tasks 5, 6, 7 together after Task 4.
- **Sequential:** 4 needs 1+2+3; 8 needs everything stable.

## Risk & Mitigations

| Risk | Mitigation |
|------|-----------|
| SAF `createFileAsync` extension handling differs from legacy names (duplicate-skip mismatches) | Mirror `storageManager.writePhoto`'s createFileAsync call exactly (Task 4), and assert canonical-name listing in tests |
| Copy failure mid-migration could orphan files | Abort-before-delete: legacy folder deleted only after all copies succeed; partial copies still get rows remapped (uriMap kept), no data loss |
| Concurrent opens / double-fire | In-flight `Set` guard + fire-and-forget `.catch` |
| SAF permission revoked mid-flow | `ensureTreeUri` throws → caught + logged; migration exits silently |
| Mock/real divergence (folder delete, base64 read) | Mock `deleteAsync` is recursive (matches real SAF); Task 2 probe test locks behavior |
| Stale `proj_dir_<label>` cache points at moved/renamed folder | Probe with `readDirectoryAsync`, drop cache on failure, re-list by name |

## Verification (Definition of Done)

Run all of the following from `frontend/`; every command must pass with no errors:

```powershell
npx tsc --noEmit
npx eslint app src __mocks__
npx jest --silent
```

Plus the feature-specific suites: `folderNaming`, `expoFileSystemMock`, `PhotoRepository`, `folderManager`, `useWatermarkProcessor`, `InspectionContext`, `folderIsolation`. Full suite must stay 553/553 (49 suites) + new tests.

## Reporting

After each task: report files changed + test output. After all tasks: report the full-suite run and the diff summary for review.

## Execution Order

1. Get approval on this plan.
2. Create task briefs in `.superpowers/sdd/2026-08-05-folder-management/` (progress.md + one brief per task).
3. Dispatch `general` subagent per task in dependency order (T1, T2, T3 parallelizable; then T4; then T5/T6/T7; then T8).
4. Self-review each subagent diff with empirical checks (run the listed commands); update progress.md.
5. Present final diff summary for user review.
