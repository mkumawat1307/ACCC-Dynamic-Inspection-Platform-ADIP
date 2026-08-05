# Pole ID → Site ID — Design

**Date:** 2026-08-05
**Status:** Draft (pending user review)
**Type:** Cross-cutting data-model rename (terminology + DB column + config keys + UI)

## Goal

Replace the `Pole` terminology throughout the ADIP codebase and database with `Site`, as a
single consistent vocabulary, without losing any existing inspection data on devices that
already have project databases created under the `Pole` vocabulary.

## Decisions (locked with user)

| Decision | Choice | Rationale |
|---|---|---|
| Rename depth | Full data-model rename | User explicitly chose "Full data-model rename" over labels-only or label+column |
| DB filename / photo type | Rename too | User explicitly chose to rename `accc_pole_inspection.db` constant and `PhotoType "Pole"` |
| Migration strategy | Idempotent in-place upgrade of existing project DBs | No data loss; no aliasing layer (avoids a permanent dual vocabulary) |
| Column rename | `ALTER TABLE Inspections RENAME COLUMN PoleID TO SiteID` | Runs on the project-DB handle directly (not ATTACH-qualified) → safe per ADR-014; expo-sqlite bundles SQLite ≥ 3.25 |
| Value integrity | `InspectionValues` join by `FieldID`, so field-key renames preserve all captured values | Verified: `InspectionRepository.getInspectionValues` and all reads join `InspectionValues` → `InspectionFields` on `FieldID` |
| Snapshots | `Inspections.SectionsSnapshot` is written but never parsed | No JSON rewrite required; column is untouched |
| History | Historical changelog/ADR entries are left as-is | Docs describe facts at the time; new changelog entry + ADR document the rename |
| Dead constant | `DATABASE_NAME` (unused) updated to `accc_site_inspection.db` | Not imported anywhere; the real global DB file is `accc_global.db` (unchanged); project DBs are `inspection.db` (unchanged) |

## Canonical Rename Map

Every `Pole`/`pole` token becomes its `Site`/`site` counterpart:

| Layer | Old | New |
|---|---|---|
| Column | `Inspections.PoleID` | `Inspections.SiteID` |
| Field key | `pole_id` | `site_id` |
| Field label / placeholder | "Pole ID" / "Enter Pole ID" | "Site ID" / "Enter Site ID" |
| Section key | `pole_structure` | `site_structure` |
| Section name / description | "Pole Structure Details" / "Pole structure" | "Site Structure Details" / "Site structure" |
| Field keys | `pole_avail`, `pole_si`, `pole_status`, `pole_category` | `site_avail`, `site_si`, `site_status`, `site_category` |
| Field labels | "Pole Availability", "Pole SI", "Pole Status", "Pole Category" | "Site Availability", "Site SI", "Site Status", "Site Category" |
| FieldOptions `FieldKey` / DataSource | `pole_avail`, `pole_si`, `pole_status`, `pole_category` | `site_avail`, `site_si`, `site_status`, `site_category` |
| Card keys | `total_poles`, `today_poles`, `total_pole_status`, `today_pole_status` | `total_sites`, `today_sites`, `total_site_status`, `today_site_status` |
| Card titles | "Total Poles", "Today's Poles", "Pole Availability" | "Total Sites", "Today's Sites", "Site Availability" |
| `DistinctColumn` | `i.PoleID` | `i.SiteID` |
| `BreakdownField` | `pole_avail` | `site_avail` |
| Smart-card keys | `smart_pole_status_total`, `smart_pole_status_today`, … | `smart_site_status_total`, `smart_site_status_today`, … (generated from `FieldKey`, so automatic for new cards) |
| Repo methods | `updateInspectionPoleId`, `getInspectionByPoleId`, `getInspectionPoleId` | `updateInspectionSiteId`, `getInspectionBySiteId`, `getInspectionSiteId` |
| Context | `poleId`, `setPoleId` | `siteId`, `setSiteId` |
| Component locals | `contextPoleId`, `checkingPoleId`, `poleCheckTimeout`, `getPoleId`, `poleIdLoaded` | `contextSiteId`, `checkingSiteId`, `siteCheckTimeout`, `getSiteId`, `siteIdLoaded` |
| List item | `InspectionListItem.PoleID` | `InspectionListItem.SiteID` |
| Count distinctables | `i.PoleID` in `StatisticCountService.COUNT_ENTITIES.inspections` | `i.SiteID` |
| Photo type | `PhotoType "Pole"` (capture flow) | `PhotoType "Site"` |
| Filename util | `photoUtils` `pole` param / `cleanPole` | `site` / `cleanSite` |
| UI strings | "Pole ID Required", "Please enter Pole ID first before filling the inspection details.", "Checking Pole ID…", "Pole ID `${text}` already exists.", "Search Pole ID, Division, District, Block", "No Pole ID", "Start a new pole inspection" | "Site ID …" equivalents |
| Settings | key lists `"pole_id", "pole_avail", "pole_si", "pole_status", "pole_category"`; section description "(Pole, Earthing, Camera, etc.)" | `site_*` keys; "(Site, Earthing, Camera, etc.)" |
| Constant | `DATABASE_NAME = "accc_pole_inspection.db"` | `"accc_site_inspection.db"` |
| app.json | permission strings "…the pole site", "…the pole and equipment" | "…the site", "…the site and equipment" |

