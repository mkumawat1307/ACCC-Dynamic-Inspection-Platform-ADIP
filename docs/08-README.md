# ACCC Dynamic Inspection Platform (ADIP)

> Offline-First | Configuration-Driven | Android Inspection Platform

![Platform](https://img.shields.io/badge/Platform-Android-green)
![Framework](https://img.shields.io/badge/Framework-React%20Native-blue)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-black)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)
![Database](https://img.shields.io/badge/Database-SQLite-orange)
![Architecture](https://img.shields.io/badge/Architecture-Offline%20First-success)
![Status](https://img.shields.io/badge/Status-Active%20Development-yellow)
![Version](https://img.shields.io/badge/Version-1.8.1-blue)

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

---

# Key Features

## Dashboard

- Inspection statistics
- Recent inspections
- Search
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

---

## Dynamic Forms

- Inspection Templates
- Dynamic Sections
- Dynamic Fields
- Configurable Validation
- Display Order

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

---

## Device Options (Admin Configurable)

- Camera type, status, make, model, IP options configurable from Settings
- Switch type, status, make, model, IP options configurable from Settings
- Options loaded from database (DeviceOptions table)
- No code changes needed to modify dropdown values

---

## Template Import/Export

- Export templates to JSON format
- Import templates from JSON files
- Self-contained JSON with all template, section, field, and option data
- Uses expo-document-picker and expo-sharing

---

## Project Management

- Create, Edit, Delete projects
- Delete confirmation dialog with warning
- Project-wise CSV Export from project dashboard

---

## GPS

- Latitude
- Longitude
- Timestamp

---

## Photos

- Camera Integration
- Local Storage
- Metadata
- Green Watermark (Pole ID, District, GPS, Timestamp)
- Gallery Save
- Download Folder Save
- GPS Mandatory
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
| Platform | Expo |
| Language | TypeScript |
| Database | SQLite |
| Navigation | Expo Router |
| State | React Context |
| Camera | Expo Image Picker |
| Location | Expo Location |
| Gallery | Expo Media Library |
| Watermark | react-native-view-shot |
| Document Picker | expo-document-picker |
| Sharing | expo-sharing |

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

SQLite
```

---

# Folder Structure

```
frontend/

app/

src/

components/

context/

database/

hooks/

models/

utils/

assets/
```

---

# Database

Core tables (18):

- Projects
- Districts
- Blocks
- Divisions
- Inspections
- InspectionTemplates
- InspectionSections
- InspectionFields
- FieldOptions
- InspectionValues
- RepeatableGroups
- RepeatableGroupFields
- RepeatableRecords
- RepeatableValues
- Cameras
- Switches
- Photos
- DeviceOptions

---

# New Files (v1.5)

- app/settings/device-options.tsx — Device Options admin screen
- src/database/repositories/DeviceOptionsRepository.ts — DeviceOptions CRUD
- src/database/tables/device-options.table.ts — DeviceOptions table definition
- src/database/seeds/device-options.seed.ts — DeviceOptions seed data
- src/utils/exportData.ts — CSV export utilities
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

Camera

↓

Switch

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

---

# Installation

## Prerequisites

- Node.js
- npm
- Expo CLI
- Android Studio
- Git

---

## Clone Repository

```bash
git clone <repository-url>
cd ACCC-Pole-Inspection-App
```

---

## Install Dependencies

```bash
npm install
```

---

## Start Development Server

```bash
npx expo start
```

---

## Run Android

```bash
npx expo run:android
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

Refer to **03-Rules.md** for complete standards.

---

# Roadmap

Current Phase

Administration Panel Complete (v1.4)
Device Options DB-Driven + Template Import/Export + Project Management (v1.5)
Per-Project Database Isolation (v1.8)
App Rename + Bug Fixes (v1.8.1)

Upcoming

- Reporting (PDF + Excel)
- Cloud Synchronization
- AI Features

---

# Version

Current Version

1.8.1

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
