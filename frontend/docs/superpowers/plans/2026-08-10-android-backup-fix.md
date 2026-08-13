# Android Auto Backup Fix Implementation Plan (Simplified)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android reinstall-restore behavior correct in ACCDIP with the smallest reliable solution — deleted projects must stay deleted after reinstall while saved projects still restore.

**Approach (minimal):** Keep Android Auto Backup enabled (`allowBackup="true"`), add explicit manifest backup-rules so `files/` (both `SQLite/` and `Projects/` trees) and preferences are always in the payload, and call `BackupManager.dataChanged()` **only after project/inspection delete operations** so the next backup pass snapshots the post-delete state. Save operations are left completely unchanged. No WAL checkpointing — keep it simple.

**Explicitly out of scope (removed from the earlier draft):**
- WAL checkpointing of project databases — removed.
- Backup notifications after saves / broad wiring into save paths — removed.
- Clone-success/post-delete-rollback signalling beyond the delete paths — removed (see Task 3: only delete orchestration gets the call).

**Tech Stack:** React Native 0.81.5 (New Architecture), Expo SDK 54, expo-sqlite 16 (DBs live under `files/SQLite/` on Android), Kotlin (native module), plain XML (backup rules), Jest 29.

## Global Constraints

- Keep `android:allowBackup="true"` — never disable Auto Backup globally.
- Do NOT change the package name (`com.accc.dynamicinspection`).
- Do NOT change SAF photo storage (DCIM) in any way.
- Signal backup only after deletes (per revised goal). Saves get no signal.
- Do NOT commit or push any changes (review-only deliverable).
- Respect the sequential open/close SQLite model — never call `getGlobalDatabase()` inside the inspection flow; the new wrapper never opens or switches DBs.
- All DB access stays in `src/database/repositories/` / `src/database/helpers/`; the UI never queries SQLite directly.
- Modified files must keep per-file Jest coverage thresholds (lines/statements/functions 80%, branches 70%).
- TypeScript strict; no comments unless requested.
- The `android/` directory is tracked (bare workflow) — native edits are permanent unless a future `expo prebuild` regenerates them.

## Facts established during research (do not re-derive)

1. expo-sqlite on Android stores ALL databases in `context.filesDir + "/SQLite"` → `files/SQLite/accc_global.db` (global DB). Source: `expo-sqlite` `SQLiteModule.kt` (`Constant("defaultDatabaseDirectory") { context.filesDir.canonicalPath + File.separator + "SQLite" }`).
2. Per-project DBs live at `files/Projects/<name>/inspection.db` (`ProjectDBManager.getProjectDbPath`, `FileSystem.documentDirectory` = `files/`).
3. Both trees sit under the app's `files/` directory → covered by Auto Backup by default; the explicit `<include domain="file" path="." />` rule makes it deterministic. SharedPreferences (`root/data/shared_prefs`) are backed up by default as well.
4. `android:allowBackup="true"` is already present in `android/app/src/main/AndroidManifest.xml` (application tag) — no `fullBackupContent`, `dataExtractionRules`, or `backupInForeground` attributes today.
5. `BackupManager.dataChanged()` (API 8+) notifies the system that data changed; the system schedules a backup "at an opportune time in the future"; repeated calls have no further effect until a backup actually occurs (≈ once per 24 h cadence, subject to device idle/charging/Wi-Fi conditions). **It is a request, not a guarantee.**
6. `android:backupInForeground="true"` (API 31+, ignored on older) allows the system to honor `dataChanged()` with a backup pass while the app is in the foreground. Kept — harmless and narrows the dirty window.
7. Delete orchestration points: `app/index.tsx` `handleDelete` (deleteProjectDb + ProjectRepository.deleteProject), `app/index.tsx` clone-rollback handler, `src/context/InspectionContext.tsx` `removeProject`, `InspectionRepository.deleteInspection` + `deleteMultipleInspections`. These are the ONLY call sites (deletes only).
8. Jest: `preset: "jest-expo"` runs default platform (non-Android) — the `Platform.OS !== "android"` guard makes the wrapper a no-op in existing tests, so untouched tests pass unchanged where not explicitly mocked.

---

## Task 1: Native manifest — keep Auto Backup on, add explicit rules

