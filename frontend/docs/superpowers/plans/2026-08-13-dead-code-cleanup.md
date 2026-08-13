# Dead Code & Orphan Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified dead code, orphan files, unused exports, duplicate test suites, one unused dependency, and stale boilerplate from the ACCC frontend — grouped by risk tier, with exact files and verification gates.

**Architecture:** Analysis was completed with scripted import-graph resolution (`@/` alias + relative + barrel re-exports) over all `src/`/`app/` files, cross-checked with targeted greps and a `tsc --noEmit` baseline (currently **exit 0 — clean**). All removals below were individually verified: a file/export is listed only if zero prod references exist and the only coupling is to other members of the same removal set, or to tests that are removed/refactored alongside.

**Tech Stack:** TypeScript strict, Expo 54 / expo-router 6, Jest 29 (507 tests / 41 suites, per-file 80% coverage thresholds in `jest.config.js`), Yarn 1.22.

## Global Constraints

- **Never remove framework peer deps**: `react-native-gesture-handler`, `react-native-reanimated`, `react-native-screens`, `react-native-worklets`, `@expo/metro-runtime`, `react-dom`, `react-native-web`, `expo-linking`, `expo-system-ui` are required by expo-router / react-navigation / react-native-paper / web output. Removing them breaks native builds.
- **Never violate `jest.config.js` coverage thresholds** (80% lines/statements/functions, 70% branches on ~22 named files). When removing a dead export, its test blocks must be removed with it. Removing tested code only helps coverage; removing tests of *kept* code breaks it.
- **Isolation regression tests are mandatory** (AGENTS.md). `src/__tests__/database/isolation.test.ts` must stay green; `SectionRepository` removal requires refactoring that test, not deleting it.
- **Sequential open/close SQLite model**: do not add any DB calls that switch databases mid-flow. All edits here are deletions; no DB code changes.
- **WIP checkpoint first**: the working tree currently has uncommitted modifications (capture flow, PhotoStatesContext, watermark processor, perf). Commit or stash before Phase 1 so each removal is independently revertible.
- Every phase ends with: `npx tsc --noEmit` (exit 0) and the affected Jest suite green.

---

## Verified Findings Inventory

### Tier 1 — LOW RISK (pure dead code, zero prod refs, zero test coupling)

| # | File(s) | Lines | Evidence |
|---|---------|-------|----------|
| L1 | `src/components/inspection/CameraSection.tsx` | 387 | Old in-section camera editor UI. Superseded by `/inspection/capture` route + `WatermarkMergeWebView`. Zero importers (prod + tests). |
| L2 | `src/components/inspection/CameraSection.styles.ts` | 76 | Imported only by CameraSection.tsx (line 19). |
| L3 | `src/database/repositories/CameraRepository.ts` | 235 | Imported only by CameraSection.tsx (lines 21, 113, 159, 174). |
| L4 | `src/models/Camera.ts` | 29 | Imported only by CameraSection.tsx + CameraRepository.ts. |
| L5 | `src/database/constants/database.ts` | 3 | Zero importers. **Stale**: claims `accc_pole_inspection.db`; real global DB is `accc_global.db` (see `src/database/db.ts`). |
| L6 | `src/models/Switch.ts` | 25 | Zero importers. Switch data flows through dynamic device-records/device-options; `switches.table.ts` (schema) stays. |
| L7 | `src/utils/geo.ts` → remove `RAJASTHAN_DIVISIONS` export | ~35 | Zero references anywhere. Duplicate data — `src/database/seeds/division.seed.ts` has its own inline copy. |
| L8 | `scripts/reset-project.js` + `"reset-project"` entry in `package.json` | ~300 | Expo template scaffold, not used by dev workflow. *Optional.* |

L1–L4 form a single self-contained dead cluster: each file is referenced only by another member. `cameras.table.ts` and `DeviceOptionsRepository` stay (used by schema + DeviceSection).

### Tier 2 — MEDIUM RISK (dead in prod, but test/coverage coupling)

