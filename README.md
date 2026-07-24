# ACCC Pole Inspection App

## Overview

The ACCC Pole Inspection App is an offline-first Android inspection application developed using React Native (Expo) and SQLite.

It is designed for physical inspection of Smart City surveillance infrastructure including poles, cameras, switches, junction boxes, earthing systems, metering equipment, and future configurable assets.

Unlike traditional inspection applications, this project is built as a dynamic inspection platform where inspection templates, sections, assets, and fields can be configured without modifying application source code.

---

## Key Features

- **Offline First** — Works without internet, all data stored locally
- **SQLite Database** — 17+ tables with seed-based template engine
- **Automatic Save** — Debounced 500ms auto-save on every field change
- **Duplicate Pole Detection** — Checks existing inspections before creating
- **GPS Integration** — Mandatory GPS for photo capture, manual button in General Info
- **Dynamic Inspection Forms** — 10 configurable sections with 42+ fields
- **Dynamic Asset Expansion** — Camera/Switch count drives dynamic row rendering
- **Unlimited Photos** — Camera capture with GPS stamp and green watermark
- **Automatic Photo Naming** — District_Block_PoleId_Date_Time format
- **Green Watermark Overlay** — Pole ID, district, block, GPS, timestamp on every photo
- **Gallery Save** — Photos automatically saved to device gallery
- **Form Locking** — Sections locked until Pole ID entered
- **PDF Report Generation** (Planned)
- **Excel Export** (Planned)

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native (Expo) |
| Language | TypeScript |
| Navigation | Expo Router |
| UI Components | React Native Paper, react-native-element-dropdown |
| Camera | expo-image-picker |
| Location | expo-location |
| File Storage | expo-file-system |
| Gallery | expo-media-library |
| Database | SQLite (expo-sqlite) |
| Architecture | Repository Pattern, Context API |

---

## Inspection Sections

| # | Section | Fields | Required |
|---|---------|--------|----------|
| I | General Information | 7 (Date, Division, District, Block, Pole ID, Location, GPS) | Date, Division, District, Pole ID, GPS |
| II | Pole Structure Details | 4 (Foundation, Availability, SI, Status) | Foundation, Availability |
| III | Junction Box & Cabling | 4 (JB Status, Power Cable, Cable Status, Cable Length) | JB Status |
| IV | Earthing Details | 4 (Wire, Chamber, Cover, Voltage) | — |
| V | Metering Information | 4 (Box Status, Meter Status, Power Status, Serial) | — |
| VI | Connectivity Information | 1 (Connectivity Type) | — |
| VII | Camera Information | 1 + N dynamic rows (Count, Type, Status, Make, Model, IP, Serial, SI, SD) | Count, Type, Status |
| VIII | Switch Information | 1 + N dynamic rows (Count, Type, Status, Make, Model, IP, Serial, SI) | Count |
| IX | Categorization & Remarks | 2 (Category, Remarks) | — |
| X | Photos | Unlimited photos | Min 1 photo |

---

## Camera Options

| Field | Options |
|-------|---------|
| Type | Bullet, Box, PTZ |
| Status | VMS, Local, Non-Live, In Stock, Dismantled, Not Verified |
| Make | Sparsh, Prama, Hikvision, CP Plus, Secura |
| SI | Technosys (LSY), TCIL (LSY), TCIL (RC), TCIL (Smart City), TASL (Technosys) |
| SD Card Capacity | 64 GB, 128 GB, 256 GB, Not Verified |
| SD Card Status | Working, Not Working, Not Verified |

## Switch Options

| Field | Options |
|-------|---------|
| Type | 4-Port, 8-Port |
| Status | VMS, Local, Non-Live, In Stock, Dismantled, Not Verified |
| Make | D-Link, Cisco, Allied, Tejas |
| SI | Technosys (LSY), TCIL (LSY), TCIL (RC), TCIL (Smart City), TASL (Technosys) |

---

## Current Workflow

