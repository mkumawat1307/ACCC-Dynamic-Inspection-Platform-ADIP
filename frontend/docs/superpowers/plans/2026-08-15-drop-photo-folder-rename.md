# Drop Photo-Folder-Rename — Immutable Photo Storage (`Photos.StoragePath`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the entire photo-folder-rename architecture (moving photos when a project is edited) and replace it with immutable photo storage locations persisted in a new nullable `Photos.StoragePath` column, so project edits never touch photo files.

**Architecture:** Photos keep one immutable `FilePath` (the actual URI) plus a new `StoragePath` (the human-readable `Download/ACCC Dynamic Inspection/<label>/` folder they were saved into, set at capture time). The preview's "Saved Location" reads `StoragePath` (lazily derived from legacy `file://` paths or MediaStore `RELATIVE_PATH` for modern `content://` when the column is still NULL) and never derives it from the *current* project identity. `updateProjectFlow` becomes a pure identity+uniqueness check followed by `updateProject` — no folder moves, no marker, no rollback, no recovery. The `PendingPhotoFolderRename` column is retained and drained once, non-destructively, at startup.

**Tech Stack:** TypeScript (strict), expo-sqlite v16, Expo Modules (Kotlin), React Native, Jest (jest-expo + in-memory SQLite mock), Yarn 1.22.

## Global Constraints

- **Never commit.** The user explicitly forbade commits ("Do NOT commit"). Every task ends with a verification run, not a `git commit`.
- **Requirement 1 (new photos):** New photos set both `FilePath` (actual URI) and `StoragePath` (exact folder) at save time.
- **Requirement 2 (existing photos):** Existing photos are NEVER moved, NEVER have their folder renamed, and NEVER have `FilePath` rewritten due to project editing. Legacy `file://` paths are preserved verbatim. Lazy backfill from MediaStore `RELATIVE_PATH` happens only when necessary (a modern `content://` photo whose `StoragePath` is NULL).
- **Requirement 3 (project edit):** Editing District, Project Name, or both does NOT move photos; existing photos retain their `StoragePath`; new photos use the current folder.
- **Requirement 4 (preview):** `FilePath` is the image source; `StoragePath` is display-only; "Saved Location" comes ONLY from `StoragePath`, never from the current project identity.
- **Requirement 5 (removal):** Remove the rename-only architecture: `moveFilesInFolder` (JS + Kotlin modern/legacy), `reverseMove`, `PendingPhotoFolderRename` recovery, `remapFilePaths`, `getFilePathsLike`, project-edit photo-folder collision checks, and their tests.
- **Requirement 6 (keep):** `ensureProjectFolder`, `writePhoto`, `deletePhoto`, watermarking, `Photo.FilePath`, `PhotoRepository` create/update/insert, Pole ID rename, project uniqueness, backup/restore, export, camera/GPS/template/inspection flows are unchanged.
- **Requirement 7 (migration):** Additive only. Add nullable `StoragePath` to fresh and existing project DBs. No file moves, no folder renames, no `FilePath` rewrites. Lazy backfill: legacy derives directly; modern resolves via native MediaStore lookup. If the lookup fails, do NOT invent a location (return null / show blank).
- **AGENTS.md isolation (mandatory):** `StoragePath` is per-project data → the project DB only. Ship the isolation regression test (replaces the `remapFilePaths` isolation tests in `folderIsolation.test.ts`).
- **AGENTS.md DB model:** Respect the sequential open/close model — never call `getGlobalDatabase()` during the inspection flow; route all DB access through `src/database/repositories/`. The drain runs at global-DB init time (safe).
- **Keep the `PendingPhotoFolderRename` column** in `Projects` (no SQLite table rebuild). No new markers are ever written after this change.
- **No placeholders, no dead code.** When removing a function, remove it from the implementation AND its tests AND any remaining import in the same task.
- **Run from `frontend/`.** Full gate: `yarn test --silent` (expect ~78 suites), `npx tsc --noEmit` (exit 0), `yarn lint` (0 errors; ~571 pre-existing warnings OK).
- **Kotlin gate:** `.\\gradlew.bat :expo-download-storage:compileDebugKotlin --console=plain` from `frontend/android` (module has no Kotlin test source set — document limitation, JS tests are the strongest available gate).

---

## File Structure

**New files:**
- `frontend/src/utils/photoStoragePath.ts` — `deriveStoragePathFromFilePath(filePath)` + `resolvePhotoStoragePath(photo)` (pure + MediaStore lookup)
- `frontend/src/database/services/PendingRenameDrain.ts` — `drainLegacyPendingPhotoFolderRenames()` one-time non-destructive marker drain
- `frontend/src/__tests__/utils/photoStoragePath.test.ts`
- `frontend/src/__tests__/database/services/PendingRenameDrain.test.ts`
- `frontend/src/__tests__/database/tables/photos-table.test.ts`

**Modified files:**
- `frontend/src/models/Photo.ts` — add `StoragePath?: string`
- `frontend/src/database/tables/photos.table.ts` — add `StoragePath TEXT`
- `frontend/src/database/schema.ts` — `migrateProjectSchema`: guarded `ALTER TABLE Photos ADD COLUMN StoragePath TEXT`
- `frontend/src/__tests__/database/schema.test.ts` — ALTER-emission test
- `frontend/modules/download-storage/android/src/main/java/expo/modules/downloadstorage/DownloadStorageModule.kt` — add `getRelativePath`; Task 7 removes the three `moveFilesInFolder*` functions + the `AsyncFunction("moveFilesInFolder")` registration
- `frontend/modules/download-storage/src/index.ts` — add `getRelativePath`; Task 7 removes `FileMoveResult` + `moveFilesInFolder`
- `frontend/src/utils/downloadStorage.ts` — add `getRelativePath` wrapper; Task 7 removes `moveFilesInFolder` + `FileMoveResult` import
- `frontend/src/__tests__/utils/downloadStorage.test.ts` — add `getRelativePath` tests; Task 7 removes `moveFilesInFolder` describe + mock entry
- `frontend/src/database/repositories/PhotoRepository.ts` — Task 4 adds `updateFilePathAndStoragePath` + `updateStoragePath`; Task 6 removes `remapFilePaths` + `getFilePathsLike`; Task 8 removes `updateFilePath`
- `frontend/src/__tests__/database/repositories/PhotoRepository.test.ts` — mirror the additions/removals
- `frontend/src/__tests__/database/folderIsolation.test.ts` — replace the two `remapFilePaths` isolation tests with `updateStoragePath` isolation tests
- `frontend/src/database/DatabaseService.ts` — Task 5 swaps `recoverPendingPhotoFolderRenames()` for `drainLegacyPendingPhotoFolderRenames()`
- `frontend/src/__tests__/database/DatabaseService.test.ts` — Task 5 updates mocks/tests
- `frontend/src/database/services/ProjectEditService.ts` — Task 6 guts the file
- `frontend/src/__tests__/database/services/ProjectEditService.test.ts` — Task 6 rewrites
- `frontend/src/utils/storageManager.ts` — Task 7 removes `moveProjectFolder` + `PhotoFolderConflictError` + `PhotoFolderRenameError` + `FileMoveResult` import (KEEPS `hasProjectFolderFiles` for the drain, `buildPhotoFolderDisplayPath`, `writePhoto`, `deletePhoto`, `ensureRootFolder`, `ensureProjectFolder`)
- `frontend/src/__tests__/utils/storageManager.test.ts` — Task 7 removes the removed exports + `moveProjectFolder` test + error-class describe
- `frontend/app/projects/new.tsx` — Task 6 removes `PhotoFolderConflictError`/`PhotoFolderRenameError` branches + import
- `frontend/src/components/inspection/useWatermarkProcessor.ts` — Task 8 persists `StoragePath` in `saveAndComplete`
- `frontend/src/__tests__/hooks/useWatermarkProcessor.test.tsx` — Task 8 updates mocks + assertions
- `frontend/src/components/inspection/PhotoPreviewModal.tsx` — Task 9 shows `StoragePath`, drops the `project` prop
- `frontend/src/components/inspection/PhotoSection.tsx` — Task 9 drops `project={project}`
- `frontend/src/__tests__/components/inspection/PhotoPreviewModal.test.tsx` — Task 9 rewrites

**Task dependency order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Each task ends with green gates so the tree compiles and passes at every checkpoint.

---

## Task 1: `Photos.StoragePath` column (model, fresh DDL, migration)

