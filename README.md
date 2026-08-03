# ACCC Dynamic Inspection Platform (ADIP)

> Offline-First | Configuration-Driven | Android Inspection Platform

![Platform](https://img.shields.io/badge/Platform-Android-green)
![Framework](https://img.shields.io/badge/Framework-React%20Native-blue)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-black)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)
![Database](https://img.shields.io/badge/Database-SQLite-orange)
![Architecture](https://img.shields.io/badge/Architecture-Offline%20First-success)
![Status](https://img.shields.io/badge/Status-Active%20Development-yellow)
![Version](https://img.shields.io/badge/Version-1.9.1-blue)

---

# Overview

The **ACCC Dynamic Inspection Platform (ADIP)** is a professional Android application developed to digitize field inspections for Smart City infrastructure.

The platform is designed around an **Offline-First** and **Configuration-Driven** architecture, allowing inspectors to work without internet connectivity while supporting multiple inspection types through reusable templates.

The initial implementation focuses on **Pole Inspection**, with the architecture prepared for future inspection modules such as:

- Pole Inspection
- NVR Inspection
- UPS Inspection
- Solar Inspection
- OFC Inspection
- Media Converter Inspection
- Traffic Signal Inspection
- Control Room Inspection

---

# Project Goals

The platform aims to:

- Replace paper-based inspections.
- Reduce manual data entry.
- Improve inspection quality.
- Capture GPS automatically.
- Capture inspection photographs.
- Support offline inspections.
- Generate professional reports.
- Support configurable inspection templates.
- Enable admin-configurable device options without code changes.
- Provide a configurable Smart Dashboard per project.

---

# Key Features

## Dashboard

- Smart Dashboard with configurable statistic cards
- Smart Card Generator (auto-creates cards from inspection form fields)
- Dashboard Card Manager (add/edit/delete/reorder/enable/disable cards)
- Auto-refresh on data changes, app foreground, midnight, and 60s interval
- Search
- Recent inspections
- Project overview

---

## Inspection Engine

- Create Inspection
- Edit Inspection
- Delete Inspection
- Draft Support
- Auto Save
- Duplicate Pole Detection
- Pole ID Lock (waits for DB before locking)
- Section IsDefault Filtering (only default sections in inspections)
- Block name shown on each inspection card
- Search by Pole ID, Division, District, and Block

---

## Dynamic Forms

- Inspection Templates
- Dynamic Sections
- Dynamic Fields
- Configurable Validation
- Display Order
- 10 field types

---

## Administration Panel

- Template Management (list, create, edit, delete)
- Section Management (list, create, edit, delete, reorder)
- Field Management (list, create, edit, delete, reorder)
- 10 field types
- Field Options / Dropdown Management
- Section reorder, Field reorder, Option reorder
- Section repeatable and visibility toggles
- Section IsDefault toggle
- Field required/visible/readOnly toggles
- Device Types Management (create/edit/delete device types and their fields)
- Device Options Management (Camera/Switch dropdown configuration)
- Photos section locked (cannot be edited, reordered, or deleted)
- Reset to Default button (restores original inspection form)

---

## Device Types (Admin Configurable)

- Custom device type creation (Camera, Switch, and future types)
- Per-type field management (text, dropdown, number, date, checkbox)
- Dropdown options loaded from database (DeviceOptions table)
- No code changes needed to add new device types
- Per-project device type enable/disable toggle
- Generic DeviceSection component renders any configured device type

---

## Template Import/Export

- Export templates to JSON format (v2.0: includes device types, device options, project device type mappings)
- Import templates from JSON files
- Replace-in-place import (preserves existing inspection data)
- v1.0 backward compatibility
- Uses expo-document-picker and expo-sharing

---

## Project Management

- Create, Edit, Delete, Clone projects
- Delete confirmation dialog with warning
- Project export from the Reports screen (CSV/Excel/PDF)

---

## Reports & Export

- Reports screen with live banded table preview
- Project-wide export: CSV, Excel (xlsx), PDF
- Banded headers (section groups) across all three formats
- Single-inspection export (PDF/Excel/CSV) from the Inspection List
- Derived Latitude/Longitude, Status, and Photos-count columns
- Device rows included in reports

---

## GPS

- Latitude
- Longitude
- Timestamp

---

## Photos

- Camera Integration
- Local Storage (in project folder)
- Metadata
- Green Watermark (Pole ID, District, GPS, Timestamp)
- Watermark Burn-In (react-native-view-shot, on-screen)
- Gallery Save
- Download Folder Save
- GPS Mandatory for Photo Capture
- Minimum 1 Photo Required

---

## Offline First

The application works without internet.

SQLite stores all operational data locally.

Future synchronization will upload inspection data to the cloud.

---

# Technology Stack

| Layer | Technology |
|---------|------------|
| Framework | React Native |
| Platform | Expo SDK 54 |
| Language | TypeScript |
| Database | SQLite (dual-database: global + per-project) |
| Navigation | Expo Router |
| State | React Context |
| UI Library | React Native Paper |
| Dropdown | React Native Element Dropdown |
| Camera | Expo Image Picker |
| Location | Expo Location |
| Gallery | Expo Media Library |
| Watermark | react-native-view-shot |
| Document Picker | expo-document-picker |
| Sharing | expo-sharing |
| Spreadsheet (xlsx) | SheetJS (xlsx) |
| PDF | expo-sharing (HTML-based) |
| Build Tool | Gradle (Android) |
| Package Manager | Yarn 1.22 |

---

# Architecture

The application follows a layered architecture.

```
UI
↓
Components
↓
Context
↓
Repositories
↓
SQLite (Global DB or Project DB)
```

---

# Folder Structure

```
frontend/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout with InspectionProvider
│   ├── index.tsx                 # Home screen — project list
│   ├── +html.tsx                 # HTML root wrapper
│   ├── projects/
│   │   ├── new.tsx               # New/Edit project
│   │   └── dashboard.tsx         # Per-project dashboard
│   ├── projects/
│   │   └── dashboard-settings.tsx # Dashboard card configuration
│   ├── inspection/
│   │   ├── new.tsx               # New inspection form
│   │   ├── edit.tsx              # Edit inspection
│   │   └── index.tsx             # Inspection list
│   ├── reports/
│   │   └── index.tsx             # Reports screen
│   └── settings/
│       ├── index.tsx             # Settings main screen
│       ├── sections.tsx          # Section management
│       ├── fields.tsx            # Field management
│       ├── options.tsx           # Dropdown option management
│       ├── device-types.tsx      # Device type management
│       └── device-options.tsx    # Device option management
├── src/
│   ├── components/               # Reusable UI components
│   │   ├── inspection/           # Inspection form components
│   │   ├── dashboard/            # Dashboard components
│   │   ├── reports/              # Report components
│   │   └── projects/             # Project components
│   ├── context/
│   │   └── InspectionContext.tsx # Shared inspection state
│   ├── database/
│   │   ├── db.ts                 # SQLite connection manager (sequential open/close)
│   │   ├── schema.ts             # DDL — global + project schema + migrations
│   │   ├── seed.ts               # Seed orchestrator
│   │   ├── DatabaseService.ts    # Startup initialization
│   │   ├── tables/               # CREATE TABLE definitions
│   │   ├── seeds/                # Idempotent seed data
│   │   ├── repositories/         # Repository Pattern (20+ repos)
│   │   └── helpers/
│   │       └── ProjectDBManager.ts # Create/open/delete/clone project DBs
│   ├── hooks/                    # Reusable React hooks
│   ├── models/                   # TypeScript interfaces (8 models)
│   ├── utils/                    # Utility functions
│   └── constants/                # UI constants
├── assets/                       # Images, fonts
├── android/                      # Android native project
├── docs/                         # Project documentation
├── __mocks__/                    # Jest mocks
├── package.json
├── tsconfig.json
├── app.json
└── jest.config.js
```

---

# Database

## Global DB (`accc_global.db`) — 4 tables

- Projects
- Divisions
- Districts
- Blocks

## Project DB (`Projects/<ProjectName>/inspection.db`) — 20+ tables

- InspectionTemplates
- InspectionSections (with IsDefault flag)
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

---

# New Files (v1.9.1)

- app/projects/dashboard-settings.tsx — Dashboard card configuration screen
- src/components/dashboard/DashboardCardManager.tsx — Smart Add Card flow
- src/components/dashboard/DashboardCardGrid.tsx — Grid with auto-refresh
- src/components/dashboard/StatBreakdownCard.tsx — Breakdown rows card
- src/database/repositories/SmartCardGenerator.ts — Auto-creates cards from form fields
- src/database/repositories/StatisticCountService.ts — Generic count engine
- src/database/repositories/DashboardService.ts — Composes card counts
- src/database/repositories/DashboardCardRepository.ts — Dashboard card CRUD
- src/database/tables/dashboard-cards.table.ts — DashboardCards table
- src/database/seeds/dashboard-cards.seed.ts — Default cards
- src/utils/InspectionDataBus.ts — Pub/sub event bus
- src/hooks/useDashboardAutoRefresh.ts — Auto-refresh hook
- src/hooks/useSectionCollapse.ts — Collapsed section state persistence
- src/constants/ui.ts — Design tokens

# New Files (v1.9.0)

- app/reports/index.tsx — Reports screen
- src/components/reports/ReportTablePreview.tsx — banded table preview
- src/utils/exportData.ts — unified export service

# New Files (v1.5)

- app/settings/device-options.tsx — Device Options admin screen
- src/database/repositories/DeviceOptionsRepository.ts — DeviceOptions CRUD
- src/database/tables/device-options.table.ts — DeviceOptions table
- src/database/seeds/device-options.seed.ts — DeviceOptions seed data
- src/utils/templateData.ts — Template JSON import/export utilities

---

# Inspection Workflow

```
Dashboard
↓
Project
↓
New Inspection
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
Camera / Switch / Custom Devices
↓
Remarks
↓
Photos
↓
Complete
```

Only sections marked with IsDefault = 1 appear in the inspection form.

---

# Documentation

The project documentation is located in the **docs/** folder.

| Document | Purpose |
|----------|---------|
| 01-PRD.md | Product Requirements |
| 02-Architecture.md | Technical Architecture |
| 03-Rules.md | Development Rules |
| 04-Phases.md | Roadmap |
| 05-Design.md | UI Design System |
| 06-Memory.md | AI Project Memory |
| 07-Changelog.md | Release History |
| 08-README.md | Project Guide |
| 09-Decisions.md | Architecture Decisions |
| 10-DATABASE_ARCHITECTURE.md | Database Architecture |

---

# Installation

## Prerequisites

- Node.js
- Yarn 1.22
- Expo CLI
- Android Studio
- Git

---

## Clone Repository

```bash
git clone <repository-url>
cd "ACCC inspection"
```

---

## Install Dependencies

```bash
yarn install
```

---

## Start Development Server

```bash
yarn start
```

---

## Run Android

```bash
yarn android
```

---

# Development Rules

- TypeScript only.
- SQLite only.
- Repository Pattern.
- React Context.
- Offline First.
- Reusable Components.
- Configuration-Driven Forms.
- Auto Save.
- No SQL inside UI components.
- Sequential SQLite connection model (single handle).
- Per-project database isolation.

Refer to **03-Rules.md** for complete standards.

---

# Roadmap

Current Phase

- Administration Panel Complete (v1.4)
- Device Options DB-Driven + Template Import/Export + Project Management (v1.5)
- Per-Project Database Isolation (v1.8)
- App Rename + Bug Fixes (v1.8.1)
- Reports & Export v2 (v1.9.0)
- Smart Dashboard (v1.9.1)

Upcoming

- Cloud Synchronization
- AI Features
- Analytics Dashboard
- Photo Reports

---

# Version

Current Version

1.9.1 (Unreleased)

Status

Active Development

---

# Contributing

Before contributing:

1. Read **03-Rules.md**
2. Read **02-Architecture.md**
3. Read **06-Memory.md**

Follow the documented coding standards.

---

# License

Private Project

All rights reserved.

---

# Author

**Manish Kumawat**

Senior Consultant

Cyber Risk Advisory

---

# Acknowledgements

Built using:

- React Native
- Expo
- TypeScript
- SQLite

Designed for Smart City infrastructure inspections.

---

# Future Vision

The long-term vision is to evolve ADIP into a configurable inspection platform capable of supporting multiple infrastructure domains through reusable templates, dynamic forms, offline data collection, cloud synchronization, and AI-assisted inspections.
