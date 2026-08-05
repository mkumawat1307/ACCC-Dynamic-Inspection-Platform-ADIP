# ACCC Dynamic Inspection Platform (ADIP)

# Project Memory

Version: 1.9.1

Status: Living Document

Last Updated: 2026-08-04

---

# Purpose

This document preserves important project knowledge across development sessions.

It should provide enough context that a new developer or AI assistant can understand the project without reading the entire codebase.

This document shall always reflect the current implementation.

---

# 1. Project Summary

Project Name

ACCC Dynamic Inspection Platform

Short Name

ADIP

Platform

Android

Framework

React Native (Expo)

Language

TypeScript

Database

SQLite

Architecture

Offline First

Repository Pattern

Configuration Driven

---

# 2. Current Development Status

Overall Progress

Approximately 95%

Current Version

1.9.1

Current Sprint

Smart Dashboard Implementation Complete

Previous Sprints

- v1.9.1 — Smart Dashboard, Template Transfer v2.0, Inspection List Block Search
- v1.9.0 — Reports & Export v2
- v1.8.1 — App Rename + Bug Fixes
- v1.8 — Per-Project Database Isolation
- v1.7 — Per-Project Template Cloning
- v1.6 — Device Types Admin
- v1.5 — Device Options Admin, Template Import/Export, Project Edit/Delete, CSV Export
- v1.4 — Administration Panel

Development Status

Active Development

---

# 3. Completed Features

## Foundation

- Expo Project
- TypeScript
- SQLite
- Repository Pattern
- React Context
- Expo Router

---

## Dashboard

- Dashboard Screen with Smart Dashboard auto-refresh
- SmartCardGenerator (auto-creates Total + Today cards from inspection form field selection)
- DashboardCardManager (Smart Add Card flow + Custom Card manual editor)
- InspectionDataBus (pub/sub event bus for inspection data changes)
- useDashboardAutoRefresh (auto-refresh on bus events, app foreground, midnight, 60s focused poll)
- Search
- Recent Inspections
- Project-wise CSV Export (moved to Reports screen in v1.9.0)

---

## Reports & Export (v1.9.0)

- Reports screen with live banded table preview (ReportTablePreview)
- Project-wide export: CSV, Excel (xlsx) — via `exportInspections`
- Banded headers: CSV repeats band per column; Excel merges bands + autofilter + frozen rows
- Live template columns (sections/fields read at export time)
- Device rows: one per device, filled with device section's own columns
- Derived columns: Latitude/Longitude (splitLatLong), Status (PoleID + InspectionRecords)
- Single-inspection export from Inspection List (Excel/CSV) via `exportInspection`
- Single unified export service (`buildReportTable`, `buildCsv`, `buildExcelBase64`, `createExportFile`, `shareExportFile`, `openExportFile`, `exportInspections`, `exportInspection`)
- Legacy `exportProjectData` + Home Export button removed; exports live in Reports
- PDF report export is NOT currently implemented (removed in the v1.9.1 baseline; planned as a future enhancement)

## Inspection Engine

- Create Inspection
- Edit Inspection
- Delete Inspection
- Auto Save
- Draft Inspection
- Duplicate Pole Detection
- Pole ID Lock Fix (waits for DB before locking form)
- Section IsDefault Filtering (only default sections appear in inspections)
- Reset to Default preserves general_information section
- Settings Sections screen shows only default template sections (no duplicates from cloned templates)
- Deduplication migration for InspectionSections and InspectionFields (removes duplicate rows from backup table artifacts)
- Inspection List shows Block name on each card (with "N/A" fallback)
- Inspection List search matches Block in addition to Pole ID, Division, District (via `InspectionListRepository.filterByQuery` helper, case-insensitive and null-safe)

---

## Field Inspection

- Pole Information
- Pole Structure
- Junction Box
- Earthing
- Meter
- Connectivity

---

## Device Inspection

- Camera Inspection (dynamic fields, auto-save, data preservation)
- Switch Inspection (dynamic fields, auto-save, data preservation)
- Camera/Switch options loaded from database (DeviceOptions table)
- Camera/Switch options admin-configurable via Settings > Device Options

