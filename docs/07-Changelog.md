# ACCC Dynamic Inspection Platform (ADIP)

# CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on **Keep a Changelog** and follows **Semantic Versioning (SemVer)**.

---

# Version Format

Major.Minor.Patch

Example:

1.0.0

Major → Breaking changes

Minor → New features

Patch → Bug fixes

---

# [Unreleased]

## Added

- PDF Reports
- Excel Reports
- Dashboard Analytics
- Cloud Synchronization

## Fixed

### Sequential Open/Close DB Model + Context-Based Project Isolation

Rewrote `db.ts` to use a sequential open/close model with a single `SQLiteDatabase` handle. Eliminated `ATTACH DATABASE` approach (rejected on Android — expo-sqlite's `execAsync` does not support dot-qualified DDL like `CREATE TABLE p.InspectionSections(...)`). Fixed the inspection flow to pass project data via React Context instead of switching between global and project databases.

**Changes:**
- `db.ts`: Sequential open/close — single `database` handle, `currentDbTarget` tracks which file is open, `cleanPath()` strips `file://` before path comparison.
- `schema.ts`: Removed `pSchema()` helper. All project DDL uses plain table names (no prefix). `createProjectSchema()` takes no `db` parameter.
- `ProjectDBManager.ts`: Removed all `getInfoAsync` calls for SQLite `.db` files (unreliable on Android). `openProjectDb()` validates by querying `sqlite_master` for `InspectionTemplates`. `deleteProjectDb()` and `deleteProjectFolder()` delete directly without existence checks. `listProjectFolders()` lists folder names without per-file checks.
- `index.tsx`: Uses `openProject(item)` instead of `openProjectDb(item.DBPath)` — sets both the DB and the React Context. Passes `projectData` JSON navigation param to `dashboard.tsx`.
- `dashboard.tsx`: Reads project from `projectData` navigation param first (synchronous, no DB call), then falls back to context. Passes `projectData` JSON param to `inspection/new.tsx`. Avoids `getProjectById()` → `getGlobalDatabase()` during inspection flow.
- `inspection/new.tsx`: Reads project from `projectData` navigation param first (synchronous, no DB call), then falls back to context. Never calls `getProjectById()` — avoids `getGlobalDatabase()` during inspection flow.
- `GeneralInformation.tsx`: Removed `getProjectById()` fallback — waits for context propagation instead of corrupting the DB handle.
- All 17 project repositories: Plain table names (no `p.` prefix).
- All 9 seed files: Plain table names (no `p.` prefix).
- `DistrictRepository.ts`: Removed `WHERE IsActive = 1` filter (fails on older DBs missing column). Added `IsActive` column migration to `schema.ts`.
- `Immutable` option removed from `FileSystem.deleteAsync()` calls (not valid in expo-file-system type definitions).
- TSC compiles with zero errors.

---

# [1.8.1] - 25-Jul-2026

## Added

- App renamed to "ACCC Dynamic Inspection Platform" (was "ACCC Pole Inspection")
- Bundle ID changed to `com.accc.dynamicinspection` (was `com.emergent.poledataexcel.p9sjtu`)
- Permission strings updated to match new app name
- All `com.emergent` references removed from codebase

## Fixed

- Fixed "no such table: Projects" error during project creation — migrated to ATTACH DATABASE approach (single connection, no double-open handle issue)
- DistrictRepository.getAll() removed `WHERE IsActive = 1` filter (fails on older DBs missing the column)

## Removed

- android/ folder deleted (regenerate with `npx expo prebuild`)
- Old android package name `com.emergent.poledataexcel.p9sjtu`

---

# [1.8] - 25-Jul-2026

## Added

### Per-Project Database Isolation Architecture

- Dual-database model: Global DB (accc_global.db) + Project DB (inspection.db per project)
- Global DB stores only Projects, Divisions, Districts, Blocks (4 tables)
- Each project gets its own inspection.db with full schema (17+ tables) and seed data
- ProjectDBManager utility for creating, opening, and deleting project databases
- Project DB stored at Projects/<ProjectName>/inspection.db
- Photos stored in project folder alongside the database
- Exports stored in project folder
- Each project DB seeded with default template, sections, fields, options, device options

## Removed

- TemplateSyncHelper deleted (no longer needed with isolated databases)
- TemplateID column removed from Project model
- cloneDefaultTemplate() removed
- Settings screens no longer sync changes to cloned templates

---

# [1.5] - 25-Jul-2026

## Added

### Device Options Admin Panel

- DeviceOptions database table (18th table in schema)
- DeviceOptionsRepository with CRUD operations
- DeviceOptions seed data for Camera and Switch dropdown options
- Settings > Device Options screen for admin-configurable dropdown values
- Camera type, status, make, model, and IP options now loaded from database instead of hardcoded values
- Switch type, status, make, model, and IP options now loaded from database instead of hardcoded values
- Drill-down admin navigation: Settings → Sections → Fields → Options → Device Options

### Section IsDefault Flag

- IsDefault column added to InspectionSections table
- InspectionRepository now filters sections by IsDefault = 1
- Only default sections appear in new inspection forms
- IsDefault toggle in Section Management admin panel

### Pole ID Lock Fix

- SectionRenderer now waits for database load before locking Pole ID field
- Added poleIdLoaded state to prevent premature form locking
- Prevents blank Pole ID on rapid inspection creation

### Project Edit and Delete

- ProjectRepository.updateProject() method added
- Project edit modal with pre-filled form
- Project delete with confirmation warning dialog
- Warning dialog informs user that all inspections within the project will be deleted

### Project-wise CSV Export

- Export inspection data for a specific project to CSV format
- Uses expo-sharing to share exported CSV file
- Export button accessible from project dashboard

### Template Import/Export

- Export templates to JSON format (templateData.ts utility)
- Import templates from JSON files via expo-document-picker
- Self-contained JSON with all template, section, field, and option data
- Import creates new template from JSON data
- Accessible from Settings screen

### Utility Files

- src/utils/exportData.ts — CSV export utilities
- src/utils/templateData.ts — Template JSON import/export utilities
- app/settings/device-options.tsx — Device Options admin screen

### Schema Changes

- inspections.table.ts — SectionsSnapshot column deprecated (replaced by live DB query)
- schema.ts — Migration to add DeviceOptions table and IsDefault column

## Changed

- CameraSection.tsx — Now loads camera options from database instead of hardcoded arrays
- SwitchSection.tsx — Now loads switch options from database instead of hardcoded arrays
- SectionRenderer.tsx — Added poleIdLoaded state for DB-aware form locking
- InspectionRepository.ts — Added IsDefault filter for section rendering
- seed.ts — Added device options seed data during database initialization

---

# [1.4] - 24-Jul-2026

## Added

### Administration Panel (Phase 4)

- Template Management (list, create, edit, delete)
- Section Management (list, create, edit, delete, reorder)
- Field Management (list, create, edit, delete, reorder)
- 10 field types: text, number, multiline, dropdown, date, date_auto, time, GPS, checkbox, switch
- Field Options / Dropdown Management (list, create, edit, delete, reorder)
- Section reorder with up/down arrows
- Field reorder with up/down arrows
- Option reorder with up/down arrows
- Section repeatable toggle
- Section visibility toggle
- Field required/visible/readOnly toggles
- Settings navigation wired to all admin screens

### Repositories

- TemplateRepository (CRUD + hasInspections check)
- SectionRepository (CRUD + reorder + hasInspectionValues check)
- FieldRepository (CRUD + reorder + keyExists check + 10 field types)
- FieldOptionRepository (CRUD + reorder + getByFieldKey)

---

# [1.3] - 24-Jul-2026

## Fixed

- Fixed stale poleId/block in watermark — now reads fresh from DB before every capture
- ViewShot moved from off-screen to on-screen for reliable Android capture
- Added onLayout callback to ensure ViewShot is rendered before capture

## Changed

- Watermark text changed from white (#FFFFFF) to green (#76FF03)
- ViewShot background changed from #000 to transparent (only watermark strip has light black bg)
- Updated project.md and PROJECT_MASTER_DOCUMENT.md to v1.3

---

# [1.2] - 24-Jul-2026

## Added

- Watermark burned into gallery photos via react-native-view-shot
- Photos saved to Download/Inspection/{District}/ folder
- Photo preview modal

## Changed

- Watermark background changed to light black (rgba(0, 0, 0, 0.5))
- Block name in watermark sourced from inspection form (InspectionValues)
- Filename fallback changed from "Unknown" to "NA"
- Filename format standardized: District_Block_PoleId_DDMMMYYYY_Time.jpg
- Gallery save made async/non-blocking for fast capture
- App logo changed to abhay-logo.png

---

# [1.1] - 24-Jul-2026

## Added

- GPS mandatory for photo capture (blocks capture if unavailable)
- Green watermark (#76FF03) on photos
- Auto-save with debouncing (500ms) to CameraSection and SwitchSection
- Numeric count input for camera_count and switch_count (was dropdown)

## Changed

- Removed manual Save/Save All buttons from CameraSection and SwitchSection
- Removed "ACCC" prefix from watermark text
- GPS remains manual button in General Information, validated on save
- Fixed touch sensitivity on dropdowns (increased height to 56px)

## Fixed

- Fixed expo-media-library AUDIO permission error
- Fixed PhotoRepository.create() to return lastInsertRowId
- No preview modal appears after photo capture

---

# [1.0] - 24-Jul-2026

## Added

### Major Bug Fixes

- Fixed GPS save format (single "gps" field as "lat, lng")
- Removed DROP TABLE on restart (data loss prevention)
- Fixed all seed field keys to snake_case
- Fixed FieldOptions empty seed (PascalCase -> snake_case)
- Fixed GeneralInformation not rendering in inspection form
- Fixed camera/switch count not persisting on section reload
- Fixed camera/switch sections rendering in wrong sections
- Fixed photos section not rendering (missing sectionKey)
- Fixed Division/District auto-fill not saving to DB
- Removed duplicate poleInspectionFields export

### Camera Module

- CameraSection with 9 dynamic fields (Type, Status, Make, Model, IP, Serial, SI, SD Capacity, SD Status)
- Camera options aligned to ACCC spec (Bullet/Box/PTZ, VMS/Local/Non-Live, Sparsh/Prama/Hikvision/CP Plus/Secura)
- Auto-save with debouncing, data preservation on count decrease

### Switch Module

- SwitchSection with 7 dynamic fields (Type, Status, Make, Model, IP, Serial, SI)
- Switch options aligned to ACCC spec (4-Port/8-Port, D-Link/Cisco/Allied/Tejas)
- Auto-save with debouncing, data preservation on count decrease

### Photo Module

- PhotoSection with camera capture, GPS mandatory, green watermark overlay
- Photos saved to app document directory
- Filename: District_Block_PoleId_DDMMMYYYY_Time.jpg
- Minimum 1 photo required for validation

---

# [0.3.0] - Current Development

## Added

- Inspection Template support
- Dynamic Sections
- Dynamic Fields
- Auto Save improvements
- Repository enhancements
- SQLite schema updates
- Project documentation

## Changed

- Inspection engine prepared for configuration-driven forms
- Folder structure improvements
- Better code organization

## Fixed

- Various inspection editing issues
- Auto-save stability improvements

---

# [0.2.0]

## Added

### Inspection Engine

- Create Inspection
- Edit Inspection
- Delete Inspection
- Search Inspection
- Draft Inspection support

### GPS

- Latitude capture
- Longitude capture
- Permission handling

### Photos

- Photo capture
- Local storage
- Metadata storage

### Dashboard

- Inspection statistics
- Recent inspections
- Search

### Database

- SQLite integration
- Repository Pattern
- Initial schema

---

# [0.1.0]

## Added

### Project Setup

- Expo project
- TypeScript
- React Context
- Expo Router
- Initial folder structure

### Database

- SQLite initialization
- Database schema
- Seed data

### Foundation

- Navigation
- Basic Dashboard
- Project configuration

---

# Future Releases

## Version 1.6.0

Planned

### Added

- PDF Reports
- Excel Reports
- Dashboard Analytics
- Photo Reports

---

## Version 1.7.0

Planned

### Added

- Cloud Synchronization
- Authentication
- User Roles
- Notifications
- REST API Integration

---

# Changelog Guidelines

Every release should document:

## Added

New features.

## Changed

Modified behaviour.

## Deprecated

Features planned for removal.

## Removed

Removed functionality.

## Fixed

Bug fixes.

## Security

Security improvements.

---

# Release Checklist

Before creating a new release:

- Update version number.
- Update Memory.md.
- Update Phases.md.
- Update README.md if required.
- Tag Git release.
- Commit all changes.

---

# Git Tag Examples

v0.1.0

v0.2.0

v0.3.0

v1.0.0

v1.5.0

---

# End of Changelog