**Files:**
- Modify: `frontend/src/models/Photo.ts`
- Modify: `frontend/src/database/tables/photos.table.ts`
- Modify: `frontend/src/database/schema.ts` (`migrateProjectSchema`, after the CardMode backfill block ~line 472, before `logger.debug("✅ [schema] migrateProjectSchema() — END");` at line 486)
- Test: `frontend/src/__tests__/database/tables/photos-table.test.ts` (new)
- Test: `frontend/src/__tests__/database/schema.test.ts`

**Interfaces:**
- Produces: `Photo` gains optional `StoragePath?: string`; `createPhotosTable` DDL contains `StoragePath TEXT` (nullable); `migrateProjectSchema(projectId)` emits `ALTER TABLE Photos ADD COLUMN StoragePath TEXT` guarded by try/catch (idempotent).

- [ ] **Step 1: Write the failing DDL test**

Create `frontend/src/__tests__/database/tables/photos-table.test.ts`:

```ts
import { createPhotosTable } from "@/src/database/tables/photos.table";

describe("photos.table", () => {
  it("includes the nullable StoragePath column", () => {
    expect(createPhotosTable).toContain("StoragePath TEXT");
  });

  it("keeps StoragePath nullable (no NOT NULL constraint)", () => {
    expect(createPhotosTable).toMatch(/StoragePath TEXT,?\s*$/m);
  });
});
```

- [ ] **Step 2: Run the DDL test to verify it fails**

Run: `yarn test --silent --testPathPattern "photos-table.test"`
Expected: FAIL — "Expected string to contain 'StoragePath TEXT'".

- [ ] **Step 3: Write the failing migration test**

Append to `frontend/src/__tests__/database/schema.test.ts`, inside the top-level `describe("schema.ts schema functions", ...)` block (after the "createGlobalSchema emits the PendingPhotoFolderRename ALTER migration" test at line 141):

```ts
it("migrateProjectSchema emits the Photos StoragePath ALTER migration", async () => {
  const { migrateProjectSchema } = require("@/src/database/schema");
  await migrateProjectSchema(1);
  const emitted = mockExecAsync.mock.calls.map((call) => String(call[0]));
  expect(
    emitted.find((sql) => sql.includes("ALTER TABLE Photos ADD COLUMN StoragePath TEXT"))
  ).toBeDefined();
});
```

- [ ] **Step 4: Run the migration test to verify it fails**

Run: `yarn test --silent --testPathPattern "schema.test"`
Expected: FAIL on the new test only (mockExecAsync emits no StoragePath ALTER).

- [ ] **Step 5: Implement the schema change**

Edit `frontend/src/database/tables/photos.table.ts` — insert after `Remarks TEXT,` (line 21):

```ts
    StoragePath TEXT,
```

Edit `frontend/src/models/Photo.ts` — add after `Remarks: string | null;` (line 18):

```ts
  StoragePath?: string;
```

Edit `frontend/src/database/schema.ts` — inside `migrateProjectSchema`, after the CardMode backfill `try/catch` (which ends at line 472) and before the final `logger.debug("✅ [schema] migrateProjectSchema() — END");` (line 486), add:

```ts
    // Migration: Add StoragePath column to existing Photos table.
    // Holds the immutable human-readable folder a photo was saved into.
    // NULL until lazily backfilled for photos captured before this migration.
    try {
        await db.execAsync(`ALTER TABLE Photos ADD COLUMN StoragePath TEXT;`);
        logger.debug("[schema] Migration: StoragePath column added to Photos");
    } catch {
        logger.debug("[schema] Migration: StoragePath column already exists in Photos (ok)");
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test --silent --testPathPattern "photos-table.test"` and `yarn test --silent --testPathPattern "schema.test"`
Expected: PASS (photos-table.test: 2, schema.test: all green).

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.

---

## Task 2: Native `getRelativePath` (additive; keep `moveFilesInFolder` for now)

**Files:**
- Modify: `frontend/modules/download-storage/android/src/main/java/expo/modules/downloadstorage/DownloadStorageModule.kt`
- Modify: `frontend/modules/download-storage/src/index.ts`
- Modify: `frontend/src/utils/downloadStorage.ts`
- Test: `frontend/src/__tests__/utils/downloadStorage.test.ts`

**Interfaces:**
- Consumes: none (standalone additive).
- Produces: `DownloadStorageNative.getRelativePath(uri: string): Promise<string | null>`; wrapper `downloadStorage.getRelativePath(uri: string): Promise<string | null>`. The Kotlin function queries the row's `MediaStore.Downloads.RELATIVE_PATH`; returns `null` on parse/query failure or a missing row (never throws, never invents a value).

- [ ] **Step 1: Write the failing wrapper test**

Edit `frontend/src/__tests__/utils/downloadStorage.test.ts`:
- Add `getRelativePath: jest.fn().mockResolvedValue("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/")` to the native mock object after the `moveFilesInFolder` line (line 21; appending at the end of the mock keeps Task 7's `moveFilesInFolder` removal ref unchanged).
- Append two tests after the `moveFilesInFolder` describe (line 80):

```ts
describe("downloadStorage.getRelativePath", () => {
  it("forwards the content uri to the native module", async () => {
    const native = getDownloadStorageNative()!;

    const result = await downloadStorage.getRelativePath(
      "content://media/external_primary/downloads/123"
    );

    expect(native.getRelativePath).toHaveBeenCalledWith(
      "content://media/external_primary/downloads/123"
    );
    expect(result).toBe("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
  });

  it("returns null when the native module reports no relative path", async () => {
    const native = getDownloadStorageNative()!;
    (native.getRelativePath as jest.Mock).mockResolvedValueOnce(null);

    const result = await downloadStorage.getRelativePath(
      "content://media/external_primary/downloads/999"
    );

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the wrapper test to verify it fails**

Run: `yarn test --silent --testPathPattern "downloadStorage.test"`
Expected: FAIL — `downloadStorage.getRelativePath is not a function`.

- [ ] **Step 3: Implement the type + wrapper**

Edit `frontend/modules/download-storage/src/index.ts` — add to the `DownloadStorageNative` interface after `moveFilesInFolder` (after line 32; placing it at the end keeps Task 7's `moveFilesInFolder` line refs unchanged):

```ts
  getRelativePath(uri: string): Promise<string | null>;
```

Edit `frontend/src/utils/downloadStorage.ts` — append after the `moveFilesInFolder` method (after line 78; placing it at the end keeps Task 7's `moveFilesInFolder` line refs unchanged):

```ts
  async getRelativePath(uri: string): Promise<string | null> {
    return requireNative().getRelativePath(uri);
  },
```

- [ ] **Step 4: Run the wrapper test to verify it passes**

Run: `yarn test --silent --testPathPattern "downloadStorage.test"`
Expected: PASS.

- [ ] **Step 5: Implement the Kotlin function**

Edit `frontend/modules/download-storage/android/src/main/java/expo/modules/downloadstorage/DownloadStorageModule.kt`:

1. Inside `definition()` (line 18), after the `AsyncFunction("renameFile")` block (line 53-55), add:

```kotlin
    AsyncFunction("getRelativePath") { uri: String ->
      getRelativePath(uri)
    }
```

2. After the `renameFile` private function (ends at line 362), add:

```kotlin
  // Returns the MediaStore RELATIVE_PATH (e.g. "Download/ACCC Dynamic Inspection/<label>/")
  // for a content:// photo URI, or null when the row is missing or not resolvable.
  private fun getRelativePath(uri: String): String? {
    val parsed = try {
      Uri.parse(uri)
    } catch (e: Exception) {
      nativeLog("getRelativePathParseError uri=$uri err=${e.message}")
      return null
    }
    if (parsed.lastPathSegment.isNullOrEmpty()) return null
    val resolver = context.contentResolver
    return try {
      resolver.query(
        parsed,
        arrayOf(MediaStore.Downloads.RELATIVE_PATH),
        null,
        null,
        null
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Downloads.RELATIVE_PATH))
        } else {
          null
        }
      }
    } catch (e: Exception) {
      nativeLog("getRelativePathQueryError uri=$uri err=${e.message}")
      null
    }
  }
```

Note: `RELATIVE_PATH` only exists on API >= 29; on older APIs the query throws and is caught → returns `null`. Do NOT gate on `Build.VERSION` — the try/catch is the guard.

- [ ] **Step 6: Compile the native module**

Run from `frontend/android`: `.\\gradlew.bat :expo-download-storage:compileDebugKotlin --console=plain`
Expected: BUILD SUCCESSFUL (only pre-existing `Constants(...)` deprecation warning at DownloadStorageModule.kt:21 is acceptable).

- [ ] **Step 7: Full typecheck + lint**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.

---

## Task 3: `photoStoragePath` util (derive + resolve)

**Files:**
- Create: `frontend/src/utils/photoStoragePath.ts`
- Test: `frontend/src/__tests__/utils/photoStoragePath.test.ts`

**Interfaces:**
- Consumes: `PHOTO_ROOT_DISPLAY` from `@/src/utils/storageManager`; `downloadStorage.getRelativePath` from Task 2; `Photo` model (with `StoragePath` from Task 1).
- Produces:
  - `deriveStoragePathFromFilePath(filePath: string): string | null`
  - `resolvePhotoStoragePath(photo: Photo): Promise<string | null>` — returns stored `StoragePath` if present; else derives from legacy `file://`; else queries MediaStore for `content://`; else `null`.

