# ACCC Dynamic Inspection Platform (ADIP)

# System Architecture Document

---

## Document Information

| Item | Value |
|------|-------|
| Document | System Architecture |
| Version | 1.9.0 |
| Status | Active Development |
| Platform | Android |
| Framework | React Native (Expo) |
| Language | TypeScript |
| Database | SQLite |
| Architecture | Offline-First, Configuration-Driven |
| Last Updated | July 2026 |

---

# 1. Introduction

The ACCC Dynamic Inspection Platform (ADIP) is an offline-first mobile application designed to digitize infrastructure inspections.

The application is built using a modular, configuration-driven architecture that allows inspection forms to evolve without requiring major code changes.

The initial implementation focuses on pole inspections. The architecture is intentionally designed to support additional inspection types in future releases.

---

# 2. Architectural Goals

The architecture has been designed with the following objectives:

- Offline-first operation
- High maintainability
- Modular design
- Reusable components
- Configuration-driven inspection forms
- DB-driven device options (not hardcoded)
- Minimal code duplication
- Easy scalability
- Consistent user experience
- Simple testing
- Future cloud synchronization support

---

# 3. High-Level Architecture

The application follows a layered architecture.

+----------------------------------------------------+
|                  User Interface                    |
| Screens • Components • Forms • Camera • Dashboard |
+----------------------------------------------------+
                     │
                     ▼
+----------------------------------------------------+
|               React Context Layer                  |
| Inspection Context • Settings • Shared State       |
+----------------------------------------------------+
                     │
                     ▼
+----------------------------------------------------+
|              Repository Layer                      |
| Project Repository                                |
| Inspection Repository                             |
| Field Repository                                  |
| Photo Repository                                  |
| DeviceOptions Repository                          |
+----------------------------------------------------+
                     │
                     ▼
+----------------------------------------------------+
|               SQLite Database                      |
| Global DB: Projects, Divisions, Districts, Blocks |
| Project DB: Templates, Sections, Fields, Values,  |
|             Devices, Photos, DeviceOptions         |
+----------------------------------------------------+

---

# 4. Technology Stack

## Frontend

React Native

Expo

TypeScript

---

## Database

SQLite

---

## Navigation

Expo Router

---

## State Management

React Context API

---

## Device APIs

Expo Camera

Expo Location

Expo Image Picker

File System

---

## Development Tools

VS Code

Git

GitHub

Android Studio

Node.js

npm

---

# 5. Design Principles

The project follows these architectural principles.

## Offline First

All inspection activities must work without internet connectivity.

Internet access is optional and reserved for future synchronization.

---

## Configuration Driven

Inspection forms are generated from database configuration.

Templates define:

- Sections
- Fields
- Display order
- Validation
- Visibility

This eliminates hardcoded inspection screens.

---

## DB-Driven Device Options

Camera and switch dropdown options (type, status, make, SI, SD card) are stored in the DeviceOptions database table rather than hardcoded in component source code.

CameraSection and SwitchSection components load dropdown options from DeviceOptionsRepository. If the DeviceOptions table is empty, components fall back to hardcoded default values for backward compatibility.

---

## Repository Pattern

Database operations are isolated from UI components.

Benefits:

- Easier maintenance
- Better testing
- Cleaner code
- Reduced duplication

---

## Separation of Concerns

Each module has a single responsibility.

Examples:

Database Layer

Stores data.

Repository Layer

Reads and writes data.

Context Layer

Shares application state.

UI Layer

Displays information.

---

## Reusable Components

Components should be generic and reusable.

Examples:

Text Input

Dropdown

Checkbox

Camera Card

Photo Preview

Dynamic Field Renderer

These components can be reused across multiple inspection templates.

---

# 6. Core Architectural Characteristics

The application is designed to be:

✔ Offline First

✔ Modular

✔ Configuration Driven

✔ Repository Based

✔ Component Oriented

✔ Scalable

✔ Maintainable

✔ Extensible

✔ Mobile Optimized

✔ Future Cloud Ready

# 7. Project Folder Structure

The project follows a modular folder structure to improve maintainability, scalability, and separation of responsibilities.