---

## Photos

- Photo Capture
- Photo Storage (in project folder)
- Photo Preview Modal
- Green Watermark Overlay (Pole ID, District+Block, GPS, Timestamp)
- Watermark Burn-In (hidden WebView canvas, serial queue via `useWatermarkProcessor`)
- SAF Photo Storage (expo-file-system; watermarked copies saved to DCIM/ACCC Inspection/<District>_<ProjectName>; legacy folders migrate lazily on project open)
- GPS Mandatory for Photo Capture
- Pole ID + Block Read Fresh from DB Before Capture
- Minimum 1 Photo Required for Validation

---

## GPS

- Latitude
- Longitude
- Manual Button in General Information
- Mandatory for Photo Capture
- Permission Handling

---

## Administration Panel (Phase 4)

- Template Management (list, create, edit, delete)
- Section Management (list, create, edit, delete, reorder within template)
- Field Management (list, create, edit, delete, reorder within section)
- Field Type Selection (text, number, multiline, dropdown, date, date_auto, time, GPS, checkbox)
- Field Options / Dropdown Management (list, create, edit, delete, reorder)
- Section Reorder (up/down arrows)
- Field Reorder (up/down arrows)
- Option Reorder (up/down arrows)
- Section Repeatable Toggle
- Section Visibility Toggle
- Section IsDefault Toggle
- Field Required/Visible/ReadOnly Toggles
- Settings Navigation Wired to All Admin Screens
- Photos section locked (cannot be edited, reordered, or deleted)
- Reset to Default button (restores original inspection form)

---

## Device Types Admin (v1.6)

- DeviceFieldDefinitions table (schema for device type fields)
- DeviceRecords table (JSON storage per device per inspection)
- DeviceFieldDefinitionsRepository (CRUD + reorder)
- DeviceRecordsRepository (JSON storage)
- Device Types admin screen (create/edit/delete device types)
- Per-type field management (add, edit, reorder, delete fields)
- Field type selection (text, dropdown, number, date, checkbox)
- "Manage Options" button on dropdown fields navigates to device-options
- Explicit "Enable in Inspection" toggle per device type
- Delete device type (deactivates fields, options, section, count field, records)
- Per-project device type tracking (ProjectDeviceTypes table)
- SectionRenderer dynamic device type detection and rendering
- Generic DeviceSection component (replaces hardcoded CameraSection/SwitchSection for new inspections)
- Section key matching for device types in Settings > Sections

---

## Device Options Admin (v1.5)

- DeviceOptions table (18th DB table)
- DeviceOptionsRepository (CRUD operations)
- Device Options seed data for Camera and Switch dropdowns
- Settings > Device Options screen for managing dropdown values
- CameraSection loads type/status/make/model options from DB
- SwitchSection loads type/status/make/model options from DB

---

## Template Import/Export (v1.5 → v2.0)

- Export templates to JSON format
- Import templates from JSON files
- Uses expo-document-picker and expo-sharing
- Accessible from Settings screen
- v2.0 (August 2026): export all templates, sections, fields, options, custom device types, device options, and project device type mappings; import replaces the form in-place (deactivate + add) while preserving existing inspection data; v1.0 files still import via normalization; Reset-to-Default preserves per-inspection `DeviceRecords`; error dialogs scoped to the originating flow (ADR-016)

---

## Per-Project Database Isolation (v1.8)

- Each project gets its own SQLite database file (inspection.db) stored in Projects/<ProjectName>/inspection.db
- Photos and exports stored in the same project folder
- Global DB (accc_global.db) only stores Projects list + Divisions/Districts/Blocks
- Project DB contains full schema (18 tables) with all inspection data, templates, sections, fields, options, photos, device data
- Each project DB is created with full seed data (default template, sections, fields, options, device options)
- ProjectDBManager utility handles creating, opening, and deleting project databases
- TemplateSyncHelper deleted (no longer needed with isolated databases)
- InspectorName field on Projects (DB column, form input, auto-fill in inspection)
- Settings screens no longer sync changes to cloned templates (each project is fully independent)