**Files:**
- Create: `frontend/android/app/src/main/res/xml/backup_rules.xml`
- Create: `frontend/android/app/src/main/res/xml/data_extraction_rules.xml`
- Modify: `frontend/android/app/src/main/AndroidManifest.xml` (application tag)
- Test: `frontend/src/__tests__/config/androidBackupManifest.test.ts` (added in Task 4)

**Interfaces:**
- Produces: manifest attributes consumed by the platform; rule files referenced by the manifest.

- [x] **Step 1: Create `backup_rules.xml`** (API ≤ 30 full-backup rules)

```xml
<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <!-- Include everything under files/ (SQLite/ + Projects/) plus preferences. -->
    <include domain="file" path="." />
    <include domain="sharedpref" path="." />
</full-backup-content>
```

- [x] **Step 2: Create `data_extraction_rules.xml`** (API 31+ rules — cloud backup AND device-to-device transfer)

```xml
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <include domain="file" path="." />
        <include domain="sharedpref" path="." />
    </cloud-backup>
    <device-transfer>
        <include domain="file" path="." />
        <include domain="sharedpref" path="." />
    </device-transfer>
</data-extraction-rules>
```

- [x] **Step 3: Edit `AndroidManifest.xml`** — on the existing `<application>` element (which already has `android:allowBackup="true"`), add three attributes:

```xml
<application
    android:name=".MainApplication"
    android:label="@string/app_name"
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:allowBackup="true"
    android:fullBackupContent="@xml/backup_rules"
    android:dataExtractionRules="@xml/data_extraction_rules"
    android:backupInForeground="true"
    android:theme="@style/AppTheme"
    android:supportsRtl="true"
    android:enableOnBackInvokedCallback="false"
    android:requestLegacyExternalStorage="true">
```

- [x] **Step 4: Sanity check** — `android:dataExtractionRules` is API 31+ and `android:backupInForeground` is API 31+; older OS versions ignore unknown attributes, so conditionally setting them is safe and standard. `allowBackup` stays `true`: backup is NOT disabled globally. Package name untouched. SAF/DCIM untouched.
- [x] **DO NOT commit** (per instructions). Open a review diff instead.

---

## Task 2: Native module — `BackupManager.dataChanged()` exposed to JS

**Files:**
- Create: `frontend/android/app/src/main/java/com/accc/dynamicinspection/AndroidBackupModule.kt`
- Create: `frontend/android/app/src/main/java/com/accc/dynamicinspection/AndroidBackupPackage.kt`
- Modify: `frontend/android/app/src/main/java/com/accc/dynamicinspection/MainApplication.kt`
- Verify: device QA in Task 5 (cannot be unit-tested in Jest)

**Interfaces:**
- Produces: `NativeModules.AndroidBackup.requestBackup()` (JS name `"AndroidBackup"`).

- [x] **Step 1: Create `AndroidBackupModule.kt`**

```kotlin
package com.accc.dynamicinspection

import android.app.backup.BackupManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AndroidBackupModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AndroidBackup"

  @ReactMethod
  fun requestBackup() {
    try {
      // BackupManager has no static getInstance — use the Context constructor.
      BackupManager(reactApplicationContext).dataChanged()
    } catch (ignored: Throwable) {
      // Signalling backup is best-effort; never crash the app.
    }
  }
}
```

- [x] **Step 2: Create `AndroidBackupPackage.kt`**

```kotlin
package com.accc.dynamicinspection

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AndroidBackupPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ): List<NativeModule> = listOf(AndroidBackupModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
```

- [x] **Step 3: Register in `MainApplication.kt`** — inside `getPackages()` (existing `PackageList(this).packages.apply { ... }` block):

```kotlin
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
      add(AndroidBackupPackage())
    }
```

- [x] **Step 4: Build check** — `./gradlew :app:assembleDebug` from `frontend/android` compiles with the new package registered. ✅ PASS (`:app:compileDebugKotlin` then `:app:assembleDebug` both BUILD SUCCESSFUL). Note: the plan's original `BackupManager.getInstance()` was a compile error (no such static method) — fixed to the `BackupManager(context)` constructor before the build.
- [x] **DO NOT commit.**

---

## Task 3: JS wrapper + wire into DELETE paths only