- [ ] **Step 1: Write the failing unit tests**

Create `frontend/src/__tests__/utils/photoStoragePath.test.ts`:

```ts
jest.mock("@/src/utils/storageManager", () => ({
  PHOTO_ROOT_DISPLAY: "Download/ACCC Dynamic Inspection",
}));
jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: { getRelativePath: jest.fn() },
}));

import { downloadStorage } from "@/src/utils/downloadStorage";
import {
  deriveStoragePathFromFilePath,
  resolvePhotoStoragePath,
} from "@/src/utils/photoStoragePath";
import { Photo } from "@/src/models/Photo";

function basePhoto(overrides: Partial<Photo>): Photo {
  return {
    InspectionID: 1,
    PhotoType: "Pole",
    FileName: "photo.jpg",
    FilePath: "",
    Latitude: null,
    Longitude: null,
    CapturedAt: null,
    Remarks: null,
    ...overrides,
  };
}

describe("deriveStoragePathFromFilePath", () => {
  it("extracts the project folder from a percent-encoded legacy file:// path", () => {
    expect(
      deriveStoragePathFromFilePath(
        "file:///storage/emulated/0/Download/ACCC%20Dynamic%20Inspection/Jaipur_AMC%202026/photo.jpg"
      )
    ).toBe("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
  });

  it("handles an unencoded legacy file:// path", () => {
    expect(
      deriveStoragePathFromFilePath(
        "file:///storage/emulated/0/Download/ACCC Dynamic Inspection/Mumbai_Project Beta/photo.jpg"
      )
    ).toBe("Download/ACCC Dynamic Inspection/Mumbai_Project Beta/");
  });

  it("returns null for a path outside the download root", () => {
    expect(deriveStoragePathFromFilePath("file:///sdcard/Pictures/photo.jpg")).toBeNull();
  });

  it("returns null for a file:// path with no folder segment", () => {
    expect(
      deriveStoragePathFromFilePath(
        "file:///storage/emulated/0/Download/ACCC%20Dynamic%20Inspection/photo.jpg"
      )
    ).toBeNull();
  });

  it("returns null for non-file URIs", () => {
    expect(deriveStoragePathFromFilePath("content://media/downloads/123")).toBeNull();
  });
});

describe("resolvePhotoStoragePath", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the stored StoragePath when present", async () => {
    const photo = basePhoto({
      FilePath: "content://media/downloads/1",
      StoragePath: "Download/ACCC Dynamic Inspection/Old_Label/",
    });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBe(
      "Download/ACCC Dynamic Inspection/Old_Label/"
    );
    expect(downloadStorage.getRelativePath).not.toHaveBeenCalled();
  });

  it("derives a legacy file:// path when StoragePath is missing", async () => {
    const photo = basePhoto({
      FilePath:
        "file:///storage/emulated/0/Download/ACCC%20Dynamic%20Inspection/Jaipur_AMC%202026/photo.jpg",
    });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBe(
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
    expect(downloadStorage.getRelativePath).not.toHaveBeenCalled();
  });

  it("looks up MediaStore RELATIVE_PATH for a content:// URI when StoragePath is missing", async () => {
    (downloadStorage.getRelativePath as jest.Mock).mockResolvedValueOnce(
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
    const photo = basePhoto({ FilePath: "content://media/external_primary/downloads/123" });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBe(
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
    expect(downloadStorage.getRelativePath).toHaveBeenCalledWith(
      "content://media/external_primary/downloads/123"
    );
  });

  it("returns null when the MediaStore lookup returns null (does not invent a location)", async () => {
    (downloadStorage.getRelativePath as jest.Mock).mockResolvedValueOnce(null);
    const photo = basePhoto({ FilePath: "content://media/external_primary/downloads/999" });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBeNull();
  });

  it("returns null for an unknown URI scheme", async () => {
    const photo = basePhoto({ FilePath: "https://example.com/photo.jpg" });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBeNull();
    expect(downloadStorage.getRelativePath).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test --silent --testPathPattern "photoStoragePath.test"`
Expected: FAIL — "Cannot find module '@/src/utils/photoStoragePath'".

- [ ] **Step 3: Implement the util**

Create `frontend/src/utils/photoStoragePath.ts`:

```ts
import { PHOTO_ROOT_DISPLAY } from "@/src/utils/storageManager";
import { downloadStorage } from "@/src/utils/downloadStorage";
import { Photo } from "@/src/models/Photo";

export function deriveStoragePathFromFilePath(filePath: string): string | null {
  if (!filePath.startsWith("file://")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(filePath);
  } catch {
    decoded = filePath;
  }
  const marker = `${PHOTO_ROOT_DISPLAY}/`;
  const idx = decoded.indexOf(marker);
  if (idx < 0) return null;
  const rest = decoded.slice(idx + marker.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const label = rest.slice(0, slash);
  return label ? `${marker}${label}/` : null;
}

export async function resolvePhotoStoragePath(photo: Photo): Promise<string | null> {
  if (photo.StoragePath && photo.StoragePath.trim()) return photo.StoragePath;
  if (photo.FilePath.startsWith("file://")) {
    return deriveStoragePathFromFilePath(photo.FilePath);
  }
  if (photo.FilePath.startsWith("content://")) {
    const relative = await downloadStorage.getRelativePath(photo.FilePath);
    return relative && relative.trim() ? relative : null;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --silent --testPathPattern "photoStoragePath.test"`
Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.

## Task 4: `PhotoRepository` additive methods + `StoragePath` isolation regression

**Files:**
- Modify: `frontend/src/database/repositories/PhotoRepository.ts`
- Test: `frontend/src/__tests__/database/repositories/PhotoRepository.test.ts`
- Test: `frontend/src/__tests__/database/folderIsolation.test.ts`

**Interfaces:**
- Consumes: `Photo` model with `StoragePath` (Task 1).
- Produces: `PhotoRepository.updateFilePathAndStoragePath(photoId: number, filePath: string, storagePath: string): Promise<void>`; `PhotoRepository.updateStoragePath(photoId: number, storagePath: string): Promise<void>`. `remapFilePaths`, `getFilePathsLike`, `updateFilePath` still exist (removed in Tasks 6/8).

- [ ] **Step 1: Write the failing repository tests**

Append to `frontend/src/__tests__/database/repositories/PhotoRepository.test.ts`:

```ts
describe("PhotoRepository.updateFilePathAndStoragePath", () => {
  it("updates FilePath and StoragePath for a photo", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const id = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "photo.jpg",
      FilePath: "",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });

    await PhotoRepository.updateFilePathAndStoragePath(
      id,
      "content://media/Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/photo.jpg",
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );

    const saved = await PhotoRepository.getById(id);
    expect(saved!.FilePath).toBe(
      "content://media/Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/photo.jpg"
    );
    expect(saved!.StoragePath).toBe("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");

    await dbModule.clearActiveProject();
  });
});

describe("PhotoRepository.updateStoragePath", () => {
  it("updates only StoragePath", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const id = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "photo.jpg",
      FilePath: "content://media/downloads/1",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });

    await PhotoRepository.updateStoragePath(id, "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");

    const saved = await PhotoRepository.getById(id);
    expect(saved!.StoragePath).toBe("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
    expect(saved!.FilePath).toBe("content://media/downloads/1");

    await dbModule.clearActiveProject();
  });
});
```

- [ ] **Step 2: Run the repository tests to verify they fail**

Run: `yarn test --silent --testPathPattern "PhotoRepository.test"`
Expected: FAIL — `PhotoRepository.updateFilePathAndStoragePath is not a function`.

- [ ] **Step 3: Write the failing isolation tests (REQUIRED by AGENTS.md)**

Edit `frontend/src/__tests__/database/folderIsolation.test.ts` — replace the two existing `remapFilePaths` isolation tests (lines 31-91) with:

```ts
describe("StoragePath isolation (project-scoped)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db = await dbModule.getDatabase();
    return { dbModule, db };
  }

  it("does not copy StoragePath updates across projects", async () => {
    const { dbModule } = await openProject(PROJECT_A);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "photo_a.jpg",
      FilePath: PHOTO_A_PATH,
      Latitude: 34.05,
      Longitude: -118.25,
      CapturedAt: "2026-08-04T10:00:00.000Z",
      Remarks: null,
    });

    await PhotoRepository.updateStoragePath(
      photoId,
      "Download/ACCC Dynamic Inspection/B_ProjectB/"
    );
    expect((await PhotoRepository.getById(photoId))!.StoragePath).toBe(
      "Download/ACCC Dynamic Inspection/B_ProjectB/"
    );

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);
    const inB = await dbB.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos WHERE InspectionID = 1"
    );
    expect(inB).toHaveLength(0);

    await dbModule.clearActiveProject();

    const { db: dbA } = await openProject(PROJECT_A);
    const aAfter = await dbA.getAllAsync<{ PhotoID: number; StoragePath: string | null }>(
      "SELECT PhotoID, StoragePath FROM Photos WHERE InspectionID = 1"
    );
    expect(aAfter).toHaveLength(1);
    expect(aAfter[0].StoragePath).toBe("Download/ACCC Dynamic Inspection/B_ProjectB/");

    await dbModule.clearActiveProject();
  });

  it("keeps StoragePath per-photo within the same project (no cross-row bleed)", async () => {
    const { dbModule } = await openProject(PROJECT_A);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoA = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "a.jpg",
      FilePath: PHOTO_A_PATH,
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    const photoB = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "b.jpg",
      FilePath: PHOTO_A_NEW_PATH,
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });

    await PhotoRepository.updateStoragePath(photoA.id, "Download/ACCC Dynamic Inspection/A_ProjectA/");

    const a = await PhotoRepository.getById(photoA.id);
    const b = await PhotoRepository.getById(photoB.id);
    expect(a!.StoragePath).toBe("Download/ACCC Dynamic Inspection/A_ProjectA/");
    expect(b!.StoragePath).toBeNull();

    await dbModule.clearActiveProject();
  });
});
```

Note: this matches the file's existing `openProject`/`require` harness (no module-level repo fixtures) and keeps the `PROJECT_A`/`PROJECT_B`/`PHOTO_A_PATH`/`PHOTO_A_NEW_PATH` constants (lines 13-17). The second test asserts the AGENTS.md isolation rule from within one project DB.

- [ ] **Step 4: Run the isolation tests to verify they fail**

Run: `yarn test --silent --testPathPattern "folderIsolation.test"`
Expected: FAIL — `photoRepoA.updateStoragePath is not a function`.

- [ ] **Step 5: Implement the repository methods**

Edit `frontend/src/database/repositories/PhotoRepository.ts` — add after `updateFilePath` (line 84), matching the file's `getDatabase()` + `runAsync` convention:

```ts
  static async updateFilePathAndStoragePath(
    photoId: number,
    filePath: string,
    storagePath: string
  ): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE Photos SET FilePath = ?, StoragePath = ? WHERE PhotoID = ?`,
      [filePath, storagePath, photoId]
    );
  }

  static async updateStoragePath(photoId: number, storagePath: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`UPDATE Photos SET StoragePath = ? WHERE PhotoID = ?`, [
      storagePath,
      photoId,
    ]);
  }
```

- [ ] **Step 6: Run the repository + isolation tests to verify they pass**

Run: `yarn test --silent --testPathPattern "PhotoRepository.test"` and `yarn test --silent --testPathPattern "folderIsolation.test"`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.

---

## Task 5: One-time non-destructive `PendingPhotoFolderRename` drain

**Files:**
- Create: `frontend/src/database/services/PendingRenameDrain.ts`
- Modify: `frontend/src/database/DatabaseService.ts`
- Test: `frontend/src/__tests__/database/services/PendingRenameDrain.test.ts`
- Test: `frontend/src/__tests__/database/DatabaseService.test.ts`

**Interfaces:**
- Consumes: `ProjectRepository.getPendingPhotoFolderRenames()`, `ProjectRepository.setPendingPhotoFolderRename(projectId, null)`, `storageManager.hasProjectFolderFiles(projectLabel)`.
- Produces: `drainLegacyPendingPhotoFolderRenames(): Promise<void>` — reads pending markers once, resolves each non-destructively, and clears them. Does NOT move/rename/rewrite any photo. Does NOT throw on individual marker failures.

Drain predicate (marker = `{ from, to }` parsed from the stored JSON; rows come only from existing projects via `getPendingPhotoFolderRenames`):
1. Marker missing, empty, or malformed → clear the marker.
2. `marker.from === marker.to` (identity) → clear the marker.
3. Files exist in `from` only → clear the marker (they stay at `from`; `StoragePath` backfill will reflect reality via `resolvePhotoStoragePath`).
4. Files exist in `to` (with or without `from` remnants) → `logger.warn(...)` once + clear the marker.

Legacy `file://` partial-move dangles (files split across `from` and `to`) are unresolvable — files are left exactly where they are; a WARN is emitted. This is the accepted end state of the removed feature.

- [ ] **Step 1: Write the failing drain tests**

Create `frontend/src/__tests__/database/services/PendingRenameDrain.test.ts`:

```ts
jest.mock("@/src/database/repositories/ProjectRepository");
jest.mock("@/src/utils/storageManager", () => ({
  hasProjectFolderFiles: jest.fn(),
}));

import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { hasProjectFolderFiles } from "@/src/utils/storageManager";
import { drainLegacyPendingPhotoFolderRenames } from "@/src/database/services/PendingRenameDrain";

const mockGet = ProjectRepository.getPendingPhotoFolderRenames as jest.Mock;
const mockSet = ProjectRepository.setPendingPhotoFolderRename as jest.Mock;
const mockHasFiles = hasProjectFolderFiles as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("drainLegacyPendingPhotoFolderRenames", () => {
  it("clears an empty marker", async () => {
    mockGet.mockResolvedValueOnce([{ ProjectID: 1, PendingPhotoFolderRename: "{}" }]);

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).toHaveBeenCalledWith(1, null);
  });

  it("clears a malformed marker", async () => {
    mockGet.mockResolvedValueOnce([
      { ProjectID: 1, PendingPhotoFolderRename: "{not-json" },
    ]);

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).toHaveBeenCalledWith(1, null);
  });

  it("clears an identity marker (from === to)", async () => {
    mockGet.mockResolvedValueOnce([
      {
        ProjectID: 1,
        PendingPhotoFolderRename: JSON.stringify({
          from: "Jaipur_AMC 2026",
          to: "Jaipur_AMC 2026",
        }),
      },
    ]);

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).toHaveBeenCalledWith(1, null);
  });

  it("clears a marker when files exist only in the from folder (no move attempted)", async () => {
    mockGet.mockResolvedValueOnce([
      {
        ProjectID: 1,
        PendingPhotoFolderRename: JSON.stringify({
          from: "Jaipur_AMC 2026",
          to: "Jaipur_AMC 2027",
        }),
      },
    ]);
    mockHasFiles.mockImplementation((label: string) => label === "Jaipur_AMC 2026");

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).toHaveBeenCalledWith(1, null);
    expect(mockHasFiles).toHaveBeenCalled();
  });

  it("warns and clears a marker when files exist in the to folder", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGet.mockResolvedValueOnce([
      {
        ProjectID: 1,
        PendingPhotoFolderRename: JSON.stringify({
          from: "Jaipur_AMC 2026",
          to: "Jaipur_AMC 2027",
        }),
      },
    ]);
    mockHasFiles.mockImplementation((label: string) => label === "Jaipur_AMC 2027");

    await drainLegacyPendingPhotoFolderRenames();

    expect(warnSpy).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(1, null);
    warnSpy.mockRestore();
  });

  it("does not throw when a single marker lookup fails", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));

    await expect(drainLegacyPendingPhotoFolderRenames()).resolves.toBeUndefined();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("does not touch anything when there are no markers", async () => {
    mockGet.mockResolvedValueOnce([]);

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the drain tests to verify they fail**

Run: `yarn test --silent --testPathPattern "PendingRenameDrain.test"`
Expected: FAIL — "Cannot find module '@/src/database/services/PendingRenameDrain'".

- [ ] **Step 3: Write the failing DatabaseService test update**

Edit `frontend/src/__tests__/database/DatabaseService.test.ts`:
- Replace the `ProjectEditService` mock (lines 6-8) with:

```ts
jest.mock("@/src/database/services/PendingRenameDrain", () => ({
  drainLegacyPendingPhotoFolderRenames: jest.fn().mockResolvedValue(undefined),
}));
```

- Update the two recovery tests (lines 88-100) to target the drain, preserving the existing semantics (drain failures are logged, never thrown):

```ts
const { drainLegacyPendingPhotoFolderRenames } = require("@/src/database/services/PendingRenameDrain");
...
it("runs the legacy pending-rename drain during initialization", async () => {
  ...existing setup...
  expect(drainLegacyPendingPhotoFolderRenames).toHaveBeenCalled();
});