Explicit non-renames: the global DB file (`accc_global.db`) and per-project DB file
(`inspection.db`) are unchanged; the app display name does not contain "Pole".

## Current State (baseline)

- `src/database/tables/inspections.table.ts:12` — `PoleID TEXT NOT NULL` column.
- `src/database/repositories/InspectionRepository.ts` — `createInspection` inserts `PoleID`;
  `updateInspectionPoleId`; `getInspectionByPoleId` (duplicate check by
  `LOWER(TRIM(PoleID))`); `getInspectionPoleId`.
- `src/database/repositories/InspectionListRepository.ts` — `InspectionListItem.PoleID`, SQL
  `i.PoleID`, `filterByQuery` matches `item.PoleID`.
- `src/database/repositories/StatisticCountService.ts:22` — `distinctableColumns: ["i.PoleID", "i.InspectionID"]`.
- `src/database/repositories/DashboardCardRepository.ts:365-417` — `migrateDeviceCards`
  rewrites legacy pole-card titles to "Pole Availability" for keys `total_pole_status`/`today_pole_status`.
- `src/database/seeds/pole-inspection-data.ts` — `pole_id`, `pole_avail`, `pole_si`,
  `pole_status`, `pole_category` field definitions with "Pole …" labels.
- `src/database/seeds/inspection-sections.seed.ts` — `pole_structure` section.
- `src/database/seeds/field-options.data.ts` — option rows keyed `pole_avail`, `pole_si`,
  `pole_status`, `pole_category`.
- `src/database/seeds/dashboard-cards.seed.ts` — `total_poles`/`today_poles` (DistinctColumn
  `i.PoleID`), `total_pole_status`/`today_pole_status` (BreakdownField `pole_avail`,
  Title "Pole Availability").
- `src/context/InspectionContext.tsx` — `poleId`/`setPoleId` state, reset in `closeProject`.
- UI — `app/inspection/index.tsx` (search placeholder + `item.PoleID` row), `app/inspection/new.tsx`
  (`setPoleId("")`), `app/inspection/capture.tsx` (local `pole_id` state, `PhotoType: "Pole"`,
  watermark `poleId`), `app/projects/dashboard.tsx` (subtitle), `app/settings/index.tsx`
  (system-field key lists + section description), `src/components/inspection/GeneralInformation.tsx`
  (pole_id field special-casing, duplicate check, "Checking Pole ID…"), `SectionRenderer.tsx`
  (form lock until `pole_id`), `PhotoSection.tsx`, `DeviceSection.tsx`, `FieldRenderer.tsx`
  ("Pole ID Required"), `PhotoPreviewModal.tsx` (`contextPoleId`), `WatermarkOverlay.tsx`
  (`poleId` line), `photoUtils.ts` (`cleanPole`).
- Tests reference the vocabulary across ~20 suites (context, repositories, dashboard cards,
  seeds, capture/folder isolation, photo utils, watermark overlay, report preview, export).
- Docs: `docs/01-PRD.md`, `02-Architecture.md`, `03-Rules.md`, `04-Phases.md`, `05-Design.md`,
  `06-Memory.md`, `08-README.md`, `10-DATABASE_ARCHITECTURE.md`, `README.md`.

## New Architecture

### 1. Code + seeds use the canonical vocabulary

All identifiers and user-visible strings in the rename map above are updated to the `site`
vocabulary. This is a mechanical, repo-wide rename; there is no compatibility/alias layer —
code and seed config agree on one vocabulary.

### 2. Schema DDL

`src/database/tables/inspections.table.ts`: `PoleID TEXT NOT NULL` → `SiteID TEXT NOT NULL`.
Fresh project DBs (via `createProjectSchema`) create the `SiteID` column directly.

### 3. In-place migration for existing project DBs

A new block at the top of `migrateProjectSchema(projectId)` (already wired into
`ProjectDBManager.openProjectDb` at `ProjectDBManager.ts:259`), executed against the project
DB handle, in order:

1. `ALTER TABLE Inspections RENAME COLUMN PoleID TO SiteID` (guarded try/catch; no-op once done).
2. `UPDATE InspectionSections SET SectionKey='site_structure', SectionName='Site Structure Details',
   Description='Site structure' WHERE SectionKey='pole_structure'`.
3. `UPDATE InspectionFields SET FieldKey='site_id', FieldName='Site ID', Placeholder='Enter Site ID'
   WHERE FieldKey='pole_id'` and the analogous rows for `site_avail`, `site_si`, `site_status`,
   `site_category` (FieldName/Placeholder only).
4. `UPDATE FieldOptions SET FieldKey='site_avail' WHERE FieldKey='pole_avail'` (and the other three).
5. `DashboardCards` renames, executed sequentially so each `WHERE` matches the post-rename key:
   a. `UPDATE DashboardCards SET CardKey='total_sites' WHERE CardKey='total_poles'` (and
      `today_poles`→`today_sites`, `total_pole_status`→`total_site_status`,
      `today_pole_status`→`today_site_status`).
   b. `UPDATE DashboardCards SET Title='Total Sites' WHERE CardKey='total_sites' AND Title='Total Poles'`,
      `SET Title='Today''s Sites' WHERE CardKey='today_sites' AND Title='Today''s Poles'`,
      `SET Title='Site Availability' WHERE CardKey IN ('total_site_status','today_site_status')`
      (apostrophes doubled — SQLite string-literal escaping).
   c. `UPDATE DashboardCards SET DistinctColumn='i.SiteID' WHERE DistinctColumn='i.PoleID'`.
   d. `UPDATE DashboardCards SET BreakdownField='site_avail' WHERE BreakdownField='pole_avail'`.
6. `UPDATE DashboardCards SET CardKey=REPLACE(CardKey,'_pole_','_site_') WHERE CardKey LIKE 'smart_pole_%'`
   — rewrites existing smart cards (`smart_pole_status_total` → `smart_site_status_total`).
7. `UPDATE Photos SET PhotoType='Site' WHERE PhotoType='Pole'`.

Idempotency: every statement filters on the old value, so re-running after completion is a
no-op. Ordering matters only internally (rename keys before matching titles). The existing
`migrateDefaultCards`/`migrateDeviceCards`/`ensureDefaultCards` calls run after this block;
`DashboardCardRepository.migrateDeviceCards` pole-card branch is updated to the new keys
(`total_site_status`/`today_site_status`) and the "Site Availability" title so it still
normalizes legacy rows.

### 4. Data preservation

- `InspectionValues` store `FieldID`, not `FieldKey`; all reads join `InspectionValues` →
  `InspectionFields` on `FieldID`, so captured values survive the `FieldKey` renames intact.
- `Inspections.SiteID` keeps every existing inspection's ID string via the column rename.
- `DashboardCards` key renames preserve card config (title/icon/color/sort order) in place.

## Testing

- Update every existing test fixture/expectation that uses `Pole`/`pole`/`PoleID`/`pole_id` to
  the `site` vocabulary (~20 suites).
- **New migration regression test** (`src/__tests__/database/siteNamingMigration.test.ts`):
  build a project DB in the *old* shape (column `PoleID`; sections/fields/options/cards keyed
  `pole_*`; `Photos.PhotoType='Pole'`; one inspection + one value row), run
  `migrateProjectSchema`, then assert `SiteID` column exists with data intact, all keys
  renamed, and `PhotoType='Site'`. Uses a distinct mock DB path per isolation rules.
- Full gates: `npx tsc --noEmit`, `npx eslint app src __mocks__`, `npx jest --silent`.

## Files (primary)

- `src/database/tables/inspections.table.ts`, `src/database/schema.ts` (migration block)
- `src/database/seeds/pole-inspection-data.ts`, `inspection-sections.seed.ts`,
  `field-options.data.ts`, `dashboard-cards.seed.ts`
- `src/database/repositories/InspectionRepository.ts`, `InspectionListRepository.ts`,
  `StatisticCountService.ts`, `DashboardCardRepository.ts`
- `src/context/InspectionContext.tsx`
- `app/inspection/{index,new,capture}.tsx`, `app/projects/dashboard.tsx`, `app/settings/index.tsx`
- `src/components/inspection/{GeneralInformation,SectionRenderer,PhotoSection,DeviceSection,FieldRenderer,PhotoPreviewModal}.tsx`,
  `src/components/camera/WatermarkOverlay.tsx`, `src/components/inspection/photoUtils.ts`
- `src/database/constants/database.ts`, `app.json`
- Tests (~20 suites + new migration test)
- Docs (`docs/01-PRD.md` … `docs/10-DATABASE_ARCHITECTURE.md`, `README.md`), changelog, ADR