**Files:**
- Create: `frontend/src/utils/androidBackup.ts`
- Test: `frontend/src/__tests__/utils/androidBackup.test.ts` (same task)
- Modify: `frontend/src/database/repositories/InspectionRepository.ts` (`deleteInspection`, `deleteMultipleInspections`)
- Modify: `frontend/app/index.tsx` (`handleDelete`, clone-rollback handler)
- Modify: `frontend/src/context/InspectionContext.tsx` (`removeProject`)
- Test: existing `InspectionRepository` suites (`src/__tests__/database/repositories/InspectionRepository.test.ts` and `src/__tests__/repositories/InspectionRepository.test.ts` as applicable)

**Interfaces:**
- Consumes: `NativeModules.AndroidBackup` (Task 2).
- Produces: `requestAndroidBackup(): void` — Android-only, safe no-op elsewhere, never throws. **No checkpoint function** — removed by design.

- [x] **Step 1: Write the failing test** — `frontend/src/__tests__/utils/androidBackup.test.ts`

```ts
import { NativeModules, Platform } from "react-native";
import { requestAndroidBackup } from "@/src/utils/androidBackup";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("requestAndroidBackup", () => {
  it("is a no-op on non-Android platforms", () => {
    expect(() => requestAndroidBackup()).not.toThrow();
  });

  it("calls the native module on Android", () => {
    const requestBackup = jest.fn();
    (NativeModules as any).AndroidBackup = { requestBackup };
    jest.replaceProperty(Platform, "OS", "android");
    requestAndroidBackup();
    expect(requestBackup).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the native module is missing", () => {
    delete (NativeModules as any).AndroidBackup;
    jest.replaceProperty(Platform, "OS", "android");
    expect(() => requestAndroidBackup()).not.toThrow();
  });

  it("swallows native throws", () => {
    (NativeModules as any).AndroidBackup = {
      requestBackup: jest.fn(() => {
        throw new Error("boom");
      }),
    };
    jest.replaceProperty(Platform, "OS", "android");
    expect(() => requestAndroidBackup()).not.toThrow();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `yarn test src/__tests__/utils/androidBackup.test.ts`
Expected: FAIL — "Cannot find module '@/src/utils/androidBackup'".

- [x] **Step 3: Implement the wrapper** — `frontend/src/utils/androidBackup.ts`

```ts
import { NativeModules, Platform } from "react-native";
import { logger } from "@/src/utils/logger";

export function requestAndroidBackup(): void {
  if (Platform.OS !== "android") return;
  const module = NativeModules.AndroidBackup;
  if (!module?.requestBackup) {
    logger.warn("[androidBackup] AndroidBackup native module not available — skipping");
    return;
  }
  try {
    module.requestBackup();
  } catch (e) {
    logger.warn("[androidBackup] requestBackup() call failed:", e);
  }
}
```

- [x] **Step 4: Run it to verify it passes**

Run: `yarn test src/__tests__/utils/androidBackup.test.ts`
Expected: PASS.

- [x] **Step 5: `InspectionRepository.deleteInspection`** — after the transaction and `InspectionDataBus.emitInspectionsChanged(projectId)`, add a `requestAndroidBackup();` call:

```ts
  await db.withTransactionAsync(async () => {
    await deleteInspectionData(db, inspectionId);
  });

  InspectionDataBus.emitInspectionsChanged(projectId);

  requestAndroidBackup();
```

- [x] **Step 6: `InspectionRepository.deleteMultipleInspections`** — after the loop and the emit:

```ts
  await db.withTransactionAsync(async () => {
    for (const id of inspectionIds) {
      await deleteInspectionData(db, id);
    }
  });

  InspectionDataBus.emitInspectionsChanged(projectId);

  requestAndroidBackup();
```

- [x] **Step 7: `app/index.tsx` `handleDelete`** — after both existing calls succeed, add `requestAndroidBackup();`:

```ts
await deleteProjectDb(selectedProject.DBPath);
await ProjectRepository.deleteProject(selectedProject.ProjectID);
requestAndroidBackup();
```

(Add the same call after the clone-rollback path only: after `deleteProjectDb` + `ProjectRepository.deleteProject` of the half-created project. The clone **success** path and project/inspection **save** paths get NO call — out of scope.)

- [x] **Step 8: `src/context/InspectionContext.tsx` `removeProject`** — after `await deleteProjectDb(p.DBPath);`, add `requestAndroidBackup();`.

- [x] **Step 9: Add regression assertions in the `InspectionRepository` test suite(s) that exercise deletes** — add at the top of the relevant test file:

```ts
jest.mock("@/src/utils/androidBackup", () => ({
  requestAndroidBackup: jest.fn(),
}));