it("does not fail initialization when the drain throws", async () => {
  (drainLegacyPendingPhotoFolderRenames as jest.Mock).mockRejectedValueOnce(new Error("drain boom"));
  const { initializeDatabase } = require("@/src/database/DatabaseService");
  await expect(initializeDatabase()).resolves.toBeUndefined();
});
```

The second test preserves the current "does not fail initialization when recovery throws" behavior (line 95-100) — `DatabaseService` wraps the drain in its own try/catch (see Step 6).

- [ ] **Step 4: Run the DatabaseService tests to verify they fail**

Run: `yarn test --silent --testPathPattern "DatabaseService.test"`
Expected: FAIL — `drainLegacyPendingPhotoFolderRenames is not a function`.

- [ ] **Step 5: Implement the drain**

Create `frontend/src/database/services/PendingRenameDrain.ts`:

```ts
import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { hasProjectFolderFiles } from "@/src/utils/storageManager";
import { logger } from "@/src/utils/logger";

interface PendingRenameMarker {
  from: string;
  to: string;
}

export async function drainLegacyPendingPhotoFolderRenames(): Promise<void> {
  try {
    const pending = await ProjectRepository.getPendingPhotoFolderRenames();
    for (const row of pending) {
      try {
        const marker = parseMarker(row.PendingPhotoFolderRename);
        if (!marker) {
          await ProjectRepository.setPendingPhotoFolderRename(row.ProjectID, null);
          continue;
        }
        if (marker.from === marker.to) {
          await ProjectRepository.setPendingPhotoFolderRename(row.ProjectID, null);
          continue;
        }
        const filesInTo = await hasProjectFolderFiles(marker.to);
        if (filesInTo) {
          logger.warn(
            `[drain] Photos remain in legacy target folder "${marker.to}" for project #${row.ProjectID}; leaving files untouched and clearing pending marker`
          );
        }
        await ProjectRepository.setPendingPhotoFolderRename(row.ProjectID, null);
      } catch (err) {
        logger.warn(
          `[drain] Failed to resolve pending rename for project #${row.ProjectID}: ${String(err)}`
        );
      }
    }
  } catch (err) {
    logger.warn(`[drain] Failed to list pending photo-folder renames: ${String(err)}`);
  }
}

function parseMarker(raw: string | null): PendingRenameMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.from !== "string" ||
      typeof parsed.to !== "string"
    ) {
      return null;
    }
    return { from: parsed.from, to: parsed.to };
  } catch {
    return null;
  }
}
```

Note: this uses `hasProjectFolderFiles(marker.to)` on the CURRENT project folder (`PHOTO_ROOT_DISPLAY/<to>`), which is correct for a drain that never renames anything. If the project was later renamed again, the drain may WARN about a folder that no longer maps cleanly — acceptable, files stay untouched.

- [ ] **Step 6: Update the DB service call site**

Edit `frontend/src/database/DatabaseService.ts`:
- Add `import { drainLegacyPendingPhotoFolderRenames } from "@/src/database/services/PendingRenameDrain";` and remove `import { recoverPendingPhotoFolderRenames } from "./services/ProjectEditService";` (line 5).
- Replace the call site at line 40 with the drain, keeping the existing try/catch (the drain itself never throws, but the wrapper preserves the "initialization never fails on drain errors" contract):

```ts
    try {
      await drainLegacyPendingPhotoFolderRenames();
    } catch (e) {
      logger.error("❌ [DatabaseService] Pending photo-folder rename drain failed", e);
    }
```

- [ ] **Step 7: Run the drain + DatabaseService tests to verify they pass**

Run: `yarn test --silent --testPathPattern "PendingRenameDrain.test"` and `yarn test --silent --testPathPattern "DatabaseService.test"`
Expected: PASS.

- [ ] **Step 8: Typecheck + lint + full test sweep**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.
Run: `yarn test --silent` — Expected: all green (this also confirms the `DatabaseService` tests updated in Step 3 now assert the drain is called and initialization still succeeds when it throws).

---

## Task 6: Gut `ProjectEditService` — project edits never move photos

**Files:**
- Modify: `frontend/src/database/services/ProjectEditService.ts`
- Modify: `frontend/app/projects/new.tsx`
- Modify: `frontend/src/database/repositories/PhotoRepository.ts` (remove `remapFilePaths`, `getFilePathsLike`)
- Test: `frontend/src/__tests__/database/services/ProjectEditService.test.ts` (rewrite)
- Test: `frontend/src/__tests__/database/repositories/PhotoRepository.test.ts` (remove the removed-methods' tests)

**Interfaces:**
- Consumes: `ProjectRepository.getProjectById`, `ProjectRepository.getDistrictName`, `ProjectRepository.updateProject`, `ProjectRepository.assertIdentityAvailable`, `buildProjectFolderLabel`/`canonicalProjectLabel` from `@/src/utils/folderNaming`.
- Produces: `updateProjectFlow(projectId: number, input: ProjectEditInput)` — loads the existing project, computes `oldLabel` via `canonicalProjectLabel(project)` and `newLabel` via `buildProjectFolderLabel(getDistrictName(input.districtId), input.projectName)`, runs `assertIdentityAvailable(input.districtId, input.projectName, projectId)` only when the label changed, then `updateProject(projectId, input)`. No folder moves, no marker, no `withProjectDb`, no `buildUriMap`, no `reverseMove`. The `ProjectEditInput` interface is kept as-is.

New flow (the ONLY remaining public export):

```ts
import { ProjectRepository } from "../repositories/ProjectRepository";
import { buildProjectFolderLabel, canonicalProjectLabel } from "@/src/utils/folderNaming";

export interface ProjectEditInput {
  projectName: string;
  districtId: number;
  block?: string;
  client?: string;
  description?: string;
  inspectorName?: string;
}

export async function updateProjectFlow(
  projectId: number,
  input: ProjectEditInput
): Promise<void> {
  const project = await ProjectRepository.getProjectById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const oldLabel = canonicalProjectLabel(project);
  const newDistrictName = await ProjectRepository.getDistrictName(input.districtId);
  const newLabel = buildProjectFolderLabel(newDistrictName, input.projectName);
  if (oldLabel !== newLabel) {
    await ProjectRepository.assertIdentityAvailable(
      input.districtId,
      input.projectName,
      projectId
    );
  }
  await ProjectRepository.updateProject(projectId, input);
}
```

- [ ] **Step 1: Rewrite the failing service tests**

Overwrite `frontend/src/__tests__/database/services/ProjectEditService.test.ts`:

```ts
jest.mock("@/src/database/repositories/ProjectRepository");

import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { updateProjectFlow } from "@/src/database/services/ProjectEditService";

const mockGetById = ProjectRepository.getProjectById as jest.Mock;
const mockGetDistrictName = ProjectRepository.getDistrictName as jest.Mock;
const mockAssert = ProjectRepository.assertIdentityAvailable as jest.Mock;
const mockUpdate = ProjectRepository.updateProject as jest.Mock;

const existingProject = {
  ProjectID: 1,
  District: "Jaipur",
  DistrictName: "Jaipur",
  ProjectName: "AMC 2026",
  CreatedAt: "2026-01-01",
  IsCustom: 0,
  DivisionID: null,
  Division: null,
  Block: null,
  Client: null,
  Description: null,
  InspectorName: null,
  PendingPhotoFolderRename: null,
};

const input = {
  projectName: "AMC 2027",
  districtId: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetById.mockResolvedValue(existingProject);
  mockGetDistrictName.mockResolvedValue("Jaipur");
  mockUpdate.mockResolvedValue(undefined);
  mockAssert.mockResolvedValue(undefined);
});