```
ACCC-Dynamic-Inspection-Platform/
│
├── docs/
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── index.tsx              (Project List — home screen)
│   │   ├── dashboard.tsx          (Global dashboard)
│   │   ├── +html.tsx
│   │   ├── projects/
│   │   │   ├── new.tsx
│   │   │   └── dashboard.tsx      (Per-project dashboard)
│   │   ├── inspection/
│   │   │   ├── new.tsx
│   │   │   └── ...
│   │   ├── reports/
│   │   │   └── index.tsx
│   │   └── settings/
│   │       ├── index.tsx
│   │       ├── sections.tsx
│   │       ├── fields.tsx
│   │       ├── options.tsx
│   │       └── device-options.tsx
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── inspection/
│   │   │   │   ├── FieldRenderer.tsx
│   │   │   │   ├── SectionRenderer.tsx
│   │   │   │   ├── GeneralInformation.tsx
│   │   │   │   ├── CameraSection.tsx
│   │   │   │   ├── SwitchSection.tsx
│   │   │   │   └── PhotoSection.tsx
│   │   │   ├── dashboard/
│   │   │   ├── forms/
│   │   │   └── projects/
│   │   ├── context/
│   │   │   └── InspectionContext.tsx
│   │   ├── database/
│   │   │   ├── db.ts               (Sequential open/close DB manager)
│   │   │   ├── schema.ts           (Global + Project schema creators)
│   │   │   ├── seed.ts             (Global + Project seed orchestrators)
│   │   │   ├── DatabaseService.ts  (Startup initialization)
│   │   │   ├── tables/             (CREATE TABLE definitions)
│   │   │   ├── seeds/              (Idempotent seed data)
│   │   │   ├── repositories/       (Repository Pattern — 19 repos)
│   │   │   └── helpers/
│   │   │       └── ProjectDBManager.ts
│   │   ├── hooks/
│   │   │   └── use-icon-fonts.ts
│   │   ├── models/                 (7 TypeScript interfaces)
│   │   └── utils/
│   │       ├── date.ts
│   │       ├── location.ts
│   │       ├── exportData.ts
│   │       └── templateData.ts
│   │
│   ├── assets/
│   ├── android/
│   ├── package.json
│   ├── tsconfig.json
│   └── app.json
```

---

# 8. Folder Responsibilities

## app/

Contains all application screens managed by Expo Router.

Examples:

- Dashboard
- New Inspection
- Edit Inspection
- Reports
- Settings (sections, fields, options, device-options)

Responsibilities

- Navigation
- Screen layout
- User interaction

---

## components/

Contains reusable UI components.

Examples

- FieldRenderer
- SectionRenderer
- GeneralInformation
- CameraSection
- SwitchSection
- PhotoSection
- DashboardActionCard
- SummaryCard
- ProjectCard

Rules

- Must not access SQLite directly.
- Should remain reusable.
- Should receive data through props.

---

## context/

Contains React Context providers.

Current providers

- InspectionContext (project, inspectionDate, inspectionId, poleId)

Responsibilities

- Shared inspection state

The Context layer communicates with repositories instead of directly accessing the database.

---

## database/

Contains all database-related code.

Structure

database/

db.ts (SQLite connection)

schema.ts (CREATE TABLE statements, migrations)

seed.ts (Seed orchestrator)

tables/ (Table definitions)

seeds/ (Idempotent seed data)

repositories/ (Repository Pattern)

constants/ (DB name constant)

Responsibilities

- Table creation
- Database initialization
- Seed data
- CRUD operations via repositories
- Migrations for schema evolution

---

## models/

Contains TypeScript interfaces representing database entities.

Examples

Project

District

Inspection

InspectionField

InspectionPhoto

InspectionValue

DeviceOption

Responsibilities

- Strong typing
- Compile-time validation
- Shared data contracts

---

## repositories/

Repositories isolate business logic from SQLite.

Location: src/database/repositories/

Responsibilities

- CRUD operations
- Queries
- Transactions
- Data mapping

Current repositories:

- ProjectRepository (Project CRUD, including updateProject(), uses getGlobalDatabase)
- InspectionRepository (Inspection CRUD, validation, sections, fields, values; getSections() filters by IsDefault=1, getAllSections() for admin)
- InspectionFieldRepository (Field queries, option loading)
- InspectionValueRepository (Save/load/delete field values)
- InspectionSectionRepository (Section CRUD)
- InspectionListRepository (Inspection list with details; filterByQuery — pure, testable case-insensitive search over PoleID/Division/District/Block)
- CameraRepository (Camera CRUD with transactions)
- SwitchRepository (Switch CRUD with transactions)
- PhotoRepository (Photo CRUD, create returns lastInsertRowId)
- DistrictRepository (District queries, uses getGlobalDatabase)
- DashboardRepository (Dashboard stats)
- DeviceOptionsRepository (CRUD and reorder for DeviceOptions table)
- TemplateRepository (Template CRUD + hasInspections check)
- SectionRepository (Section CRUD + reorder + hasInspectionValues check)
- FieldRepository (Field CRUD + reorder + keyExists check + 10 field types)
- FieldOptionRepository (Dropdown option CRUD + reorder + getByFieldKey)
- DeviceFieldDefinitionsRepository (Device field definition CRUD + device type management)
- DeviceRecordsRepository (Generic device record CRUD, JSON storage)
- ProjectDeviceTypesRepository (Project-device type mapping CRUD)

---

## utils/

Utility functions used throughout the application.

Location: src/utils/

Current files

- date.ts (getCurrentInspectionDate)
- location.ts (getCurrentLocation with permissions)
- exportData.ts (unified export service: banded CSV/Excel/PDF for projects and single inspections)
- templateData.ts (Template JSON export and import)

---

## hooks/

Reusable React hooks.

Location: src/hooks/

Current hooks

- use-icon-fonts (Icon font loading)

---

# 9. Layered Architecture

The application follows a five-layer architecture.

```
User

↓

Screens

↓

Components

↓

Context

↓

Repositories

↓

SQLite Database
```

Each layer communicates only with the layer immediately below it.

This separation improves maintainability and testing.

---

# 10. Database Architecture

The application uses a dual-database SQLite architecture for per-project data isolation.

Database Principles

- Offline-first
- Relational design
- Foreign key support
- Repository Pattern
- Transaction support
- Per-project database isolation

Dual-Database Model

Global DB (`accc_global.db`) — 4 Tables:
- Projects — list of all projects (name, district, division, client, DBPath)
- Divisions — division master data
- Districts — district master data
- Blocks — block master data

Project DB (`Projects/<ProjectName>/inspection.db`) — 17+ Tables per project:
- InspectionTemplates
- InspectionSections (with IsDefault flag for built-in vs custom)
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

Each project database is created with full seed data (default template, sections, fields, options, device options) at project creation time.

ProjectDBManager handles creating, opening, and deleting project databases.

Connection Management (`db.ts`)

The app uses a **sequential open/close model** with a single `SQLiteDatabase` handle to avoid expo-sqlite Android bugs where multiple simultaneous connections return handles to the wrong database file.

- **Single handle**: Only one `SQLiteDatabase` handle is ever open at a time. `currentDbTarget` tracks which DB file is currently open (`"accc_global.db"` or a project path).
- **Global-only state**: When `activeProjectPath` is null, `getDatabase()` returns the global DB (`accc_global.db`).
- **Project-active state** (`setActiveProject`): `activeProjectPath` is set. The current DB is closed and the project DB is opened. `getDatabase()` returns the project DB.
- **Switching**: `ensureGlobalDb()` and `ensureProjectDb()` only close+reopen when the requested DB differs from `currentDbTarget`. No redundant switches.
- **`cleanPath()`**: Strips `file://` URI prefix before path comparison to avoid mismatches between `activeProjectPath` (which may include `file://`) and `currentDbTarget` (which never does).
- Project DBs use WAL journal mode. The global DB uses DELETE journal mode.
- PRAGMA configuration failures are caught silently — the database remains usable with SQLite defaults.
- `getInfoAsync` from expo-file-system is **not used** for SQLite `.db` files — it returns false negatives on Android (reports files as non-existent right after `closeAsync()`). Project DB validation uses `SELECT COUNT(*) FROM sqlite_master` instead.

---

# 11. Entity Relationships

The current high-level relationship model is:

Global DB:

```
Divisions ──────▶ Projects ◀────── Districts
                        │
                        ▼
                  (project link)
```

Project DB:

```
InspectionTemplates
       │
       ▼
InspectionSections
       │
       ▼
InspectionFields
       │
       ▲
       │
InspectionValues
       │
       ├──────────────┐
       ▼              ▼
Inspections    RepeatableGroups
       │              │
       ├──────┐       ▼
       ▼      ▼  RepeatableValues
    Cameras  Switches
       │
       ▼
    Photos

DeviceOptions ──▶ (standalone config, read by CameraSection/SwitchSection)
```

InspectionDevices are associated with an Inspection and store device-level information.

DeviceOptions is a standalone configuration table that provides dropdown values to CameraSection and SwitchSection components at runtime.

Future versions may extend these relationships while preserving compatibility with existing inspection data.

---

# 12. Repository Layer

Repositories provide the only approved mechanism for database access.

Responsibilities

- Insert records
- Update records
- Delete records
- Execute queries
- Return strongly typed models

Advantages

- Centralized database logic
- Easier debugging
- Improved testability
- Cleaner UI code

UI components should never execute SQL directly.

---

# 13. Models

Models define the application's data structures.

Examples

Project

District

Inspection

InspectionField

InspectionPhoto

InspectionValue

DeviceOption

Each model maps to a database entity and is used throughout the application to ensure consistent typing.

---

# 14. Data Flow

The standard flow for user actions is:

```
User Action

↓

Screen

↓

Component

↓

Context

↓

Repository

↓

SQLite

↓

Repository

↓

Context

↓

UI Refresh
```

This predictable flow keeps business logic separate from presentation and storage.

---

# 15. Coding Standards

The architecture follows these standards:

- TypeScript only.
- One responsibility per file.
- Repositories handle database operations.
- Components remain reusable.
- Context manages shared state.
- No SQL inside UI components.
- Strong typing for all models.
- Modular folder structure.
- Avoid duplicate code.
- Prefer composition over inheritance.
- DB-driven device options (never hardcoded dropdown arrays in components).
- Per-Project DB isolation (project data never mixes between projects).

These standards should be followed consistently throughout the project.

# 16. Database Design

The ACCC Dynamic Inspection Platform uses SQLite as its embedded relational database. The database is designed to support offline operation, configurable inspection templates, and future expansion.

## Design Principles

- Offline-first architecture
- Relational database design
- Repository Pattern
- Foreign key relationships
- Transaction support
- Auto-generated primary keys
- Strong data integrity

---

## Core Tables

### Projects

Stores all projects available for inspection.

Primary Information

