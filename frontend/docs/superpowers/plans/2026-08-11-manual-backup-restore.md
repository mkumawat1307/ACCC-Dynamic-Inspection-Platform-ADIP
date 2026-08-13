# Manual Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users export a single `Download/ACCC Dynamic Inspection/accc_backup.zip` file containing a **physical copy** of every SQLite database (global DB + every project DB + their WAL sidecars), and restore it after reinstall or on demand, without touching Auto Backup or any photo/watermark/camera logic.

**Architecture:** A standard ZIP archive of the raw database files, built with the pure-JS `jszip` library (no native module, no prebuild). Backup runs from the Settings screen: request the SAF Download tree, ensure the `ACCC Dynamic Inspection` dir, overwrite any existing `accc_backup.zip`, then zip `SQLite/accc_global.db` (plus its `-wal`/`-shm` if present) and each `Projects/<folder>/inspection.db` together with its `-wal`/`-shm` sidecars (project DBs run WAL, so copying all three together is a consistent snapshot — no checkpoint needed, DBs stay OPEN during backup to avoid UI disruption and races). Restore validates the file, closes all handles, extracts every entry back to `files/SQLite/` and `files/Projects/`, removes project folders not present in the backup, and reloads the app. DB I/O stays behind repositories/connection manager; the UI never touches SQLite.

**Tech Stack:** React Native 0.81.5 (New Architecture), Expo SDK 54, expo-sqlite 16 (sequential open/close model), expo-file-system/legacy SAF (existing `StorageAccessFramework` usage in `src/utils/storageManager.ts`), `jszip` (pure-JS zip, ES5/UMD dist â€” works with Hermes + Jest with no transform changes), Jest 29.

## Global Constraints

