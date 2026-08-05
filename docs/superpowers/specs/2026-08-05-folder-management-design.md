# Folder Management — Design

**Date:** 2026-08-05
**Status:** Draft (pending user review)
**Type:** New feature (SAF photo-folder standardization + migration)

## Goal

Standardize the per-project SAF photo folder naming under `DCIM/ACCC Inspection/` to one
canonical convention — `<District>_<ProjectName>` (spaces and punctuation preserved, only
filesystem-unsafe characters replaced) — and lazily migrate any legacy folders created by
older builds (project-name-only folders, and the older alphanumeric-stripped
`District_Project` folders) into the canonical folder per project, without breaking existing
photo references.

## Decisions (locked with user)

| Decision | Choice | Rationale |
|---|---|---|
| Feature goal | Standardize folder naming + migrate legacy folders | Older builds created `ProjectName`-only folders; docs also state `<Project>` |
| Canonical label | `District_Project`, keep spaces/punct, replace only `<>:"/\\|?*` with `_` | Matches `ProjectDBManager` internal project-folder sanitizer; human-readable folder names |
| Legacy sources | Project-name-only folders AND old alphanumeric-stripped `District_Project` folders | Both exist on real devices |
| Migration trigger | Lazily, per project open (`InspectionContext.openProject`) | Project DB is already the active handle there → ADR-014-safe FilePath rewrites; self-healing; no global scan |
| Migration strategy | Recreate + copy + delete (no SAF directory rename exists) | SAF API (`expo-file-system` `StorageAccessFramework`) has no directory rename; byte-wise copy is the only safe move |
| Photo integrity | Rewrite `Photos.FilePath` old→new for every migrated file | SAF content URIs encode the folder path; stale URIs would break the photo gallery |
| Merge policy | Never overwrite existing canonical files; copy only missing filenames | Idempotent re-runs; aborted runs self-heal |

## Current Pipeline (baseline)

- `useWatermarkProcessor.ts:138-143` computes the folder label inline:
  `dName = DistrictName.replace(/[^a-zA-Z0-9]/g, "")`, `pName = ProjectName.replace(/[^a-zA-Z0-9]/g, "")`,
  `label = `${dName}_${pName}``. Example: `New Delhi` + `Block A` → `NewDelhi_BlockA`.
- `storageManager.ts` `getProjectDir(treeUri, projectLabel)` creates/verifies
  `ACCC Inspection/<label>` under the DCIM tree; caches per-label folder URIs in
  AsyncStorage (`proj_dir_<label>`), plus `accc_saf_tree_uri` (tree) and `accc_dir_v2`
  (ACCC Inspection dir).
- Photos rows store the final SAF content URI (`content://com.android.externalstorage.documents/
  document/primary:DCIM/ACCC%20Inspection/<label>/<file>.jpg`) in `Photos.FilePath` (per-project DB).
- Older builds (pre-repo-history) created folders named by project name only (`<ProjectName>`).

## New Architecture

### 1. Canonical naming — new `src/utils/folderNaming.ts`

| Export | Behavior |
|---|---|
| `sanitizeFolderName(name)` | Trim whitespace; `name.replace(/[<>:"/\\|?*]/g, "_")`; trim trailing dots/spaces. Same regex family as `ProjectDBManager.getProjectDbPath` |
| `canonicalProjectLabel(project)` | District non-empty → `${sanitizeFolderName(DistrictName)}_${sanitizeFolderName(ProjectName)}`; district empty → `sanitizeFolderName(ProjectName)` (no leading `_`) |
| `legacyStrippedLabel(project)` | `DistrictName.replace(/[^a-zA-Z0-9]/g,"") + "_" + ProjectName.replace(/[^a-zA-Z0-9]/g,"")` — the current watermark-processor scheme |
| `legacyProjectOnlyLabel(project)` | `sanitizeFolderName(ProjectName)` — the pre-history scheme |

Single source of truth: `useWatermarkProcessor.ts:138-143` is replaced by
`canonicalProjectLabel(project)`; the inline strip regex is deleted. AsyncStorage folder cache
key stays `proj_dir_<label>`, now keyed by the canonical label.

### 2. Migration engine — new `src/utils/folderManager.ts`

`migrateProjectPhotoFolder(project: Project): Promise<MigrationResult>`

1. Compute `canonical = canonicalProjectLabel(project)` and the two legacy candidate labels.
2. `treeUri = await ensureTreeUri()` (reuses existing DCIM tree; re-requests permission on revoke).
   Resolve/create `ACCC Inspection` via existing `storageManager` helpers.
3. Resolve canonical folder URI via `getProjectDir(treeUri, canonical)` — eagerly creates it
   (folder exists even before any photo is taken).
4. For each legacy candidate: resolve its folder URI — from AsyncStorage `proj_dir_<legacy>`
   if valid, else by listing `ACCC Inspection` and matching folder names.
5. If no legacy folder exists → **no-op** (already canonical, or brand-new project). Return.
6. For each file in each legacy folder:
   - If a file with the same name already exists in canonical → skip (merge policy).
   - Else `createFileAsync(canonicalDir, name, "image/jpeg")` → read old bytes →
     `writeAsStringAsync` (base64) → `deleteAsync(oldFileUri)`. Record `{oldUri → newUri}`.
7. Only after **all** copies for a legacy folder succeed: delete the now-empty legacy folder
   and remove its `proj_dir_<legacy>` AsyncStorage key.
8. **FilePath rewrite:** `PhotoRepository.remapFilePaths(uriMap)` — a new method that, for each
   `{oldUri → newUri}` pair, runs `UPDATE Photos SET FilePath = ? WHERE FilePath = ?` on the
   active project DB. Both legacy maps apply when both exist. (All DB access stays in the
   repository layer per repo convention; `folderManager.ts` never calls `getDatabase()` itself.)