- ProjectID
- ProjectName
- DistrictID
- Block
- Client
- Description
- InspectorName
- DBPath (path to the project's isolated inspection.db)
- CreatedAt
- UpdatedAt

Relationship

```
Project
    │
    ▼
Inspection
```

---

### Districts

Stores district information.

Fields

- DistrictID
- DistrictName

---

### Inspections

Stores one inspection record.

Fields include

- InspectionID
- ProjectID
- DistrictID
- PoleID
- Status
- Inspection Date
- Latitude (REAL)
- Longitude (REAL)
- InspectorName
- Remarks
- SyncStatus
- CreatedAt
- UpdatedAt
- SectionsSnapshot (TEXT — deprecated, section config now read live from DB)

Each inspection acts as the parent record for all captured information.

---

### InspectionTemplates

Defines available inspection templates.

Examples

Pole Inspection

Future

NVR Inspection

Solar Inspection

UPS Inspection

Traffic Signal Inspection

---

### InspectionSections

Defines sections inside a template.

Example

General Information

Pole Structure

Camera

Switch

Photos

Settings

Sections are ordered using DisplayOrder.

IsDefault column (INTEGER, default 0): The original 10 built-in sections are marked with IsDefault=1. Only default sections appear in inspection forms. Custom sections created by administrators are stored with IsDefault=0 and are hidden from inspection forms but visible in the admin Sections screen.

---

### InspectionFields

Defines every field rendered in the inspection.

Example

Pole ID

Latitude

Longitude

Camera Make

Camera Model

Serial Number

Remarks

Each field includes

- Field Name
- Field Type
- Default Value
- Placeholder
- Validation Rule
- Display Order
- Visibility

---

### InspectionValues

Stores user-entered inspection values.

This separates the form definition from captured inspection data.

Advantages

- Dynamic forms
- Template reuse
- Easy reporting

---

### Cameras

Stores camera-specific information associated with an inspection.

Fields include

- CameraID
- InspectionID
- CameraNo
- CameraType
- CameraStatus
- CameraMake
- CameraModel
- CameraIP
- CameraSerialNumber
- CameraSI
- SDCardCapacity
- SDCardStatus

### Switches

Stores switch-specific information associated with an inspection.

Fields include

- SwitchID
- InspectionID
- SwitchNo
- SwitchType
- SwitchStatus
- SwitchMake
- SwitchModel
- SwitchIP
- SwitchSerialNumber
- SwitchSI

### Photos

Stores photo metadata.

Information includes

- PhotoID
- InspectionID
- PhotoType
- FileName
- FilePath
- Latitude
- Longitude
- CapturedAt
- Remarks

### DeviceOptions

Stores configurable dropdown options for camera and switch device fields.

Fields include

- OptionID (INTEGER PRIMARY KEY AUTOINCREMENT)
- DeviceType (TEXT — 'Camera' or 'Switch')
- FieldName (TEXT — e.g., 'CameraType', 'CameraStatus', 'CameraMake', 'CameraSI', 'SDCardCapacity', 'SwitchType', 'SwitchStatus', 'SwitchMake', 'SwitchSI')
- OptionLabel (TEXT — display label shown in dropdown)
- OptionValue (TEXT — stored value saved to inspection)
- DisplayOrder (INTEGER — controls dropdown option order)
- IsActive (INTEGER — 1 = active, 0 = inactive)

This table replaces hardcoded dropdown arrays in CameraSection and SwitchSection components.

---

# 17. Entity Relationship Diagram

Current logical relationship

Global DB:

```
Divisions ──────▶ Projects ◀────── Districts
```

Project DB:

```
InspectionTemplates
       │
       ▼
InspectionSections
       │
       ▼
InspectionFields
       │
       ▲
       │
InspectionValues
       │
       ├──────────────┐
       ▼              ▼
Inspections    RepeatableGroups
       │              │
       ├──────┐       ▼
       ▼      ▼  RepeatableValues
    Cameras  Switches
       │
       ▼
    Photos

DeviceOptions ──▶ (standalone config, read by CameraSection/SwitchSection)
```

The design supports configurable inspection forms while maintaining a normalized database structure. Each project database is fully isolated with its own complete schema and seed data.

---

# 18. Dynamic Form Engine

The Dynamic Form Engine is the core architectural component of the platform.

Instead of hardcoding forms, the application constructs inspection screens using configuration stored in SQLite.

Workflow

```
Load Template

↓

Load Sections (default sections only — IsDefault=1)

↓

Load Fields

↓

Sort by Display Order

↓

Render UI

↓

Capture Input

↓

Auto Save

↓

SQLite
```

Device Options Loading

CameraSection and SwitchSection load dropdown options from DeviceOptionsRepository at mount time:

1. Query DeviceOptions table for active options matching the device type and field name.
2. If options exist, populate dropdowns from the database.
3. If the DeviceOptions table is empty, fall back to hardcoded default arrays for backward compatibility.

This ensures the application works out of the box while allowing full admin configurability.

Pole ID Lock

SectionRenderer maintains a `poleIdLoaded` state and waits for the pole ID to be loaded from the database before determining the form lock state. This prevents false "please enter pole id" messages on sections before the pole ID value has been read.

Advantages

- No hardcoded inspection forms
- New templates require minimal code changes
- Device options are admin-configurable without code changes
- Easy maintenance
- Consistent UI
- Future extensibility

---

# 19. Auto Save Workflow

The platform automatically saves user input.

Workflow

```
User edits field

↓

Value changes

↓

Repository

↓

SQLite

↓

UI updated
```

Note: Auto-save occurs directly without a validation step. Validation happens separately when the user saves or exits the inspection.

Benefits

- Prevents data loss
- Eliminates manual Save buttons
- Better field experience
- Faster inspections

---

# 20. Photo Capture Workflow

Photo management is integrated directly into inspections.

Workflow

```
Request Camera Permission

↓

Request GPS Permission

↓

Open Camera (expo-image-picker)

↓

Capture Photo

↓

Get GPS Coordinates

↓

Read Pole ID + Block from DB

↓

Generate Filename (District_Block_PoleId_DDMMMYYYY_Time.jpg)

↓

Save to App Document Directory

↓

Save Metadata to Photos Table

↓

Burn Watermark via ViewShot (Pole ID, District+Block, GPS, Timestamp)

↓

Save Watermarked Photo to Gallery (async)

↓

Copy to Download/Inspection/{District}/ folder
```

Implemented Features

- Green watermark (#76FF03) on light black background
- Watermark burned into gallery photos via react-native-view-shot
- Pole ID and Block read fresh from DB before every capture
- Photos saved to device gallery and app Download folder
- Minimum 1 photo required for inspection validation

---

# 21. GPS Workflow

The application captures location information during inspections.

Workflow

```
Request Permission

↓

GPS Enabled

↓

Capture Latitude

↓

Capture Longitude

↓

Timestamp

↓

Save to Database
```

Future enhancements

- Reverse Geocoding
- Accuracy
- Altitude
- GIS Integration

---

# 22. Dynamic Device Management

Multiple devices can be inspected within one inspection.

Examples

3 Cameras

2 Switches

Future

4 NVRs

6 UPS Batteries

Dynamic workflow

```
User selects quantity

↓

Application generates device groups

↓

Each group loads configured fields

↓

User enters values

↓

Auto Save
```

Device dropdown options (type, status, make, SI, SD card) are loaded from the DeviceOptions database table rather than hardcoded. This allows administrators to add, edit, reorder, and remove options from the Settings screen without modifying source code.

This architecture avoids creating separate screens for every possible device.

---

# 23. Navigation Flow

Current application flow

```
Splash

↓

Project List (Home Screen — index.tsx)

↓
┌─────────────────┬──────────────────┐
↓                 ↓                  ↓
New Project    Open Project      Edit/Clone/Export/Delete
                ↓
         Project Dashboard

                ↓

         New Inspection

                ↓

         General Information

                ↓

         Pole Structure / Camera / Switch / ...

                ↓

         Photos

                ↓

         Save / Complete
```

Settings navigation

```
Dashboard

↓

Settings

↓

Sections (list/create/edit/reorder)

↓

Fields (list/create/edit/reorder)

↓

Options (list/create/edit/reorder for dropdown fields)

Camera Options (list/create/edit/reorder)

Switch Options (list/create/edit/reorder)

Export Template (JSON)

Import Template (JSON)
```

---

# 24. State Management

The application uses React Context (InspectionContext).

Current state

- project (Project data)
- inspectionDate (Current inspection date)
- inspectionId (Current inspection ID)
- poleId (Current pole ID)
- openProject() — opens a project DB and sets it as active
- closeProject() — closes the active project DB
- removeProject() — closes and deletes a project DB

Repositories remain responsible for database access.

---

# 25. Error Handling Strategy

Errors are categorized into

Database Errors

GPS Errors

Camera Errors

Permission Errors

Validation Errors

Storage Errors

The application logs technical details while presenting user-friendly messages.

---

# 26. Future Cloud Architecture

The current application is fully offline.

Future architecture

```
SQLite

↓

Sync Queue

↓

REST API

↓

Cloud Database

↓

Dashboard

↓

Reports
```

Synchronization Principles

- Offline-first
- Incremental uploads
- Conflict resolution
- Retry mechanism
- Secure communication

---

# 27. Extension Strategy

The platform is designed for long-term growth.

Future inspection modules

- Pole Inspection
- NVR Inspection
- UPS Inspection
- Solar Inspection
- OFC Inspection
- Data Centre Inspection
- Smart Pole Inspection
- Control Room Inspection

New modules should primarily require configuration rather than significant code changes.

---

# 28. Architecture Summary

The ACCC Dynamic Inspection Platform is built on the following principles:

- Offline-first
- SQLite persistence
- Repository Pattern
- React Context
- Configuration-driven forms
- DB-driven device options
- Per-Project Database Isolation
- Reusable components
- Strong typing with TypeScript
- Modular folder structure
- Extensible architecture
- Future-ready for cloud synchronization

This architecture provides a stable foundation for both current functionality and planned future enhancements.