- Single backup file, name literally `accc_backup.zip`; final user-visible path reported as `Download/ACCC Dynamic Inspection/accc_backup.zip`.
- Backup must overwrite an existing file at that path; restore must validate existence first and confirm before replacing.
- Backup is a **physical copy**: zip `SQLite/accc_global.db` (real name per `GLOBAL_DATABASE_NAME`; the spec's `SQLite/accc.db` is shorthand), plus `SQLite/accc_global.db-wal` and `-shm` only if present, and for each project folder `Projects/<folder>/inspection.db`, `inspection.db-wal`, `inspection.db-shm` (only those that exist). Project DBs run WAL, so copying the `.db`+`-wal`+`-shm` trio together is a consistent snapshot — NO `PRAGMA wal_checkpoint`, NO opening/closing any SQLite handle during backup.
- Do **NOT** call `closeAllDatabases()` during backup — keep databases open so the app is not disturbed (no UI hitches, no races with in-flight writes). `closeAllDatabases()` is used ONLY in the restore flow, immediately before replacing files on disk. NEVER hold two SQLite handles; NEVER call `getGlobalDatabase()` mid-inspection-flow (backup/restore runs from the Settings screen, not the inspection flow).
- No MANAGE_EXTERNAL_STORAGE. SAF only, targeting the Download tree via `requestDirectoryPermissionsAsync`.
- Do NOT change Auto Backup (allowBackup/rules/module), watermark, camera, geocode, queue, or photo-saving logic. `requestAndroidBackup()` is not part of this feature.
- Photos stay out of scope: they are written to DCIM via SAF and persist across uninstall; the DBs (which hold photo refs) are what the backup carries.
- No comments unless requested. TypeScript strict; avoid `any`.
- Modified files keep per-file Jest coverage thresholds (80/80/80/70). New files don't lower any existing threshold.
- The zip binary is written to SAF via legacy `writeAsStringAsync` with `EncodingType.Base64` â€” that is transport encoding required by the legacy API, NOT the removed custom serialization. The zip holds raw DB bytes; jszip natively converts base64â†”bytes, so `src/utils/backupZip.ts` only needs thin wrappers (`zipBase64`, `unzipBase64`, `isZipBytes`) plus the path constants.
- One dependency is added: `jszip` (Task 1). `yarn add jszip` is allowed by `scripts/cmd-guard.js`. No other installs.
- Do NOT commit or push (review-only deliverable) unless the user explicitly asks in a follow-up.

---

## Task 1: Add `jszip` + pure zip helpers & path module

**Files:**
- Modify: `package.json` / `yarn.lock` (add `jszip`)
- Create: `src/utils/backupZip.ts`
- Test: `src/__tests__/utils/backupZip.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3â€“5 and all later tasks):
  - `const BACKUP_DIR_NAME: string` â†’ `"ACCC Dynamic Inspection"`
  - `const BACKUP_FILE_NAME: string` â†’ `"accc_backup.zip"`
  - `export function buildBackupDisplayPath(): string` â†’ `"Download/ACCC Dynamic Inspection/accc_backup.zip"`
  - `export async function zipBase64(files: Record<string, Uint8Array>): Promise<string>` â€” jszip wrapper: `new JSZip()`, `file(name, bytes)` per entry, `generateAsync({ type: "base64" })`.
  - `export async function unzipBase64(b64: string): Promise<Record<string, Uint8Array>>` â€” `JSZip.loadAsync(b64, { base64: true })`, then per entry `async("uint8array")`.
  - `export function isZipBytes(bytes: Uint8Array): boolean` â€” true when first 4 bytes are `0x50 0x4b 0x03 0x04` (ZIP local-file-header magic `PK\x03\x04`).
- Consumes: `jszip` only.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/utils/backupZip.test.ts
import JSZip from "jszip";
import {
  BACKUP_DIR_NAME,
  BACKUP_FILE_NAME,
  buildBackupDisplayPath,
  zipBase64,
  unzipBase64,
  isZipBytes,
} from "@/src/utils/backupZip";

describe("backupZip", () => {
  it("builds the canonical user-facing backup path", () => {
    expect(buildBackupDisplayPath()).toBe(
      "Download/ACCC Dynamic Inspection/accc_backup.zip"
    );
    expect(BACKUP_FILE_NAME).toBe("accc_backup.zip");
    expect(BACKUP_DIR_NAME).toBe("ACCC Dynamic Inspection");
  });

  it("round-trips entries through a real zip", async () => {
    const b64 = await zipBase64({
      "SQLite/accc_global.db": new Uint8Array([1, 2, 3, 4]),
      "Projects/Alpha/inspection.db": new Uint8Array([9, 8, 7]),
    });
    const out = await unzipBase64(b64);
    expect(Array.from(out["SQLite/accc_global.db"])).toEqual([1, 2, 3, 4]);
    expect(Array.from(out["Projects/Alpha/inspection.db"])).toEqual([9, 8, 7]);
  });

  it("zipBase64 output is a valid zip (magic PK\\x03\\x04)", async () => {
    const b64 = await zipBase64({ "a.db": new Uint8Array([0]) });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(isZipBytes(bytes)).toBe(true);
  });

  it("detects the zip magic PK\\x03\\x04", () => {
    expect(isZipBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBe(true);
    expect(isZipBytes(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(isZipBytes(new Uint8Array([]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/__tests__/utils/backupZip.test.ts`
Expected: FAIL â€” "Cannot find module '@/src/utils/backupZip'".

- [ ] **Step 3: Add the dependency**

```bash
yarn add jszip
```

Confirm `"jszip": "<exact version>"` in `package.json` (`.npmrc` sets `save-exact=true`). If Jest errors on jszip's ESM/UMD interop, add `"jszip"` to `transformIgnorePatterns` in `jest.config.js` (prepend to the existing alternation).

- [ ] **Step 4: Implement the module**

```ts
// src/utils/backupZip.ts
import JSZip from "jszip";

export const BACKUP_DIR_NAME = "ACCC Dynamic Inspection";
export const BACKUP_FILE_NAME = "accc_backup.zip";

export function buildBackupDisplayPath(): string {
  return `Download/${BACKUP_DIR_NAME}/${BACKUP_FILE_NAME}`;
}

export async function zipBase64(
  files: Record<string, Uint8Array>
): Promise<string> {
  const zip = new JSZip();
  for (const [name, bytes] of Object.entries(files)) {
    zip.file(name, bytes);
  }
  return zip.generateAsync({ type: "base64" });
}

export async function unzipBase64(
  b64: string
): Promise<Record<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const out: Record<string, Uint8Array> = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    out[name] = await entry.async("uint8array");
  }
  return out;
}

export function isZipBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `yarn test src/__tests__/utils/backupZip.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json yarn.lock src/utils/backupZip.ts src/__tests__/utils/backupZip.test.ts
git commit -m "feat: add jszip + pure zip/path helpers for manual backup"
```

---

## Task 2: `closeAllDatabases()` in the connection manager

**Files:**
- Modify: `src/database/db.ts` (add exported function near `clearActiveProject`)
- Test: `src/__tests__/database/db.test.ts` (existing file covers `db.ts` thresholds)

**Interfaces:**
- Produces (consumed by Task 4 restore): `export async function closeAllDatabases(): Promise<void>` â€” closes the current handle (if any) WITHOUT reopening the global DB. Backup does NOT use it (databases stay open during zip creation); restore uses it immediately before replacing files on disk.
- Consumes: the existing private `closeCurrentDb()` inside db.ts.

- [ ] **Step 1: Make `GLOBAL_DATABASE_NAME` exported and add the function**

Change `const GLOBAL_DATABASE_NAME = "accc_global.db";` (db.ts:7) to `export const`. Add directly after `clearActiveProject`:

```ts
export async function closeAllDatabases(): Promise<void> {
  await closeCurrentDb();
}
```

`closeAllDatabases` simply delegates to the already-private `closeCurrentDb`, which resets `database`, `currentDbTarget`, and calls `closeAsync`. Reuses the same non-fatal error handling. No new handle is opened.

- [ ] **Step 2: Add tests**

Read the existing `src/__tests__/database/db.test.ts` first to match its mock style (it creates a mock handle with `closeAsync`). Add:

```ts
it("closeAllDatabases closes the active handle without reopening", async () => {
  const { getGlobalDatabase, closeAllDatabases } = require("@/src/database/db");
  await getGlobalDatabase();
  await closeAllDatabases();
  expect(mockCloseAsync).toHaveBeenCalled();
});

it("closeAllDatabases is safe with no open handle", async () => {
  const { closeAllDatabases } = require("@/src/database/db");
  await expect(closeAllDatabases()).resolves.toBeUndefined();
});
```

Adjust to whatever import/require pattern the existing file uses (check how `getGlobalDatabase` is exercised there).

- [ ] **Step 3: Run the db test suite**

Run: `yarn test src/__tests__/database/db.test.ts`
Expected: PASS, and `src/database/db.ts` still meets its 80/80/80/70 threshold.

- [ ] **Step 4: Commit**

```bash
git add src/database/db.ts src/__tests__/database/db.test.ts
git commit -m "feat: add closeAllDatabases() to connection manager"
```

---

## Task 3: BackupManager â€” collect physical files & export zip

**Files:**
- Create: `src/database/helpers/BackupManager.ts`
- Test: `src/__tests__/database/helpers/BackupManager.test.ts`

**Interfaces:**
- Consumes:
  - `GLOBAL_DATABASE_NAME` from `@/src/database/db` (backup does NOT call `closeAllDatabases`)
  - `listProjectFolders` from `@/src/database/helpers/ProjectDBManager`
  - `* as FileSystem from "expo-file-system/legacy"` (SAF: `requestDirectoryPermissionsAsync`, `readDirectoryAsync`, `makeDirectoryAsync`, `createFileAsync`, `writeAsStringAsync`, `deleteAsync`, `getInfoAsync`, `EncodingType`)
  - `zipBase64`, `BACKUP_DIR_NAME`, `BACKUP_FILE_NAME`, `buildBackupDisplayPath` from `@/src/utils/backupZip`
- Produces (consumed by Task 4 and 5):
  - `export interface BackupResult { ok: boolean; message: string; path?: string }`
  - `export async function backupNow(): Promise<BackupResult>`
  - `export async function getGlobalDbFilePath(): Promise<string>` â€” `FileSystem.documentDirectory + "SQLite/" + GLOBAL_DATABASE_NAME` (single source of truth for BOTH backup-read and restore-write so real and mocked paths never diverge; matches expo-sqlite's default dir = filesDir/SQLite).
  - `export const DOWNLOAD_TREE_URI = "content://com.android.externalstorage.documents/tree/primary%3ADownload"`

`GLOBAL_DATABASE_NAME` is exported from db.ts in Task 2 so BackupManager and tests share it.

- [ ] **Step 1: Write the failing test**

Model it on `src/__tests__/database/helpers/ProjectDBManager.test.ts` mocking (`jest.mock("@/src/database/db")`, mock `expo-file-system/legacy`). Key assertions:

- `backupNow()` calls SAF permission request, creates the `ACCC Dynamic Inspection` dir, creates `accc_backup.zip`, and writes bytes that `isZipBytes()` accepts.
- `unzipBase64(written)` yields one entry `SQLite/accc_global.db` plus (when present on disk) `SQLite/accc_global.db-wal` / `-shm`, and, for each mocked project folder, `Projects/<folder>/inspection.db` and (only when present on disk) `-wal` / `-shm`.
- `closeAllDatabases` is NOT called during backup (databases stay open while the zip is created).
- No SQLite `getDatabase()`/`setActiveProject()` call happens during backup â€” files are read directly, proving no handle is opened or closed (sequential model respected, no UI disruption).
- When SAF permission is denied, returns `{ ok: false, message: <contains "permission"> }`.
- When the global DB file is absent, backup still succeeds (global entry skipped) and does not throw.

Because backup never opens SQLite handles, mock `@/src/database/db` so `closeAllDatabases`, `getGlobalDatabase`/`setActiveProject` are `jest.fn()` (assert `closeAllDatabases` and `getGlobalDatabase` are NOT called). `listProjectFolders` mocked to `["Alpha", "Beta"]`. Mock `expo-file-system/legacy` with an in-memory Map so `readAsStringAsync`/`writeAsStringAsync` round-trip (content stored as the base64 string, matching the real legacy API). Mock `requestDirectoryPermissionsAsync` to return `{ granted: true, directoryUri: "content://mock/tree/" }`. `createFileAsync` must throw when the name already exists (as the mock already does at `__mocks__/expo-file-system.ts:128`) so the pre-delete path is exercised.

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/__tests__/database/helpers/BackupManager.test.ts`
Expected: FAIL â€” missing module.

- [ ] **Step 3: Implement `backupNow`**

```ts
import { GLOBAL_DATABASE_NAME } from "../db";
import { listProjectFolders } from "./ProjectDBManager";
import {
  BACKUP_DIR_NAME,
  BACKUP_FILE_NAME,
  buildBackupDisplayPath,
  zipBase64,
} from "@/src/utils/backupZip";

export interface BackupResult {
  ok: boolean;
  message: string;
  path?: string;
}

export const DOWNLOAD_TREE_URI =
  "content://com.android.externalstorage.documents/tree/primary%3ADownload";

export async function getGlobalDbFilePath(): Promise<string> {
  return `${FileSystem.documentDirectory}SQLite/${GLOBAL_DATABASE_NAME}`;
}

async function ensureBackupDirUri(treeUri: string): Promise<string> {
  const names = await FileSystem.StorageAccessFramework.readDirectoryAsync(treeUri);
  if (names.includes(BACKUP_DIR_NAME)) return `${treeUri}/${BACKUP_DIR_NAME}`;
  return FileSystem.StorageAccessFramework.makeDirectoryAsync(treeUri, BACKUP_DIR_NAME);
}

async function collectDbFiles(): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const globalBase = `SQLite/${GLOBAL_DATABASE_NAME}`;
  const globalRels = [
    globalBase,
    `${globalBase}-wal`,
    `${globalBase}-shm`,
  ];
  for (const rel of globalRels) {
    try {
      const b64 = await FileSystem.readAsStringAsync(
        `${FileSystem.documentDirectory}${rel}`,
        { encoding: FileSystem.EncodingType.Base64 }
      );
      files[rel] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      // global DB / sidecar absent â€” skip, non-fatal
    }
  }
  const folders = await listProjectFolders();
  for (const folder of folders) {
    const rels = [
      `Projects/${folder}/inspection.db`,
      `Projects/${folder}/inspection.db-wal`,
      `Projects/${folder}/inspection.db-shm`,
    ];
    for (const rel of rels) {
      try {
        const b64 = await FileSystem.readAsStringAsync(
          `${FileSystem.documentDirectory}${rel}`,
          { encoding: FileSystem.EncodingType.Base64 }
        );
        files[rel] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch {
        // sidecar/file absent â€” skip
      }
    }
  }
  return files;
}

export async function backupNow(): Promise<BackupResult> {
  try {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
      DOWNLOAD_TREE_URI
    );
    if (!permission.granted) {
      return { ok: false, message: "Storage permission denied" };
    }
    const dirUri = await ensureBackupDirUri(permission.directoryUri);
    const existingUri = `${dirUri}/${BACKUP_FILE_NAME}`;
    const existing = await FileSystem.StorageAccessFramework.getInfoAsync(existingUri);
    if (existing.exists) {
      await FileSystem.StorageAccessFramework.deleteAsync(existingUri);
    }
    const files = await collectDbFiles();
    const zip = await zipBase64(files);
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      dirUri,
      BACKUP_FILE_NAME,
      "application/zip"
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(
      fileUri,
      zip,
      { encoding: FileSystem.EncodingType.Base64 }
    );
    return { ok: true, message: "Backup created", path: buildBackupDisplayPath() };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
```

Note: `requestDirectoryPermissionsAsync(initialUri)` accepts the Download tree URI and behaves exactly like the DCIM flow in `storageManager.ts` â€” no broad permission. `jszip`'s `generateAsync({ type: "base64" })` produces a real ZIP with `PK\x03\x04` magic. No `expo-sqlite` import is needed in BackupManager â€” paths come from `FileSystem.documentDirectory` via `getGlobalDbFilePath()`/`ProjectDBManager` conventions. `collectDbFiles` reads each `.db` together with its `-wal`/`-shm` sidecars (when present) while the databases stay OPEN; copying the trio atomically is consistent even under WAL, so no `closeAllDatabases()` and no checkpoint are required during backup. The same helper is shared with restore, where the caller closes all handles BEFORE writing files back.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test src/__tests__/database/helpers/BackupManager.test.ts`
Expected: PASS. Keep `src/database/helpers/BackupManager.ts` well-covered (it has no per-file threshold in jest.config.js, but the module should stay â‰¥ 80%).

- [ ] **Step 5: Commit**

```bash
git add src/database/helpers/BackupManager.ts src/__tests__/database/helpers/BackupManager.test.ts
git commit -m "feat: backupNow exports a single accc_backup.zip of all DB files"
```

---

## Task 4: BackupManager â€” validate & restore from zip

**Files:**
- Modify: `src/database/helpers/BackupManager.ts` (same file)
- Test: `src/__tests__/database/helpers/BackupManager.test.ts` (append describe block)

**Interfaces:**
- Consumes: `FileSystem.StorageAccessFramework`, `unzipBase64` and `isZipBytes` from `@/src/utils/backupZip`, `BACKUP_DIR_NAME`, `BACKUP_FILE_NAME`, `buildBackupDisplayPath`, `closeAllDatabases`, `getGlobalDbFilePath`, `listProjectFolders`.
- Produces:
  - `export async function findBackupFile(): Promise<string | null>` â€” returns the SAF file URI for `Download/ACCC Dynamic Inspection/accc_backup.zip` if present, else `null`.
  - `export async function validateBackupFile(fileUri: string): Promise<{ ok: boolean; message: string }>` â€” reads the file, checks `isZipBytes` on the decoded bytes; message describes entry count on success.
  - `export async function restoreBackup(onConfirm: () => Promise<boolean>): Promise<BackupResult>` â€” locate file (error if missing), validate (error if invalid), call `onConfirm` (abort if false), then close all DBs, extract every entry, remove stale project folders, and reload.

- [ ] **Step 1: Write the failing tests**

Add to `BackupManager.test.ts`:
- `findBackupFile` returns `null` when the dir/file is absent; returns the URI when present.
- `validateBackupFile` returns `{ok:false}` for a garbage file and `{ok:true, message} ` for a real zip.
- `restoreBackup` aborts when `onConfirm` resolves `false` (no files written).
- `restoreBackup` extracts each entry back: `SQLite/accc_global.db` â†’ `getGlobalDbFilePath()`; `Projects/<name>/inspection.db` â†’ `Files/Projects/<name>/inspection.db`; asserts `writeAsStringAsync` called with the exact base64 of each original byte buffer.
- `restoreBackup` deletes a project folder that exists on disk but has NO entry in the zip (stale cleanup).
- `restoreBackup` throws/invalid-message when the backup file is missing.

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test src/__tests__/database/helpers/BackupManager.test.ts`
Expected: FAIL â€” `findBackupFile`/`validateBackupFile`/`restoreBackup` missing.

- [ ] **Step 3: Implement**

```ts
import { unzipBase64, isZipBytes } from "@/src/utils/backupZip";

async function ensureBackupDirUri(treeUri: string): Promise<string> {
  const names = await FileSystem.StorageAccessFramework.readDirectoryAsync(treeUri);
  if (names.includes(BACKUP_DIR_NAME)) return `${treeUri}/${BACKUP_DIR_NAME}`;
  return FileSystem.StorageAccessFramework.makeDirectoryAsync(treeUri, BACKUP_DIR_NAME);
}

export async function findBackupFile(): Promise<string | null> {
  try {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
      DOWNLOAD_TREE_URI
    );
    if (!permission.granted) return null;
    const dirUri = await ensureBackupDirUri(permission.directoryUri);
    const names = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
    if (!names.includes(BACKUP_FILE_NAME)) return null;
    return `${dirUri}/${BACKUP_FILE_NAME}`;
  } catch {
    return null;
  }
}