| # | File(s) | Evidence |
|---|---------|----------|
| M1 | `src/database/schema.ts` → remove `createSchema` (line 375) | Legacy dispatcher; prod calls `createGlobalSchema`/`createProjectSchema` directly. Remove describe block `schema.ts createSchema` in `src/__tests__/database/schema.test.ts` (~line 88). |
| M2 | `src/database/db.ts` → remove `getActiveProjectPath` (line 117) | Test-only. Remove its test in `src/__tests__/database/db.test.ts` (lines 90–95). |
| M3 | `src/database/helpers/ProjectDBManager.ts` → remove `deleteProjectFolder` (line 284) and `getProjectFolderPath` (line 68) | No prod caller (project-delete flow does not exist). `getProjectFolderPath` is used only by `deleteProjectFolder` internally + test. Remove both describes in `src/__tests__/database/helpers/ProjectDBManager.test.ts` (lines 65, 118). |
| M4 | `src/utils/exportData.ts` → remove `exportInspection` (line 485) | Superseded by `exportInspections` (used by `app/reports/index.tsx`). Remove `describe("exportInspection")` in `src/__tests__/utils/exportData.test.ts` (~line 710). |
| M5 | `src/utils/templateData.ts` → remove `exportDefaultTemplate` (line 101) and `importTemplate` (line 581) | Superseded by `applyTemplateImport`/`buildTemplateExport` pipeline used by `useTemplateFlow` + settings screens. Remove both describes in `src/__tests__/utils/templateData.test.ts` (lines 75, 117). |
| M6 | `src/database/repositories/SectionRepository.ts` (174 lines) | Imported only by `src/__tests__/database/isolation.test.ts` (line 181). Refactor the test to insert the probe row via the raw handle it already holds: `await dbA.runAsync("INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder) VALUES (?, ?, ?, ?)", ...)` — preserves the isolation regression without the repo. |
| M7 | Duplicate test suites (consolidate): `useWatermarkProcessor.test.tsx` — `src/__tests__/hooks/` (1088 lines) is the comprehensive suite; `src/__tests__/components/inspection/` (125 lines) is a partial duplicate. `InspectionRepository.test.ts` — `src/__tests__/repositories/` (104 lines, bus-emission coverage) vs `src/__tests__/database/repositories/` (336 lines, CRUD): merge the small into the large. Same for `InspectionListRepository.test.ts` (65 vs 49 lines). | Before deleting the 125-line watermark suite, diff its assertions against the 1088-line suite and port any unique case. |
| M8 | Remove `expo-image` (~3.0.11) via `yarn remove expo-image` | Zero imports in code or app.json plugins. Run `npx expo-doctor` after. |

### Tier 3 — HIGH RISK / NOT RECOMMENDED (require explicit user approval)

| # | Item | Why it's risky |
|---|------|----------------|
| H1 | Remove `expo-linking` direct dep | expo-router peer for deep linking / `scheme: "frontend"` in app.json. Removing the direct entry risks expo-doctor warnings; it remains transitively. Low value — default is **keep**. |
| H2 | Remove `expo-system-ui` direct dep | Implements `userInterfaceStyle` config; peer of expo SDK. Default is **keep**. |
| H3 | Remove `app/+html.tsx` | Only affects web output (`expo start --web`). The app is Android-targeted; dropping web support entirely is a **product decision**, not cleanup. Default is **keep**. |
| H4 | Remove `react-native-web` / `react-dom` / `@expo/metro-runtime` / `react-native-gesture-handler` / `react-native-reanimated` / `react-native-screens` / `react-native-worklets` | Required Android/web peers of the navigation + paper + camera stack. **Never remove.** |

### Verified NOT dead (do NOT touch)
`DatabaseService.ts` (barrel re-export via `src/database/index.ts` → `app/_layout.tsx` init), all `src/database/tables/*` (imported by schema.ts), all `src/database/seeds/*` (imported by seed.ts), watermark quartet (`watermarkSettings`/`watermarkStyle`/`watermarkLayout`/`watermarkHtml` — live in context/capture/settings/merge pipeline), `geo.ts` functions (camera hooks), `location.ts` (GeneralInformation), `backupZip.ts`/`androidBackup.ts`/`BackupManager.ts` (complementary SAF/zip stack), `folderNaming.ts`/`folderManager.ts`, `use-icon-fonts.ts` (`_layout.tsx`), `photoUtils.ts`, `cameraControls.ts`/`expectedPhotoSize.ts`/`useGpsTracker.ts`/`useAddressLookup.ts` (capture.tsx), `PhotoSection`/`PhotoCard`/`PhotoPreviewModal`/`PhotoSectionHeader` (live chain via SectionRenderer), `assets/images/abhay-logo.png` (icon/adaptiveIcon/splash/favicon in app.json), all `app/` routes (reachable; `+html.tsx` and `_layout.tsx` are auto-loaded by expo-router), `react-test-renderer` (6 suites), `@types/jest` (test typings), `eslint`/`eslint-config-expo` (eslint.config.js), `eas-cli`/`expo-doctor` (dev/CI tooling).

---

## Implementation Phases

### Phase 1: LOW-RISK pure deletions (L1–L7)

- [ ] **Step 1.1**: Checkpoint WIP — commit or stash the current uncommitted changes so every removal below is independently revertible.
- [ ] **Step 1.2**: Delete the camera dead cluster:
  - `git rm src/components/inspection/CameraSection.tsx src/components/inspection/CameraSection.styles.ts src/database/repositories/CameraRepository.ts src/models/Camera.ts`