---

## Project Management (v1.5)

- Project Edit with modal form
- Project Delete with warning dialog (cascading inspection deletion)
- Project export moved to Reports screen (v1.9.0)

---

# 4. Current Architecture

The application follows a dual-database architecture:

Global DB (accc_global.db)

↓

Projects, Divisions, Districts, Blocks

Project DB (Projects/<ProjectName>/inspection.db)

↓

All inspection data, templates, sections, fields, photos, devices

Data Flow:

UI

↓

Components

↓

Context

↓

Repositories

↓

SQLite (Global DB or Project DB)

The Repository Pattern is mandatory.

All database access must go through repositories.

ProjectDBManager handles database creation, opening, and deletion for project databases.

---

# 5. Current Database

Dual-Database Model

The application uses two SQLite databases:

Global DB (accc_global.db) — 4 tables:
- Projects (list of all projects, no template/inspection data)
- Divisions
- Districts
- Blocks

Project DB (Projects/<ProjectName>/inspection.db) — 18 tables per project:
- InspectionTemplates
- InspectionSections
- InspectionFields
- FieldOptions
- Inspections
- InspectionValues
- RepeatableGroups
- RepeatableGroupFields
- RepeatableRecords
- RepeatableValues
- Cameras
- Switches
- Photos
- DeviceOptions
- DeviceFieldDefinitions
- DeviceRecords
- ProjectDeviceTypes
- DashboardCards

Each project database is created with full seed data at project creation time.

Future tables should be added only after architectural review.

---

# 6. Current Inspection Flow

Dashboard

↓

Select Project

↓

Create Inspection

↓

General Information

↓

Pole Structure

↓

Junction Box

↓

Earthing

↓

Meter

↓

Connectivity

↓

Camera

↓

Switch

↓

Remarks

↓

Photos

↓

Complete

Only sections marked with IsDefault = 1 in InspectionSections appear in the inspection form by default.

---

# 7. Current Coding Standards

Always

TypeScript

Repository Pattern

React Context

SQLite

Reusable Components

Strong Typing

Per-Project DB isolation

Never

Database logic inside UI

Hardcoded forms

Duplicate components

Large functions

---

# 8. Important Architectural Decisions

- Offline First
- Configuration Driven Forms
- SQLite Database
- Repository Pattern
- Expo Router
- Auto Save
- React Context
- DB-driven Device Options (Camera/Switch configuration)
- Section IsDefault filtering
- Per-Project Database Isolation (each project has its own inspection.db)
- TemplateSyncHelper removed (no longer needed with isolated DBs)
- Future cloud synchronization

These decisions should not be changed without Product Owner approval.

---

# 9. Known Issues

Current known work items

- PDF report export
- Photo Reports
- Cloud Synchronization

No issue should be removed until resolved.

---

# 10. Current Priorities

Highest Priority

Reporting Completion (Phase 5) — PDF report export, Photo Reports, Analytics Dashboard

Second Priority

Cloud Platform (Phase 6) — Cloud Synchronization, Authentication

Third Priority

AI Features (Phase 7) — OCR, Image Analysis

Fourth Priority

Additional Inspection Modules — NVR, UPS, Solar, OFC, Data Centre, Traffic Signal, Smart Pole, Control Room

---

# 11. Future Modules

Planned inspection modules

- Pole Inspection
- NVR Inspection
- UPS Inspection
- Solar Inspection
- Media Converter
- Traffic Signal
- Data Centre
- Control Room

These modules should reuse the same inspection engine.

---

# 12. AI Instructions

Every AI assistant working on this project should:

- Read this file first.
- Read Architecture.md second.
- Read Rules.md third.
- Understand existing implementation before generating code.
- Never redesign working architecture.
- Reuse existing components.
- Maintain offline-first architecture.
- Maintain Repository Pattern.
- Maintain React Context.
- Use TypeScript.
- Avoid duplicate code.
- Ask questions if requirements are unclear.

---

# 13. Session Notes

After every completed sprint update:

- Completed Features
- Current Sprint
- Known Issues
- Current Priorities
- Version Number

This document should always represent the latest state of the project.

---

# 14. Version History

0.1.0

Project Foundation

0.2.0

Inspection Engine

0.3.0

Dynamic Inspection Platform

1.0.0

Camera/Switch/Photo Modules

1.1

GPS Mandatory, Green Watermark, Auto-Save, Numeric Count Input

1.2

Watermark Burn-In, Light Black BG, Block from Inspection, NA Filename, Download Folder

1.3

Fixed stale poleId/block in watermark, ViewShot on-screen, watermark green on light black bg

1.4

Administration Panel — Template, Section, Field, Option CRUD with reorder

1.5

Device Options DB-driven, Template Import/Export, Project Edit/Delete, Project-wise CSV Export, Pole ID Lock Fix, Section IsDefault filtering

1.6

Per-project template cloning (each project independent), InspectorName on Projects (DB+form+auto-fill), Dynamic DeviceFieldDefinitions + DeviceRecords tables, Generic DeviceSection component, Device Types admin screen (create/delete/manage fields), Per-project device type toggle (ProjectDeviceTypes), Section key matching for device types, Photos section locked, Reset to Default button, Settings simplified (Camera/Switch Options removed from settings, managed via Device Types), FAB bottom fix for Android nav bar, Remove Switch field type from field creation, Field Key auto-generate only until manually edited, InspectionSections UNIQUE constraint removed for multi-template support, Export/Import button on project cards

1.7

Fixed Reset to Default removing general_information section, Settings Sections filtered to default template only, Deduplication migration for InspectionSections/InspectionFields (hard-delete), cloneDefaultTemplate UNIQUE constraint fix (unique template names), Per-project template isolation (getSections/getFieldsByKey return empty when no templateId instead of leaking all templates), InspectorName moved to DisplayOrder 2 (after Date), InspectorName mandatory in project creation, Section action buttons moved inline with section name, Section FABs moved to Appbar header, Double inspection creation fix (module-level flag with key tracking), validateInspection scoped to inspection's project template, inspector_name migration applies to ALL templates not just LIMIT 1

1.8

Per-Project Database Isolation Architecture — each project gets its own inspection.db, global DB (accc_global.db) stores only Projects/Divisions/Districts/Blocks, ProjectDBManager utility, TemplateSyncHelper removed, photos stored in project folder, TemplateID column removed from Project model, Settings screens no longer sync to cloned templates

1.8.1

App renamed to "ACCC Dynamic Inspection Platform", bundle ID changed to com.accc.dynamicinspection, android/ folder deleted (regenerate with npx expo prebuild), fixed "no such table: Projects" bug in project creation (removed leaked double-open handle in ProjectDBManager), DistrictRepository now uses getGlobalDatabase() directly

1.9.0

Reports & Export v2 — Reports screen with live banded preview, project-wide CSV/Excel/PDF export (unified exportData.ts service), single-inspection export from Inspection List, derived Latitude/Longitude + Status columns, device rows per inspection, legacy exportProjectData + Home Export button + dashboard CSV card removed

1.9.1

Smart Dashboard (SmartCardGenerator, DashboardCardManager, Dashboard settings screen, InspectionDataBus, useDashboardAutoRefresh, CardMode, Project Information card), Template Transfer v2.0 (replace-in-place import, v1.0 backward compatibility, reset preserves DeviceRecords), Inspection List Block search and display (testable filterByQuery helper), Project clone (cloneProjectDb atomic clone), Duplicate Pole ID detection, WebView-canvas watermark + SAF photo storage, Reports screen with Excel/CSV export

Future versions shall be added after every release.

---

# 15. Next Sprint

Reporting Completion (Phase 5)

- PDF report export
- Photo Reports
- Analytics Dashboard / Project / District Statistics

Future phases:

- Cloud Platform (Phase 6) — Cloud Synchronization, Authentication
- AI Platform (Phase 7) — OCR, Image Analysis, Inspection Recommendations

This section should always contain the next planned milestone.

---

# End of Memory