import { requestAndroidBackup } from "@/src/utils/androidBackup";
```

then inside the delete test(s):

```ts
it("signals Android for a fresh backup after deleting inspections", async () => {
  // ... existing set-up that deletes one/multiple inspections ...
  expect(requestAndroidBackup).toHaveBeenCalled();
});
```

- [x] **Step 10: Run full suite** — `yarn test` must stay green (507+ tests). The wrapper is a no-op under jest-expo's default non-Android platform, so untouched tests pass unchanged; the mock above also neutralizes the DB-layer call sites.
- [x] **DO NOT commit.**

---

## Task 4: Config sanity tests (guard the native backup config)

**Files:**
- Create: `frontend/src/__tests__/config/androidBackupManifest.test.ts`

- [x] **Step 1: Write the test** — reads the tracked native files and asserts the backup contract:

```ts
import fs from "fs";
import path from "path";

const MANIFEST = path.join(
  __dirname,
  "../../../android/app/src/main/AndroidManifest.xml"
);
const BACKUP_RULES = path.join(
  __dirname,
  "../../../android/app/src/main/res/xml/backup_rules.xml"
);
const DATA_EXTRACTION_RULES = path.join(
  __dirname,
  "../../../android/app/src/main/res/xml/data_extraction_rules.xml"
);