9. Return `{ migratedFiles, updatedRows, legacyFoldersRemoved }` for logging.

**ADR-014 / isolation constraints:**

- `folderManager.ts` does **not** import or call `getGlobalDatabase()`, and never opens a second
  SQLite handle. All DB access is delegated to `PhotoRepository` (which resolves the active
  project DB) — and only because the caller guarantees the project DB is already active.
- The **only** wiring point is `InspectionContext.openProject` (see §3). It must never be
  called from anywhere else (home, dashboard, settings), or the sequential open/close
  invariant breaks.
- FilePath updates are strictly scoped to `Photos` in the active project DB. No cross-DB data,
  no global-DB tables.

### 3. Trigger & sequencing — `src/context/InspectionContext.tsx`

- In `openProject` (line 50), after `await openProjectDb(p.DBPath, p.ProjectID)` succeeds:
  `void migrateProjectPhotoFolder(p).catch((e) => logger.warn("[FolderManager]", e))`.
  Fire-and-forget — never awaited, so dashboard navigation is not blocked by a slow SAF copy.
- Module-level in-flight `Set<projectId>`: guards against double-runs of the same project and
  against overlapping runs for a different project while the DB handle is in use. Cleared in a
  `finally`.
- If `ensureTreeUri` throws (permission denied/revoked), the catch logs and skips; next project
  open retries. Existing folders are untouched.

### 4. Edge cases & failure safety

| Case | Behavior |
|---|---|
| Empty district | Label falls back to project name alone |
| File name collision in canonical folder | Skip; never overwrite |
| Copy failure mid-run | Abort that legacy folder's cleanup; legacy folder + originals left intact; already-copied names harmless on re-run |
| Both legacy candidates present | Migrate both into canonical (merge by filename), then delete both |
| No SAF permission | `ensureTreeUri` throws → logged, skipped; retry on next open |
| Stale cached URI (`verifyDir` fails) | Re-list `ACCC Inspection`, re-match by folder name; stale `proj_dir_*` keys removed |
| Photo row with dead URI | Left as-is (out of scope) |
| Folder not matching any candidate label | Never touched (no global deletion risk) |
| Project never reopened | Legacy folder untouched; its photos keep working (URIs unchanged) |

### 5. Docs to update

- `docs/02-Architecture.md`, `docs/01-PRD.md` (~:1014), `docs/05-Design.md` (~:783),
  `docs/06-Memory.md` (~:174), `README.md` (~:77, :343), `docs/08-README.md` (~:160),
  `docs/10-DATABASE_ARCHITECTURE.md` (~:27) — replace `DCIM/ACCC Inspection/<Project>` wording
  with `DCIM/ACCC Inspection/<District>_<ProjectName>` and note the lazy per-project migration.
- `docs/07-Changelog.md` — add to the existing `[Unreleased]` section.

## Files

| Path | Change |
|---|---|
| `src/utils/folderNaming.ts` | New — canonical label + legacy label derivation utils |
| `src/utils/folderManager.ts` | New — `migrateProjectPhotoFolder(project)` SAF migration engine |
| `src/components/inspection/useWatermarkProcessor.ts` | Inline strip regex → `canonicalProjectLabel(project)` |
| `src/database/repositories/PhotoRepository.ts` | New `remapFilePaths(uriMap)` method |
| `src/context/InspectionContext.tsx` | `openProject` fires migration (fire-and-forget, in-flight guard) |
| `__mocks__/expo-file-system.ts` | Extend SAF mock for the operations used by migration |
| `src/__tests__/utils/folderNaming.test.ts` | New unit tests |
| `src/__tests__/utils/folderManager.test.ts` | New unit tests |
| `src/__tests__/database/folderIsolation.test.ts` | New isolation regression |
| `src/__tests__/context/InspectionContext.test.tsx` | New integration assertion |

## Testing

- **Unit — `src/__tests__/utils/folderNaming.test.ts`:** sanitizer (unsafe chars → `_`, spaces/
  punct kept, trailing dots trimmed), canonical label (district+project, empty-district fallback),
  both legacy derivations.
- **Unit — `src/__tests__/utils/folderManager.test.ts`** (uses `__mocks__/expo-file-system.ts`
  SAF mock extended for `readDirectoryAsync`/`makeDirectoryAsync`/`createFileAsync`/
  `writeAsStringAsync`/`deleteAsync` + AsyncStorage mock): no-op when canonical exists;
  project-only folder detected + migrated (files copied, originals deleted, folder removed);
  stripped `d_p` folder migrated; merge-skip on existing names; partial failure leaves legacy
  intact; `proj_dir_<legacy>` removed and `proj_dir_<canonical>` set; `Photos.FilePath` UPDATEs
  recorded with correct old→new pairs; `ensureTreeUri` throw → safe skip.
- **Isolation regression — `src/__tests__/database/folderIsolation.test.ts`** (mirrors
  `captureIsolation.test.ts`): project A legacy folder + photo row → open A → only A's rows/
  folder touched; open B with its own legacy folder → B's migration never touches A's folder or
  rows. Asserts `getGlobalDatabase` is never called during migration. Includes a direct
  `PhotoRepository.remapFilePaths` unit test (old→new pairs applied, scoped to the active DB).
- **Context integration — `src/__tests__/context/InspectionContext.test.tsx`:** `openProject`
  fires migration after `openProjectDb` resolves; migration rejection does not reject `openProject`.
- **Full suite:** all existing 553 tests stay green; `tsc --noEmit` and `expo lint` clean.

## Migration result schema

```ts
interface MigrationResult {
  migratedFiles: number;
  updatedRows: number;
  legacyFoldersRemoved: number;
}
```