describe("updateProjectFlow", () => {
  it("throws when the project does not exist", async () => {
    mockGetById.mockResolvedValueOnce(null);

    await expect(updateProjectFlow(1, input)).rejects.toThrow("Project not found");

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAssert).not.toHaveBeenCalled();
  });

  it("checks identity availability when the project label changes", async () => {
    await updateProjectFlow(1, input);

    expect(mockAssert).toHaveBeenCalledWith("Jaipur", "AMC 2027", 1);
    expect(mockUpdate).toHaveBeenCalledWith(1, input);
  });

  it("skips the identity check when the label is unchanged", async () => {
    const unchanged = { ...input, projectName: "AMC 2026" };

    await updateProjectFlow(1, unchanged);

    expect(mockAssert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(1, unchanged);
  });

  it("never touches photo files, photo rows, or the pending marker", async () => {
    await updateProjectFlow(1, input);

    expect(ProjectRepository.setPendingPhotoFolderRename).not.toHaveBeenCalled();
    expect(ProjectRepository.getPendingPhotoFolderRenames).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
```

Note: this replaces the current file's ~600-line machinery test. The current mocks for `@/src/database/db`, `PhotoRepository`, `@/src/utils/downloadStorage`, `@/src/utils/storageManager`, and `@/src/utils/logger` become unnecessary (the gutted service imports neither); delete them along with the `ProjectAlreadyExistsError` import. `ProjectRepository` is fully auto-mocked by `jest.mock`, so all static methods (including `setPendingPhotoFolderRename`/`getPendingPhotoFolderRenames`) are `jest.fn()`.

- [ ] **Step 2: Run the service tests to verify they fail**

Run: `yarn test --silent --testPathPattern "ProjectEditService.test"`
Expected: FAIL — the current implementation still performs moves/marker writes.

- [ ] **Step 3: Gut the service**

Overwrite `frontend/src/database/services/ProjectEditService.ts` with:

```ts
import { ProjectRepository } from "../repositories/ProjectRepository";
import { buildProjectFolderLabel, canonicalProjectLabel } from "@/src/utils/folderNaming";

export interface ProjectEditInput {
  projectName: string;
  districtId: number;
  block?: string;
  client?: string;
  description?: string;
  inspectorName?: string;
}

export async function updateProjectFlow(
  projectId: number,
  input: ProjectEditInput
): Promise<void> {
  const project = await ProjectRepository.getProjectById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const oldLabel = canonicalProjectLabel(project);
  const newDistrictName = await ProjectRepository.getDistrictName(input.districtId);
  const newLabel = buildProjectFolderLabel(newDistrictName, input.projectName);
  if (oldLabel !== newLabel) {
    await ProjectRepository.assertIdentityAvailable(
      input.districtId,
      input.projectName,
      projectId
    );
  }
  await ProjectRepository.updateProject(projectId, input);
}
```

Deleted from this file (whole file becomes the above): `ProjectAlreadyExistsError` import, `PhotoRepository` import, `clearActiveProject`/`setActiveProject` imports, storageManager imports (`hasProjectFolderFiles`, `moveProjectFolder`, `PhotoFolderConflictError`, `PhotoFolderRenameError`), `downloadStorage` import, `FileMoveResult` type import, `PendingPhotoFolderRenameMarker` (28-38), `withProjectDb` (40-47), `buildUriMap` (49-57), `lastPathSegment` (59-63), `escapeLikeWildcards` (65-67), the old flow body (69-~160), `reverseMove` (164-194), `recoverPendingPhotoFolderRenames` (196-302, including `recoverOne` at 213), `reconstructLegacyUriMap` (304-323). `ProjectAlreadyExistsError` needs NO relocation: the only remaining consumers (`ProjectCreateService`, `app/index.tsx`, `new.tsx`) already import it from `@/src/database/repositories/ProjectRepository`.

- [ ] **Step 4: Remove the dead repository methods + their tests**

Edit `frontend/src/database/repositories/PhotoRepository.ts` — remove `remapFilePaths` (lines 94-105) and `getFilePathsLike` (lines 107-115).
Edit `frontend/src/__tests__/database/repositories/PhotoRepository.test.ts` — remove the `remapFilePaths` + `getFilePathsLike` describes.

- [ ] **Step 5: Remove the error branches in new.tsx**

Edit `frontend/app/projects/new.tsx`:
- Remove `import { storageManager } from "@/src/utils/storageManager";` (line 15).
- Remove the `catch (error)` branch (lines 111-118) that handles `PhotoFolderConflictError` / `PhotoFolderRenameError` — replace with a generic error branch (keep the existing `console.error`/toast for any other error). The submit handler becomes:

```ts
  } catch (error) {
    console.error("Error saving project", error);
    setSaving(false);
  }
```

- [ ] **Step 6: Run the service + repository tests to verify they pass**

Run: `yarn test --silent --testPathPattern "ProjectEditService.test"` and `yarn test --silent --testPathPattern "PhotoRepository.test"`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.

## Task 7: Remove the native + JS `moveFilesInFolder` machinery

**Files:**
- Modify: `frontend/modules/download-storage/android/src/main/java/expo/modules/downloadstorage/DownloadStorageModule.kt`
- Modify: `frontend/modules/download-storage/src/index.ts`
- Modify: `frontend/src/utils/downloadStorage.ts`
- Modify: `frontend/src/utils/storageManager.ts`
- Test: `frontend/src/__tests__/utils/downloadStorage.test.ts`
- Test: `frontend/src/__tests__/utils/storageManager.test.ts`

**Interfaces:**
- Consumes: Task 5 made `hasProjectFolderFiles` the only remaining consumer of the folder utilities.
- Produces: removes `AsyncFunction("moveFilesInFolder")` + `moveFilesInFolder` + `moveFilesInFolderModern` + `moveFilesInFolderLegacy` from Kotlin; removes `FileMoveResult` + `moveFilesInFolder` from the native module type and wrapper; removes `moveProjectFolder`, `PhotoFolderConflictError`, `PhotoFolderRenameError`, and the `FileMoveResult` import from `storageManager`. KEEPS `escapeLikeWildcards` (used by `folderHasFiles`, which stays).

- [ ] **Step 1: Write the failing storageManager tests**

Edit `frontend/src/__tests__/utils/storageManager.test.ts`:
- Remove `moveProjectFolder`, `PhotoFolderConflictError`, `PhotoFolderRenameError` from the `@/src/utils/storageManager` import (lines 11-13).
- Remove `moveFilesInFolder: jest.fn()` from the `downloadStorage` mock (line 26).
- Remove the `moveProjectFolder` test (lines 170-175) and the `PhotoFolderConflictError` / `PhotoFolderRenameError` tests (lines 180-190).
- Add an assertion that the removed exports are gone:

```ts
describe("removed photo-folder-rename surface", () => {
  it("no longer exposes moveProjectFolder or rename error classes", async () => {
    const storageManager = require("@/src/utils/storageManager");
    expect(storageManager.moveProjectFolder).toBeUndefined();
    expect(storageManager.PhotoFolderConflictError).toBeUndefined();
    expect(storageManager.PhotoFolderRenameError).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the storageManager tests to verify they fail**

Run: `yarn test --silent --testPathPattern "storageManager.test"`
Expected: FAIL — the removed exports still exist.

- [ ] **Step 3: Remove the JS wrapper + native module surface**

Edit `frontend/src/utils/downloadStorage.ts` — remove `FileMoveResult` from the `requireNative()` import type and the `moveFilesInFolder` method (lines 73-78).
Edit `frontend/modules/download-storage/src/index.ts` — remove the `FileMoveResult` interface (lines 3-7) and `moveFilesInFolder(oldRelativePath, newRelativePath): Promise<FileMoveResult[]>` from the `DownloadStorageNative` interface (lines 29-32).
Edit `frontend/src/__tests__/utils/downloadStorage.test.ts` — remove `moveFilesInFolder: jest.fn().mockResolvedValue([])` from the native mock (line 21) and the `downloadStorage.moveFilesInFolder` describe (lines 57-79).

- [ ] **Step 4: Remove `moveProjectFolder` + error classes from storageManager**

Edit `frontend/src/utils/storageManager.ts` — remove `import type { FileMoveResult } from "@/modules/download-storage/src";` (line 4), `PhotoFolderConflictError` (10-17), `PhotoFolderRenameError` (19-24), and `moveProjectFolder` (96-101). KEEP `PHOTO_ROOT_DISPLAY`, `ensureRootFolder`, `ensureProjectFolder`, `writePhoto`, `deletePhoto`, `buildPhotoFolderDisplayPath` (87), `hasProjectFolderFiles` (92). The file ends at `hasProjectFolderFiles`.

- [ ] **Step 5: Remove the Kotlin move machinery**

Edit `frontend/modules/download-storage/android/src/main/java/expo/modules/downloadstorage/DownloadStorageModule.kt`:
- Remove `AsyncFunction("moveFilesInFolder")` registration (lines 57-59).
- Remove `moveFilesInFolder` (363-377), `moveFilesInFolderModern` (378-435), `moveFilesInFolderLegacy` (437-468). The file now ends at `renameFile` (line 362).
- KEEP `escapeLikeWildcards` (136) — it is still used by `folderHasFiles` (147).

- [ ] **Step 6: Compile the native module**

Run from `frontend/android`: `.\\gradlew.bat :expo-download-storage:compileDebugKotlin --console=plain`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Full test + typecheck + lint sweep**

Run: `yarn test --silent` — Expected: all green.
Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.

---

## Task 8: `saveAndComplete` persists `StoragePath`; drop `updateFilePath`

**Files:**
- Modify: `frontend/src/components/inspection/useWatermarkProcessor.ts`
- Modify: `frontend/src/database/repositories/PhotoRepository.ts` (remove `updateFilePath`)
- Test: `frontend/src/__tests__/hooks/useWatermarkProcessor.test.tsx`
- Test: `frontend/src/__tests__/database/repositories/PhotoRepository.test.ts`

**Interfaces:**
- Consumes: `PhotoRepository.updateFilePathAndStoragePath` (Task 4), `buildPhotoFolderDisplayPath` from `@/src/utils/storageManager`, `photoStoragePath` lazily via `resolvePhotoStoragePath` (Task 3).
- Produces: `saveAndComplete` calls `updateFilePathAndStoragePath(photoId, contentUri, buildPhotoFolderDisplayPath(label))` — setting BOTH `FilePath` and the immutable `StoragePath` in one statement. `updateFilePath` is deleted.

- [ ] **Step 1: Update the failing hook tests**

Edit `frontend/src/__tests__/hooks/useWatermarkProcessor.test.tsx`:
- In the `PhotoRepository` mock (lines 3-6), replace `updateFilePath: jest.fn()` with `updateFilePathAndStoragePath: jest.fn()`.
- In the `storageManager` mock (lines 22-24), add `buildPhotoFolderDisplayPath: (label: string) => \`Download/ACCC Dynamic Inspection/${label}/\``.
- Update the `saveAndComplete` assertion (line 148) to:

```ts
expect(PhotoRepository.updateFilePathAndStoragePath).toHaveBeenCalledWith(
  expect.any(Number),
  fileUri,
  "Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/"
);
```

- Update the mock-failure assertion (line 389) to `expect(PhotoRepository.updateFilePathAndStoragePath).toHaveBeenCalled();`
- Update the watermark-path assertion (lines 626-629) to use `updateFilePathAndStoragePath` and the same `Download/ACCC Dynamic Inspection/New Delhi_Project Alpha/` literal.

- [ ] **Step 2: Run the hook tests to verify they fail**

Run: `yarn test --silent --testPathPattern "useWatermarkProcessor.test"`
Expected: FAIL — `updateFilePath` is no longer called / `updateFilePathAndStoragePath` is not a function.

- [ ] **Step 3: Update the saveAndComplete call site**

Edit `frontend/src/components/inspection/useWatermarkProcessor.ts`:
- Change `import { writePhoto } from "@/src/utils/storageManager";` (line 8) to `import { writePhoto, buildPhotoFolderDisplayPath } from "@/src/utils/storageManager";`.
- At line 466, replace:

```ts
      await PhotoRepository.updateFilePath(job.photoId, contentUri);
```

with:

```ts
      await PhotoRepository.updateFilePathAndStoragePath(
        job.photoId,
        contentUri,
        buildPhotoFolderDisplayPath(label)
      );
```

The `label` variable is already computed in the enclosing `saveAndComplete` scope. Verify by reading the surrounding lines before editing.

- [ ] **Step 4: Remove `updateFilePath` from the repository + its tests**

Edit `frontend/src/database/repositories/PhotoRepository.ts` — remove `updateFilePath` (lines 78-84).
Edit `frontend/src/__tests__/database/repositories/PhotoRepository.test.ts` — remove the `updateFilePath` describe (line 31 + block).

- [ ] **Step 5: Run the hook + repository tests to verify they pass**

Run: `yarn test --silent --testPathPattern "useWatermarkProcessor.test"` and `yarn test --silent --testPathPattern "PhotoRepository.test"`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.

---

## Task 9: Preview shows `StoragePath` (drop the `project` prop)

**Files:**
- Modify: `frontend/src/components/inspection/PhotoPreviewModal.tsx`
- Modify: `frontend/src/components/inspection/PhotoSection.tsx`
- Test: `frontend/src/__tests__/components/inspection/PhotoPreviewModal.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `Photo` model (`StoragePath`), `resolvePhotoStoragePath` from `@/src/utils/photoStoragePath`, `PhotoRepository.updateStoragePath` (Task 4).
- Produces: `PhotoPreviewModal` drops the `project` prop and `buildPhotoFolderDisplayPath`/`canonicalProjectLabel` imports. "Saved Location" renders from a local `storagePath` state: initially `photo.StoragePath`, then lazily backfilled via `resolvePhotoStoragePath` + `PhotoRepository.updateStoragePath` in an effect (only when `StoragePath` was missing). Callers no longer pass `project`.

- [ ] **Step 1: Rewrite the failing modal tests**

Overwrite `frontend/src/__tests__/components/inspection/PhotoPreviewModal.test.tsx`:

```tsx
import React from "react";
import TestRenderer from "react-test-renderer";
import PhotoPreviewModal from "@/src/components/inspection/PhotoPreviewModal";
import { resolvePhotoStoragePath } from "@/src/utils/photoStoragePath";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";

jest.mock("@/src/utils/photoStoragePath", () => ({
  resolvePhotoStoragePath: jest.fn(),
}));
jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  __esModule: true,
  default: { updateStoragePath: jest.fn() },
}));

const mockResolve = resolvePhotoStoragePath as jest.Mock;
const mockUpdateStoragePath = PhotoRepository.updateStoragePath as jest.Mock;

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return out;
  }
  if (node && typeof node === "object") {
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const child of children) collectStrings(child, out);
    }
  }
  return out;
}