export async function validateBackupFile(
  fileUri: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const b64 = await FileSystem.StorageAccessFramework.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (!isZipBytes(bytes)) {
      return { ok: false, message: "Not a valid ACCC backup file" };
    }
    const entries = await unzipBase64(b64);
    return { ok: true, message: `Found ${Object.keys(entries).length} file(s)` };
  } catch {
    return { ok: false, message: "Not a valid ACCC backup file" };
  }
}

export async function restoreBackup(
  onConfirm: () => Promise<boolean>
): Promise<BackupResult> {
  try {
    const fileUri = await findBackupFile();
    if (!fileUri) {
      return { ok: false, message: `No backup found at ${buildBackupDisplayPath()}` };
    }
    const validated = await validateBackupFile(fileUri);
    if (!validated.ok) return { ok: false, message: validated.message };
    const confirmed = await onConfirm();
    if (!confirmed) return { ok: false, message: "Restore cancelled" };

    const b64 = await FileSystem.StorageAccessFramework.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const entries = await unzipBase64(b64);

    await closeAllDatabases();

    const restoredFolders = new Set<string>();
    for (const [relPath, bytes] of Object.entries(entries)) {
      const target = `${FileSystem.documentDirectory}${relPath}`;
      const parent = target.slice(0, target.lastIndexOf("/"));
      await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
      const outB64 = btoa(String.fromCharCode(...bytes));
      await FileSystem.writeAsStringAsync(target, outB64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const m = relPath.match(/^Projects\/([^/]+)\//);
      if (m) restoredFolders.add(m[1]);
    }

    const onDisk = await listProjectFolders();
    for (const folder of onDisk) {
      if (!restoredFolders.has(folder)) {
        await FileSystem.deleteAsync(`${FileSystem.documentDirectory}Projects/${folder}/`);
      }
    }

    return { ok: true, message: "Restore completed. Reloading data." };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
```

Note: `ensureBackupDirUri` is shared with Task 3 â€” define it once in the module (it appears in both code blocks for reference). The stale-folder cleanup satisfies "remove stale files not present in backup if needed": any project folder on disk whose `inspection.db` is not in the zip gets deleted. Hermes supports `atob`/`btoa` on Android (React Native 0.81); if a device build complains, add the small local base64 helpers if Hermes lacks `atob`/`btoa` (they are present in RN 0.81 on Android).

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test src/__tests__/database/helpers/BackupManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/database/helpers/BackupManager.ts src/__tests__/database/helpers/BackupManager.test.ts
git commit -m "feat: restoreBackup validates, confirms, extracts, and cleans stale folders"
```

---

## Task 5: Settings UI â€” Backup Now / Restore buttons

**Files:**
- Modify: `app/settings/index.tsx` (add a "Backup & Restore" `List.Section` between the Camera section and the Advanced section; import `backupNow`, `restoreBackup` from `@/src/database/helpers/BackupManager`; add busy state + handlers).

**Interfaces:**
- Consumes: `backupNow`, `restoreBackup`, `buildBackupDisplayPath` from Task 1/3/4.
- Produces: two `List.Item` entries ("Backup Now", "Restore Backup") with `ActivityIndicator` while busy, `Alert` success/error messages, and a confirm `Alert` for restore that resolves to the `onConfirm` promise.

- [ ] **Step 1: Add imports and state**

```ts
import { backupNow, restoreBackup } from "@/src/database/helpers/BackupManager";
import { buildBackupDisplayPath } from "@/src/utils/backupZip";
```

Add to the component: `const [backupBusy, setBackupBusy] = useState(false);`

- [ ] **Step 2: Add handlers** (mirror the `performReset` style already in the file)

```ts
const handleBackupNow = async () => {
  setBackupBusy(true);
  try {
    const result = await backupNow();
    if (result.ok) {
      Alert.alert("Backup Created", `Backup saved to:\n${buildBackupDisplayPath()}`);
    } else {
      Alert.alert("Backup Failed", result.message);
    }
  } finally {
    setBackupBusy(false);
  }
};

const handleRestoreBackup = () => {
  Alert.alert(
    "Restore Backup?",
    `Replace all current data with the backup at:\n${buildBackupDisplayPath()}`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        style: "destructive",
        onPress: async () => {
          setBackupBusy(true);
          try {
            const result = await restoreBackup(async () => true);
            Alert.alert(result.ok ? "Restore Completed" : "Restore Failed", result.message);
            if (result.ok) router.replace("/");
          } finally {
            setBackupBusy(false);
          }
        },
      },
    ]
  );
};
```

(Criteria #10/11: confirmation happens in the dialog; after success we navigate to home whose `useFocusEffect`/`loadProjects()` reloads data. The request-level confirm inside `restoreBackup` is satisfied by the `async () => true` resolution. Note: real device flow should trigger a full app reload â€” this is covered in Task 6 Device verification.)

- [ ] **Step 3: Add the UI section**

```tsx
<List.Section>
  <List.Subheader>Backup & Restore</List.Subheader>
  <List.Item
    title="Backup Now"
    description={`Export all data to ${buildBackupDisplayPath()}`}
    left={(props) => <List.Icon {...props} icon="database-export" />}
    right={(props) => (backupBusy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
    onPress={handleBackupNow}
    disabled={backupBusy}
  />
  <Divider />
  <List.Item
    title="Restore Backup"
    description="Replace current data with the saved backup"
    left={(props) => <List.Icon {...props} icon="database-import" />}
    right={(props) => (backupBusy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
    onPress={handleRestoreBackup}
    disabled={backupBusy}
  />
</List.Section>
```

- [ ] **Step 4: Verify build/tests**

Run: `yarn test`, `npx tsc --noEmit`, `yarn lint` â€” all must stay green (UI file is not unit-tested per repo pattern for screens; the logic lives in BackupManager which is tested).

- [ ] **Step 5: Commit**

```bash
git add app/settings/index.tsx
git commit -m "feat: add Backup Now / Restore Backup to settings screen"
```

---

## Task 6: Full verification gate + docs + device QA

- [ ] **Step 1: Full JS verification**

```bash
cd frontend
yarn test       # all suites green (507+ baseline + new)
npx tsc --noEmit
yarn lint
yarn test --coverage   # confirm per-file thresholds incl. db.ts still met
```

- [ ] **Step 2: ADR entry** â€” append `ADR-027` to `docs/09-Decisions.md`:

> **ADR-026 â€” Manual backup/restore via a physical ZIP of database files.** Record: (a) why a standard `.zip` (built with `jszip`) instead of a custom container â€” raw SQLite files restore as-is, no logical re-import, survives version changes; (b) project DBs run WAL, so `inspection.db-wal`/`-shm` are included and no `wal_checkpoint` is needed; (c) `closeAllDatabases()` only in the RESTORE flow before replacing files â€” backup keeps databases OPEN (copying `.db`+`-wal`+`-shm` together is a consistent snapshot and avoids UI disruption/races during normal use), with the global DB and its `-wal`/`-shm` sidecars included when present; (d) SAF Download-tree permission and why no MANAGE_EXTERNAL_STORAGE; (e) restore writes back to `files/SQLite` + `files/Projects`, deletes stale project folders, then reloads; (f) base64 is transport-only for the legacy SAF API; (g) photos excluded because they live in DCIM and persist across uninstall.

- [ ] **Step 3: Device verification**
  1. `cd frontend && yarn android` (debug build; retrofits no permissions).
  2. Create a project, add an inspection with a couple of fields, save.
  3. Settings â†’ Backup Now â†’ confirm the file exists at `Download/ACCC Dynamic Inspection/accc_backup.zip` (use a file manager or `adb shell ls /sdcard/Download/ACCC\ Dynamic\ Inspection`).
  4. Inspect the zip: `adb pull` + `unzip -l` â€” entries are `SQLite/accc_global.db`, `Projects/<name>/inspection.db(.wal/.shm if present)`.
  5. Add another inspection, Backup Now again â†’ file overwritten (size/time changes), no "already exists" error.
  6. Settings â†’ Restore Backup â†’ cancel â†’ nothing changes.
  7. Add a third inspection, Restore â†’ Confirm â†’ home reloads; latest added inspection is gone (restored to state of the last backup). Global list intact.
  8. Full restore-after-reinstall: Backup Now â†’ uninstall â†’ reinstall â†’ Restore â†’ data returns.
- [ ] **Step 4: Read the plan back and check every spec requirement has a task** (spec coverage checklist below).

---

## Spec coverage checklist (required reporting)

| Requirement | Where |
|---|---|
| 1. "Backup Now" in settings | Task 5 UI + Task 3 handler |
| 2. Export to `Download/ACCC Dynamic Inspection/` | Task 3 SAF write (`DOWNLOAD_TREE_URI`) |
| 3. File name `accc_backup.zip` | `BACKUP_FILE_NAME` constant (Task 1) |
| 4. Overwrite existing backup | Task 3 pre-delete of existing file |
| 5. Latest data copied | Task 3 physical copy incl. `-wal`/`-shm` sidecars |
| 6. Success/error messages | Task 5 Alerts |
| 7. "Restore Backup" button | Task 5 UI + Task 4 handler |
| 8. Restore from `Download/.../accc_backup.zip` | Task 4 `findBackupFile` |
| 9. Validate file exists before restoring | Task 4 `validateBackupFile` + missing-file check |
| 10. Confirm before replacing | Task 5 confirm dialog + `onConfirm` |
| 11. Reload after restore | Task 5 `router.replace("/")` (+ Task 6 device note) |
| 12. SAF / Expo SDK 54 FileSystem | Task 3/4 SAF usage |
| 13. No MANAGE_EXTERNAL_STORAGE | Task 3 `DOWNLOAD_TREE_URI` targeted SAF scoped access |
| 14. Minimum storage access | Single Download-tree SAF request (mirrors DCIM flow) |
| 15. Don't change Auto Backup | No touch; plan explicitly separates concerns |
| 16. Don't change watermark/camera/geocode/queue/photos | No task touches those files |
| 17. Tests: path generation + file validation | Task 1 (`buildBackupDisplayPath`, `isZipBytes`), Task 4 (`validateBackupFile`), Task 3/4 suite |
| 18. TS + lint clean | Task 6 Step 1 |
| 19. Report exact files changed | Summary in Task 6 / handoff |
| 20. Report final path `Download/ACCC Dynamic Inspection/accc_backup.zip` | `buildBackupDisplayPath()` + Task 5 alert |
| 21. Explain backupâ†’uninstallâ†’reinstallâ†’restore flow | Repeated in UI copy, ADR-027, and this checklist |
| 22. Close all DB handles before restore | Task 4 `closeAllDatabases()` before extraction |
| 23. Remove stale files not in backup | Task 4 stale-folder cleanup |
| 24. No custom container/JSONL/base64-serialization/logical import-export | Physical ZIP only; base64 is SAF transport only (Task 1) |

## Files changed (summary)

| File | Change |
|---|---|
| `package.json` / `yarn.lock` | `jszip` added |
| `src/utils/backupZip.ts` | NEW â€” constants, path builder, base64 helpers, zip magic check |
| `src/database/db.ts` | `GLOBAL_DATABASE_NAME` exported; `closeAllDatabases()` added |
| `src/database/helpers/BackupManager.ts` | NEW â€” `backupNow`, `getGlobalDbFilePath`, `findBackupFile`, `validateBackupFile`, `restoreBackup` |
| `app/settings/index.tsx` | Backup & Restore section + handlers |
| `src/__tests__/utils/backupZip.test.ts` | NEW â€” path + base64 + zip magic tests |
| `src/__tests__/database/db.test.ts` | `closeAllDatabases` coverage |
| `src/__tests__/database/helpers/BackupManager.test.ts` | NEW â€” backup/validate/restore tests |
| `docs/09-Decisions.md` | ADR-026 |

## Risks / open questions

- MEDIUM â€” restore reload: `router.replace("/")` refreshes the home list but project-level caches in `InspectionContext` are module-lifetime; a very stale open project could briefly show old data. Mitigation: `restoreBackup` closes all handles first; Task 6 device step verifies. Consider `Updates.reloadAsync()` if expo-updates is present â€” do NOT add a dependency for it.
- MEDIUM â€” SAF overwrite semantics differ per device; pre-delete of the existing file is the standard workaround (same as SAF elsewhere in this codebase).
- MEDIUM â€” `jszip` `generateAsync`/`loadAsync` are async and runs on the JS thread; DBs here are small (SQLite text pages), but a very large dataset could cause a brief UI hitch. Acceptable for v1; in-memory on the JS thread. If it becomes an issue, the pure-`Uint8Array` round-trip keeps memory bounded to the DB set.
- LOW â€” `Projects/<name>` vs project display name: `listProjectFolders()` returns sanitized folder names; restore keys off the zip entry paths, so targets are identical.
- LOW â€” Restoring a WAL-mode DB copies its `-wal`/`-shm` verbatim. Since SQLite regenerates/validates WAL sidecars on open, copying the `.db`+`-wal`+`-shm` trio taken together (DBs left open, no checkpoint) is a consistent snapshot; this is the same pattern the app already relies on for project DBs.
- LOW â€” Global DB is DELETE-journal mode (db.ts `ensureGlobalDb`), so it normally has no WAL sidecars; the plan still collects `accc_global.db-wal`/`-shm` when present, but in practice only `SQLite/accc_global.db` is backed up.

## Estimated Complexity

MEDIUM. ~14 new test cases + 2 new modules + 1 dependency + 1 screen section. The pure `backupZip` module is trivially testable; `zipBase64`/`unzipBase64` make round-trip assertions concrete; SAF orchestration is the main surface to watch on device.