```
App -> Projects -> Create Project -> Project Dashboard

Project Dashboard
├── Dashboard (stats)
├── Inspection (list/create/edit)
├── Reports (planned)
├── Settings
└── Inspection Settings (admin)
```

### Inspection Flow

```
Dashboard
  -> Select/Create Project
    -> New Inspection (creates draft)
      -> Load Project (auto-fill division, district)
        -> Section I: General Information
          -> Enter Pole ID (unlocks rest of form)
          -> Capture GPS (manual button, validated on save)
          -> Auto-save field values (debounced 500ms)
        -> Sections II-IX: Dynamic sections
          -> Load fields from InspectionFields table
          -> Load dropdown options from FieldOptions table
          -> Auto-save on field change
          -> Camera/Switch count triggers dynamic row expansion
        -> Section X: Photos
          -> Capture photos (GPS mandatory)
          -> Green watermark overlay on gallery view
          -> Saved to device gallery
      -> Save (validates required fields + GPS + min 1 photo)
      -> Back button validates before exit
```

---

## Project Structure

```
frontend/
  app/
    _layout.tsx                    # Root layout, DB init on mount
    index.tsx                      # Home screen
    dashboard.tsx                  # Main dashboard
    projects/
      new.tsx                      # Create new project
      dashboard.tsx                # Project list / selection
    inspection/
      new.tsx                      # New inspection form (10 sections)
      index.tsx                    # Inspection list
      edit.tsx                     # Edit existing inspection
    reports/
      index.tsx                    # Reports (planned)
    settings/
      index.tsx                    # App settings
      sections.tsx                 # Admin section management

  src/
    components/inspection/
      GeneralInformation.tsx       # Section I - GPS, auto-fill, pole ID check
      FieldRenderer.tsx            # Universal field renderer (10+ types)
      SectionRenderer.tsx          # Renders fields for any section
      CameraSection.tsx            # Dynamic camera rows (auto-save, data preservation)
      SwitchSection.tsx            # Dynamic switch rows (auto-save, data preservation)
      PhotoSection.tsx             # Photo capture, green watermark, gallery save

    context/
      InspectionContext.tsx        # Global inspection state

    database/
      db.ts                        # SQLite connection
      DatabaseService.ts           # DB init, schema, seeds
      schema.ts                    # CREATE TABLE statements
      seed.ts                      # Runs all seed functions
      seeds/                       # Idempotent seed data
      repositories/                # Repository pattern (CRUD)
      tables/                      # Table definitions
      constants/                   # DB constants

    models/                        # TypeScript interfaces
    utils/                         # Utility functions (date, location)
```

---

## Design Philosophy

The project is configuration driven.

Administrators can modify inspection templates without changing application code.

Supported operations include:
- Add/Rename/Delete Sections
- Add/Rename/Delete Fields
- Configure Dropdown Options
- Set Mandatory Field Flags
- Configure Display Order

---

## Development Rules

1. Never continue with TypeScript errors
2. Every feature must compile before the next one
3. Never rewrite working code
4. Review existing files before changing them
5. Repository Pattern only
6. SQLite first, Offline First
7. No duplicate code
8. One feature at a time
9. Always update documentation after completing a feature

---

## Important Notes

- **Clear app data** is required after changing seed data
- Seeds are idempotent: only insert when target table is empty
- Camera/Switch count fields use **numeric input** (not dropdown)
- GPS is **mandatory** — validated on save and before photo capture
- Photo watermark uses **green color** (#76FF03) on dark green background
- Dropdowns use height 56px for better touch sensitivity on Android
- Camera/Switch data is preserved when count decreases (hidden but retained)
- Auto-save uses 500ms debounce across all sections

---

## Current Version

**1.1** (Development)

---

## Future Roadmap

1. Dashboard — Stats per district, inspection counts, progress charts
2. PDF Reports — Generate inspection report from saved data
3. Excel Reports — Export inspection data to spreadsheet
4. Settings/Admin Panel — Add/edit/delete sections, fields, options
5. Cloud Sync — Queue-based sync when online
6. Backup/Restore — Database export/import