- [ ] **Step 1.3**: Delete `src/database/constants/database.ts` and `src/models/Switch.ts`.
- [ ] **Step 1.4**: In `src/utils/geo.ts`, delete the `RAJASTHAN_DIVISIONS` export (line ~50, ~35 lines).
- [ ] **Step 1.5**: Verify:
  - `npx tsc --noEmit` → exit 0
  - `yarn test` → all 41 suites still pass, count 507 tests
  - `rg "CameraSection|CameraRepository|models/Camera|RAJASTHAN_DIVISIONS" src app` → no matches
- [ ] **Step 1.6**: Commit `chore: remove dead CameraSection cluster, stale constants, orphan Switch model`.

### Phase 2: MEDIUM-RISK dead exports + co-removed test blocks (M1–M5)

Do one export at a time; after each, run its focused suite.

- [ ] **Step 2.1**: `schema.ts` — remove `createSchema` (line 375); in `src/__tests__/database/schema.test.ts` remove the `describe("schema.ts createSchema", ...)` block (~line 88). Run `yarn test src/__tests__/database/schema.test.ts`.
- [ ] **Step 2.2**: `db.ts` — remove `getActiveProjectPath` (line 117); in `src/__tests__/database/db.test.ts` remove the `getActiveProjectPath returns the current project path` test (lines ~90–95). Run `yarn test src/__tests__/database/db.test.ts`.
- [ ] **Step 2.3**: `ProjectDBManager.ts` — remove `deleteProjectFolder` (line 284) and `getProjectFolderPath` (line 68); in `src/__tests__/database/helpers/ProjectDBManager.test.ts` remove the `getProjectFolderPath` and `deleteProjectFolder` describes (lines ~65, ~118). Run `yarn test src/__tests__/database/helpers/ProjectDBManager.test.ts`.
- [ ] **Step 2.4**: `exportData.ts` — remove `exportInspection` (line 485); in `src/__tests__/utils/exportData.test.ts` remove `describe("exportInspection", ...)` (~line 710). Run `yarn test src/__tests__/utils/exportData.test.ts`.
- [ ] **Step 2.5**: `templateData.ts` — remove `exportDefaultTemplate` (line 101) and `importTemplate` (line 581); in `src/__tests__/utils/templateData.test.ts` remove the `exportDefaultTemplate` and `importTemplate` describes (lines ~75, ~117). Run `yarn test src/__tests__/utils/templateData.test.ts`.
- [ ] **Step 2.6**: Coverage gate — `yarn test --coverage` and confirm no threshold violations (all files in `jest.config.js` `coverageThreshold` ≥ 80/70). Removing tested code only helps; removing tests of kept code breaks it — do not remove any test block whose source still exists.
- [ ] **Step 2.7**: Commit per export (or one commit after 2.6): `chore: remove dead exports (createSchema, getActiveProjectPath, deleteProjectFolder, exportInspection, importTemplate)`.

### Phase 3: MEDIUM-RISK SectionRepository removal (M6)

- [ ] **Step 3.1**: Edit `src/__tests__/database/isolation.test.ts` (~line 181): replace the `SectionRepository.create({...})` call with the raw handle already in scope:
  ```ts
  await dbA.runAsync(
    "INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder) VALUES (?, ?, ?, ?)",
    templateA!.TemplateID, "Leak Probe Section", "leak_probe_section", 999
  );
  ```
  Keep every assertion identical (leak probe present in A, absent in B, still absent after reopening A).
- [ ] **Step 3.2**: `git rm src/database/repositories/SectionRepository.ts`.
- [ ] **Step 3.3**: Verify `yarn test src/__tests__/database/isolation.test.ts` → green (this is the mandated isolation regression guard).
- [ ] **Step 3.4**: Commit `chore: remove dead SectionRepository; isolation test uses raw insert`.

### Phase 4: MEDIUM-RISK duplicate test-suite consolidation (M7) — optional

- [ ] **Step 4.1**: Diff `src/__tests__/hooks/useWatermarkProcessor.test.tsx` (1088 lines) against `src/__tests__/components/inspection/useWatermarkProcessor.test.tsx` (125 lines). Port any assertion unique to the small suite into the large one, then delete the small file. **Caveat:** both files are modified in the current WIP — confirm with the user which is canonical before deleting.
- [ ] **Step 4.2**: Merge the bus-emission describes from `src/__tests__/repositories/InspectionRepository.test.ts` (104 lines) into `src/__tests__/database/repositories/InspectionRepository.test.ts` (336 lines); delete the small file. Same for `InspectionListRepository.test.ts` (65 → 49).
- [ ] **Step 4.3**: Verify full suite: `yarn test` → 507 tests (minus any tests ported out of existence), coverage thresholds hold.
- [ ] **Step 4.4**: Commit `test: consolidate duplicate repository/hook test suites`.

