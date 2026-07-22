# ACCC Pole Inspection App

## Overview

The ACCC Pole Inspection App is an offline-first Android inspection application built using **React Native (Expo)** and **SQLite**.

The application is designed for field engineers performing physical inspections of surveillance infrastructure such as poles, cameras, switches, junction boxes, earthing systems, and metering equipment.

The app works completely offline and stores all inspection data locally on the device.

---

# Features

## General Information

- Auto Inspection Date
- Division
- District
- Block
- Pole ID
- Address
- GPS Latitude
- GPS Longitude
- Get Current Location button

---

## Pole Structure

- Foundation Condition
- Pole Availability
- Pole SI
- Pole Status

---

## Junction Box

- Junction Box Status
- Power Cable Availability
- Cable Status
- Cable Length

---

## Earthing

- Earthing Wire
- Earthing Chamber
- Earthing Cover
- Earthing Voltage

---

## Metering

- Meter Box Status
- Meter Status
- Meter Power Status
- Meter Serial Number

---

## Connectivity

- Fiber
- RF
- Local
- No Connectivity

---

## Dynamic Device Sections

The application supports dynamic device expansion.

### Camera

User enters:

```
Camera Count = 4
```

The application automatically creates

- Camera 1
- Camera 2
- Camera 3
- Camera 4

Each camera contains

- Type
- Status
- Make
- Model
- IP
- Serial Number
- SI
- SD Card Capacity
- SD Card Status

---

### Switch

User enters

```
Switch Count = 2
```

The application automatically creates

- Switch 1
- Switch 2

Each switch contains

- Type
- Status
- Make
- Model
- IP
- Serial Number
- SI

---

## Remarks

- Pole Category
- Remarks

---

## Photos

Unlimited photos per inspection.

Features planned

- Camera capture
- Gallery
- Delete photo
- Automatic watermark
- Automatic filename

Example filename

```
District_Block_PoleID_YYYYMMDD_HHMMSS.jpg
```

Example

```
Jaipur_Mansarovar_PL00125_20260722_183015.jpg
```

---

# Offline Database

SQLite is used for local storage.

Current modules include

- Projects
- Inspections
- Dynamic Fields
- Inspection Values

Future modules

- Photos
- Reports
- Sync Queue

---

# Inspection Workflow

```
Project

    ↓

Inspection List

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

Complete Inspection
```

---

# Dynamic Inspection Engine

The inspection form is database-driven.

## Inspection Mode

Field engineers only enter inspection values.

Examples

- Status
- Serial Number
- Remarks
- Photos

---

## Configuration Mode

Administrators can modify the inspection template without changing source code.

Supported operations

- Add Section
- Remove Section
- Add New Field
- Remove Field
- Add Device Types
- Modify Dropdown Options

Future device types will automatically support quantity-based expansion.

---

# Current Features

- Offline SQLite
- Auto Save
- Duplicate Pole ID Detection
- Edit Existing Inspection
- GPS Location
- Dynamic Field Rendering
- Dynamic Device Expansion
- Search Inspection
- Delete Single Inspection
- Delete Multiple Inspections
- Draft & Completed Status
- Configuration Driven Forms

---

# Technology Stack

Frontend

- React Native
- Expo
- TypeScript

Database

- SQLite

Navigation

- Expo Router

UI

- React Native Paper

Location

- Expo Location

---

# Future Roadmap

- Photo Module
- Automatic Watermark
- PDF Report
- Excel Export
- Search by GPS
- Dashboard
- Sync Module
- User Roles
- Template Builder
- Backup & Restore

---

# Project Goal

Build a professional offline inspection platform where inspection templates can evolve without requiring application code changes.

The application should support future inspection types by configuring templates instead of modifying source code.