describe("Android backup configuration", () => {
  it("keeps Auto Backup enabled (never disabled globally)", () => {
    const xml = fs.readFileSync(MANIFEST, "utf8");
    expect(xml).toContain('android:allowBackup="true"');
  });

  it("points at explicit backup rules", () => {
    const xml = fs.readFileSync(MANIFEST, "utf8");
    expect(xml).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(xml).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
  });

  it("allows foreground backup so dataChanged() is honored promptly", () => {
    const xml = fs.readFileSync(MANIFEST, "utf8");
    expect(xml).toContain('android:backupInForeground="true"');
  });

  it("includes the file and sharedpref domains in every rule file", () => {
    const br = fs.readFileSync(BACKUP_RULES, "utf8");
    expect(br).toContain('<include domain="file" path="." />');
    expect(br).toContain('<include domain="sharedpref" path="." />');
    const dex = fs.readFileSync(DATA_EXTRACTION_RULES, "utf8");
    expect(dex).toContain('<include domain="file" path="." />');
    expect(dex).toContain('<include domain="sharedpref" path="." />');
  });
});
```

- [x] **Step 2: Run** — `yarn test src/__tests__/config/androidBackupManifest.test.ts` → PASS. ✅
- [x] **DO NOT commit.**

---

## Task 5: Full verification gate

- [x] Run: `yarn test` (all suites, ≥507 tests) — PASS. ✅ 69 suites, 790 passed / 1 skipped.
- [x] Run: `npx tsc --noEmit` — PASS (strict mode). ✅ clean.
- [x] Run: `yarn lint` — PASS. ✅ 0 errors (467 pre-existing warnings; none from new files).
- [x] Run: `yarn test --coverage` — confirm modified files still meet per-file thresholds (80/80/80/70). ✅ `androidBackup.ts` 100%, `InspectionRepository.ts` 96.66%, `InspectionContext.tsx` 100%.
- [x] Gradle build — `:app:compileDebugKotlin` and `:app:assembleDebug` both BUILD SUCCESSFUL. ✅

---

## Task 6: Device verification (bmgr) + flow documentation

- [ ] **Step 1: Build & install a debug build** on an emulator/device with Play services:
  `cd frontend && yarn android` (or use EAS build / existing release APK for a faithful test).
- [ ] **Step 2: Enable backup on the test device/emulator:**
  `adb shell bmgr enable true`
- [ ] **Step 3: Scenario A — save → reinstall → restored:**
  1. Create a project, open it, capture 1+ photos, save the inspection.
  2. `adb shell bmgr backupnow com.accc.dynamicinspection` (deterministic backup of the current state; on API 31+ run as debuggable build or `adb root`).
  3. `adb uninstall com.accc.dynamicinspection` (OS retains the backup for ~60 days).
  4. `adb install <apk>`; `adb shell bmgr restore com.accc.dynamicinspection`; launch app.
  5. Expected: the project appears in the home list with its inspections; DBs restored under `files/SQLite` + `files/Projects`.
- [ ] **Step 4: Scenario B — delete → reinstall → NOT restored:**
  1. Create a project; **delete it from inside the app** (this calls `dataChanged()`).
  2. `adb shell bmgr backupnow com.accc.dynamicinspection` — this uploads the post-delete state, replacing the stale cloud copy (this is the core fix).
  3. `adb uninstall com.accc.dynamicinspection` → reinstall → launch.
  4. Expected: the deleted project does NOT reappear.
  5. Negative check: verify `files/SQLite/accc_global.db` restored without the row and `files/Projects/<name>` absent.
- [ ] **Step 5: Document the behavior** — add a short entry to `frontend/docs/09-Decisions.md` (ADR pattern used by the repo), title: *"ADR-0XX: Android backup signalling via BackupManager.dataChanged()"*, recording: DB locations, the include rules, the dataChanged contract, and the platform caveat below.

---

## How the new flow works (requirement 9)

- **save → reinstall → restored**
  1. Saving writes to `files/SQLite/accc_global.db` (project row) and `files/Projects/<name>/inspection.db` (project data). No in-app signal is needed — the existing Auto Backup schedule already uploads these trees (now explicitly included).
  2. On reinstall, the OS restores the last uploaded backup → first launch shows the project intact.
- **delete → reinstall → NOT restored**
  1. Deleting a project removes the global DB row and the `files/Projects/<name>` folder; deleting an inspection removes its rows.
  2. The app calls `dataChanged()` **after** the deletion completes → the next backup snapshots the post-delete state and overwrites the stale cloud copy that still contained the deleted project.
  3. Reinstall restores the *newer* snapshot → the deleted project is gone and does not reappear.
- **Platform caveat (documented, not worked around):** `dataChanged()` is a request — the OS decides when the upload runs (device idle/charging/Wi-Fi; ≈ 24 h cadence; foreground pass allowed by `backupInForeground`). If a user deletes data and uninstalls *before any backup pass runs after the delete*, the previous cloud copy may still restore. No in-app API can force an immediate upload; `bmgr backupnow` makes QA deterministic.

## Files changed (requirement 10 — summary)

| File | Change |
|---|---|
| `android/app/src/main/AndroidManifest.xml` | +3 app attributes (fullBackupContent, dataExtractionRules, backupInForeground); allowBackup stays true |
| `android/app/src/main/res/xml/backup_rules.xml` | NEW — explicit include of `file` + `sharedpref` domains |
| `android/app/src/main/res/xml/data_extraction_rules.xml` | NEW — cloud-backup + device-transfer includes |
| `android/app/src/main/java/com/accc/dynamicinspection/AndroidBackupModule.kt` | NEW — `BackupManager.dataChanged()` |
| `android/app/src/main/java/com/accc/dynamicinspection/AndroidBackupPackage.kt` | NEW — module registration |
| `android/app/src/main/java/com/accc/dynamicinspection/MainApplication.kt` | register `AndroidBackupPackage()` |
| `src/utils/androidBackup.ts` | NEW — `requestAndroidBackup()` only |
| `src/database/repositories/InspectionRepository.ts` | signal in both delete methods (after transaction + emit) |
| `app/index.tsx` | signal in handleDelete + clone-rollback (delete path only) |
| `src/context/InspectionContext.tsx` | signal in removeProject |
| `src/__tests__/utils/androidBackup.test.ts` | NEW — wrapper tests |
| `src/__tests__/config/androidBackupManifest.test.ts` | NEW — manifest/rules contract tests |
| `src/__tests__/database/repositories/InspectionRepository.test.ts` (+ `src/__tests__/repositories/InspectionRepository.test.ts` if it exercises deletes) | mock util + assert signal after delete |
| `docs/09-Decisions.md` | ADR entry (documentation) |

**Removed from the earlier draft** (per the revised minimal scope): `checkpointProjectDb` + WAL checkpointing; save-path signals in `app/projects/new.tsx`, `app/inspection/new.tsx`, and the clone-success path.