### Phase 5: MEDIUM-RISK dependency + boilerplate cleanup (M8, L8)

- [ ] **Step 5.1**: `yarn remove expo-image` (verified: zero imports in code/app.json). Run `yarn install` clean.
- [ ] **Step 5.2**: Verify `npx expo-doctor` → no errors introduced.
- [ ] **Step 5.3** (optional): Delete `scripts/reset-project.js` and remove the `"reset-project"` line from `package.json` scripts.
- [ ] **Step 5.4**: Commit `chore: drop unused expo-image dependency (and reset-project boilerplate)`.

### Phase 6: Final verification sweep

- [ ] **Step 6.1**: `npx tsc --noEmit` → exit 0.
- [ ] **Step 6.2**: `yarn test` → full suite green; `yarn test --coverage` → no threshold violations.
- [ ] **Step 6.3**: `yarn lint` → clean.
- [ ] **Step 6.4**: Reference sweep (should all be empty):
  `rg "CameraSection|CameraRepository|SectionRepository|SwitchType|createSchema|getActiveProjectPath|deleteProjectFolder|getProjectFolderPath|exportInspection|exportDefaultTemplate|importTemplate|RAJASTHAN_DIVISIONS|accc_pole_inspection" src app` — except legitimate hits (`SwitchType` in seeds/services is dynamic device data, not the model).
- [ ] **Step 6.5**: Delete the analysis scratch dir: `Remove-Item -Recurse .scratch`.
- [ ] **Step 6.6**: Update `docs/` changelog with the removal summary (per repo convention).

---

## Verification Gates (used after every phase)

| Gate | Command | Expected |
|------|---------|----------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `yarn test <affected suite>` / `yarn test` | green; count drops only where tests were deliberately removed |
| Coverage | `yarn test --coverage` | no `coverageThreshold` violations |
| Lint | `yarn lint` | clean |
| Dep health | `npx expo-doctor` | no errors (after Phase 5) |
| Dead refs | `rg` sweep | zero matches for removed symbols |

## Dependencies

- No external services. Requires `yarn` (1.22, pinned), `node` for tsc/jest.
- Baseline state: `tsc` exit 0, 507 tests / 41 suites, coverage thresholds per `jest.config.js` — confirmed before starting.

## Risks

- **HIGH — Coverage thresholds**: `templateData.ts`, `exportData.ts`, `schema.ts`, `db.ts`, `ProjectDBManager.ts`, `DatabaseService.ts` each have an 80% floor. Mitigation: remove test blocks only for removed code; run `yarn test --coverage` after Phase 2.
- **HIGH — Isolation regression mandate (AGENTS.md)**: `isolation.test.ts` must stay green after `SectionRepository` is gone. Mitigation: raw-SQL refactor in Phase 3, verified by running the isolation suite explicitly.
- **MEDIUM — Framework peer deps**: removing `react-native-screens`/`reanimated`/`gesture-handler`/`worklets`/`expo-linking` breaks native builds or expo-doctor. Mitigation: they are excluded from all phases; only `expo-image` is removed.
- **MEDIUM — In-flight WIP**: the tree has uncommitted changes (capture flow, PhotoStatesContext, watermark processor, perf). Phase 3/4 deletions touch areas those changes touch (`useWatermarkProcessor` tests). Mitigation: checkpoint WIP first; confirm canonical test suite with the user before deleting the 125-line watermark suite.
- **LOW — `SwitchType` grep noise**: string matches in seeds/services are dynamic device-field data, not the dead model. Mitigation: reviewed in Step 6.4, not removed.

## Estimated Impact

- **Source deleted**: ~1,100 lines across 11 files (L1–L7, M1–M5, M6).
- **Tests deleted/merged**: ~300 lines (dead-export test blocks + 3 duplicate-suite consolidations).
- **Dependencies**: 1 removed (`expo-image`), 0 added.
- **Assets**: none removed (`abhay-logo.png` is live in app.json).
- **Estimated complexity**: LOW–MEDIUM. ~0.5–1.5 days including verification gates.

## Success Criteria

- [ ] `npx tsc --noEmit` exit 0
- [ ] `yarn test` full pass; test count drops only by deliberately-removed blocks
- [ ] `yarn test --coverage` no threshold violations
- [ ] `yarn lint` clean
- [ ] `npx expo-doctor` clean after dependency changes
- [ ] `rg` sweep shows zero references to removed symbols/files
- [ ] `isolation.test.ts` green with `SectionRepository` deleted
- [ ] `.scratch/` deleted; changelog updated