function render(props: Partial<React.ComponentProps<typeof PhotoPreviewModal>>) {
  let tree: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PhotoPreviewModal
        photo={null}
        visible
        onClose={() => {}}
        contextPoleId="P1"
        block=""
        {...props}
      />
    );
  });
  return tree!;
}

const photo = {
  PhotoID: 1,
  InspectionID: 1,
  PhotoType: "Pole",
  FileName: "Jaipur_AMC 2026_P1_15AUG2026_112948.jpg",
  FilePath:
    "content://media/Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/Jaipur_AMC 2026_P1_15AUG2026_112948.jpg",
  Latitude: 26.9124,
  Longitude: 75.7873,
  CapturedAt: "2026-08-15T11:29:48.000Z",
  Remarks: null,
  StoragePath: "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PhotoPreviewModal", () => {
  it("renders the file name", () => {
    const strings = collectStrings(render({ photo }).toJSON());
    expect(strings).toContain("Jaipur_AMC 2026_P1_15AUG2026_112948.jpg");
  });

  it("renders the saved location from StoragePath without a project prop", () => {
    const strings = collectStrings(render({ photo }).toJSON());
    const joined = strings.join(" ");
    expect(joined).toContain("Saved Location:");
    expect(joined).toContain("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("does not render GPS coordinates", () => {
    const strings = collectStrings(render({ photo }).toJSON());
    expect(strings.join(" ")).not.toContain("26.912400");
    expect(strings.join(" ")).not.toContain("75.787300");
  });

  it("renders empty file name and no saved location when the photo is null", () => {
    const strings = collectStrings(render({ photo: null }).toJSON());
    expect(strings.join(" ")).toContain("File Name:");
    expect(strings.join(" ")).not.toContain("Saved Location:");
  });

  it("lazily resolves and persists StoragePath when it is missing", async () => {
    const missing = { ...photo, StoragePath: undefined };
    mockResolve.mockResolvedValue("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");

    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <PhotoPreviewModal
          visible
          photo={missing}
          onClose={() => {}}
          contextPoleId="P1"
          block=""
        />
      );
    });
    await TestRenderer.act(async () => {
      await Promise.resolve();
    });

    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).toContain("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
    expect(mockResolve).toHaveBeenCalledWith(missing);
    expect(mockUpdateStoragePath).toHaveBeenCalledWith(
      1,
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
  });

  it("shows no saved location when resolution returns null", async () => {
    const missing = { ...photo, StoragePath: undefined };
    mockResolve.mockResolvedValue(null);

    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <PhotoPreviewModal
          visible
          photo={missing}
          onClose={() => {}}
          contextPoleId="P1"
          block=""
        />
      );
    });
    await TestRenderer.act(async () => {
      await Promise.resolve();
    });

    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).not.toContain("Saved Location:");
    expect(mockUpdateStoragePath).not.toHaveBeenCalled();
  });
});
```

Note: this replaces the current file's project-derived tests (including "falls back to the root display path when the project is missing"). The effect is flushed with `TestRenderer.act(async () => { await Promise.resolve(); })` — if the two await rounds are insufficient for the promise chain, add a second identical act flush. `contextPoleId`/`block` props are kept (still required by the interface).

- [ ] **Step 2: Run the modal tests to verify they fail**

Run: `yarn test --silent --testPathPattern "PhotoPreviewModal.test"`
Expected: FAIL — component still requires `project`.

- [ ] **Step 3: Implement the modal change**

Edit `frontend/src/components/inspection/PhotoPreviewModal.tsx`:

1. Remove the `project` prop from the props interface and destructure; remove `import { Project } from "@/src/models/Project";` (line 5), `import { buildPhotoFolderDisplayPath } from "@/src/utils/storageManager";` (line 7), and `import { canonicalProjectLabel } from "@/src/utils/folderNaming";` (line 8).
2. Add imports: `import { useEffect, useState } from "react";` (extend line 1), `import { resolvePhotoStoragePath } from "@/src/utils/photoStoragePath";`, and `import PhotoRepository from "@/src/database/repositories/PhotoRepository";`.
3. Replace the derived saved-location render (lines 56-58) with a state + effect:

```tsx
  const [storagePath, setStoragePath] = useState<string | null>(photo?.StoragePath ?? null);

  useEffect(() => {
    if (!photo) {
      setStoragePath(null);
      return;
    }
    if (photo.StoragePath && photo.StoragePath.trim()) {
      setStoragePath(photo.StoragePath);
      return;
    }
    let cancelled = false;
    resolvePhotoStoragePath(photo).then(async (resolved) => {
      if (cancelled) return;
      if (resolved) {
        setStoragePath(resolved);
        if (photo.PhotoID) {
          try {
            await PhotoRepository.updateStoragePath(photo.PhotoID, resolved);
          } catch {
            // non-fatal: StoragePath is display-only
          }
        }
      } else {
        setStoragePath(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photo]);
```

4. Render: replace ONLY the saved-location `Text` (current lines 55-60 — keep the enclosing `<View style={styles.info}>` at line 54 and the "File Name" `Text` below) with a conditional block that shows the "Saved Location:" label only when `storagePath` is non-null:

```tsx
          {storagePath ? (
            <Text variant="bodySmall" style={styles.infoText}>
              Saved Location: {storagePath}
            </Text>
          ) : null}
```

Note: the existing label is inline within one `Text` element (`Saved Location: {value}`), so the rewritten tests assert `strings.join(" ").toContain("Saved Location:")` — keep the inline form. The `Project` import (line 5) is dropped with the prop; `getFileUri` (line 6) stays.

Edit `frontend/src/components/inspection/PhotoSection.tsx`:
- Remove `project={project}` from the `<PhotoPreviewModal>` call (line 157). `project` remains available from `useInspection()` (line 36) for the other uses in this component.

- [ ] **Step 4: Run the modal tests to verify they pass**

Run: `yarn test --silent --testPathPattern "PhotoPreviewModal.test"`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + full test sweep**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `yarn lint` — Expected: 0 errors.
Run: `yarn test --silent` — Expected: all green.

## Task 10: Full gate + changelog/ADR

**Files:**
- Modify: `frontend/docs/07-Changelog.md`
- Modify: `frontend/docs/09-Decisions.md` (new ADR entry)

**Interfaces:**
- Consumes: the completed Tasks 1-9.
- Produces: verified full gate + documentation of the architectural change.

- [ ] **Step 1: Run the full verification gate**

From `frontend/`:

```bash
yarn test --silent
npx tsc --noEmit
yarn lint
```

Expected: all tests pass (~78 suites), `tsc` exits 0, lint 0 errors. Then from `frontend/android`:

```bash
.\gradlew.bat :expo-download-storage:compileDebugKotlin --console=plain
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: Verify no dead references remain**

```bash
rg -n "moveProjectFolder|moveFilesInFolder|reverseMove|remapFilePaths|getFilePathsLike|recoverPendingPhotoFolderRenames|PhotoFolderConflictError|PhotoFolderRenameError" frontend/ --glob "!docs/**"
```

Expected: no matches outside `docs/` (the drain + PendingRenameDrain.test are the only intentional survivors of the `PendingPhotoFolderRename`/`recover` naming — confirm `recoverPendingPhotoFolderRenames` matches only docs/history references).

- [ ] **Step 3: Update the changelog**

Append to `frontend/docs/07-Changelog.md` under the current date section:

```
## [Unreleased]
- Removed photo-folder-rename on project edit: project edits no longer move photos.
- Added `Photos.StoragePath` (nullable) holding the immutable folder each photo was saved into; set at capture time for new photos, lazily derived for legacy photos.
- Photo preview "Saved Location" now reads `StoragePath` only, never the current project identity.
- Added one-time non-destructive drain of legacy `PendingPhotoFolderRename` markers at startup.
```

- [ ] **Step 4: Add the ADR entry**

Append to `frontend/docs/09-Decisions.md` a new ADR (next number after the latest entry), e.g. ADR-01x:

```
## ADR-01x: Immutable photo storage — drop photo-folder-rename on project edit

Status: Accepted

Context:
Project edits used to move photo folders (and reverse-move on failure). This
failed on-device (MediaProvider RELATIVE_PATH update into a non-materialized
destination returns 0 rows on API >= 29), and the rename/recovery architecture
added risk to a core inspection flow.

Decision:
- New photos set both `FilePath` (the real URI) and `StoragePath` (the
  human-readable `Download/ACCC Dynamic Inspection/<label>/` folder) at save
  time.
- Project edits never move, rename, or rewrite photos. `updateProjectFlow` is a
  pure identity + uniqueness check then `updateProject`.
- Photo preview "Saved Location" reads `StoragePath` only. Missing values are
  lazily backfilled: derived from legacy `file://` paths, or queried from
  MediaStore `RELATIVE_PATH` for modern `content://` URIs. Lookup failure
  yields null — never an invented location.
- The `PendingPhotoFolderRename` column remains; markers are drained once,
  non-destructively, at startup. No new markers are written.

Consequences:
- Photos are immutable; project renames cannot corrupt inspection evidence.
- Legacy photos are never migrated by moving files; display-only backfill
  reflects the real on-disk location.
```

- [ ] **Step 5: Final consistency pass**

Read the diff of every file touched in Tasks 1-9 (`git diff --stat` + `git diff`), confirming:
- No `moveProjectFolder` / `moveFilesInFolder` / `reverseMove` / `remapFilePaths` / `getFilePathsLike` references remain.
- `updateFilePath` is gone (production + tests).
- `PhotoRepository.updateFilePathAndStoragePath` + `updateStoragePath` are used by their intended call sites only.
- The `PendingPhotoFolderRename` column is untouched by schema; `getPendingPhotoFolderRenames`/`setPendingPhotoFolderRename` are used only by `PendingRenameDrain.ts`.

---

## Self-Review Checklist (verify before delivery)

- [ ] **Spec coverage:** every one of the 7 numbered requirements is mapped to at least one task (R1→T8, R2→T3/T9, R3→T6, R4→T9, R5→T6/T7/T8, R6→no-op verified, R7→T1/T3).
- [ ] **Placeholder scan:** `rg -n "TODO|FIXME|XXX|throw new Error\(\"not implemented"` on the changed files — none introduced.
- [ ] **Type/name consistency:** every symbol referenced in this plan exists with a matching signature in the described file (verified during exploration: `PhotoRepository.getById`, `ProjectRepository.getProjectById`/`getDistrictName`/`updateProject`/`assertIdentityAvailable`/`getPendingPhotoFolderRenames`/`setPendingPhotoFolderRename`, `storageManager.hasProjectFolderFiles`/`buildPhotoFolderDisplayPath`/`PHOTO_ROOT_DISPLAY`/`writePhoto`/`deletePhoto`).
- [ ] **Isolation requirement:** Task 4 ships the `StoragePath` isolation regression test (AGENTS.md mandatory).
- [ ] **Line numbers:** the Kotlin removal ranges (363-468) and registration lines (57-59) were confirmed by reading the file; re-verify against the live file before executing the task.

## Handoff

- [ ] Present the plan to the user with the execution choice: **subagent-driven-development** (recommended — parallelizable, task-by-task with review checkpoints) vs **executing-plans** (single-session sequential). Implement in place on `feat/pole-id-rename-dialog-ux` (do not create a worktree).
- [ ] Do NOT commit. The user will review the full tree before any commit decision.
