# ACCC Pole Inspection App

## Overview

The ACCC Pole Inspection App is an offline-first Android inspection application developed using React Native (Expo) and SQLite.

It is designed for physical inspection of Smart City surveillance infrastructure including poles, cameras, switches, junction boxes, earthing systems, metering equipment, and future configurable assets.

Unlike traditional inspection applications, this project is built as a dynamic inspection platform where inspection templates, sections, assets, and fields can be configured without modifying application source code.

---

# Key Features

- Offline First
- SQLite Database
- Automatic Save
- Duplicate Pole Detection
- GPS Integration
- Dynamic Inspection Forms
- Dynamic Asset Expansion
- Unlimited Photos
- Automatic Photo Naming
- Automatic Watermark
- PDF Report Generation (Planned)
- Excel Export (Planned)

---

# Current Workflow

Project

↓

Inspection List

↓

---------------Pole Inspection Report-------------

I. General Information

• Date: Auto Get Date *mandatory
• Division: <mandatory>
• District: <mandatory>
• Block: 
• Pole ID: <Mandatory>
• Location Address:
• Lat/Long: <Mandatory>
Add GPS Butten Here

II. Pole Structure Details

• Foundation Condition: Acceptable / Minor Damage / Major Damage / Not Visible <Mandatory>
• Pole Availability: YES / NO <Mandatory>
• Pole SI: Technosys (LSY)/ TCIL (LSY)/ TCIL (RC)/ TCIL (Smart City)/ TASL (Technosys) 
• Pole Status: VMS / Local / In Stock / Dismantled / Non-Live / Not verified 

III. Junction Box and Cabling

• Junction Box Status: Installed / Not Installed / Damage <Mandatory>
• Power Cable: Yes / No / Not Verified
• Power Cable Status: Overhead / Underground / on Ground / Not Verified
• Power Cable Length:

IV. Earthing Details

• Earthing Wire: Installed / Not Installed / Broken / Not Connected / Not visible / Not verified 
• Earthing Chamber: Installed / Not Installed / Damage / Not visible / Not verified 
• Earthing Cover: Installed / Not Installed / Damage / Not visible / Not verified
• Earthing Voltage: 

V. Metering Information
• Meter Box Status: Installed / Not Installed / Damage
• Meter Status: Installed / Not Installed 
• Meter Power Status: Powered / Non-Powered 
• Meter Serial Number:

VI. Connectivity Information

• Connectivity Type: Fiber / RF / Local / No Connectivity 

VII. Camera information

• Camera (Count): 0 / 1 / 2 / 3 / 4 /------- <Mandatory>
• Camera (Types): Bullet / Box /  PTZ <Mandatory>
• Camera (Status): VMS / Local / Non-Live / In Stock / Dismantled /Not verified
• Camera (Make): Sparsh / Prama / Hikvision / CP Plus / Secura
• Camera (Model):
• Camera (IP):
• Camera (Serial Number):
• Camera (SI): Technosys (LSY)/ TCIL (LSY)/ TCIL (RC)/ TCIL (Smart City)/ TASL (Technosys) 
• Camera (Sd Card Capacity): 64 GB/ 128 GB/ 256 GB / Not Verified
• Camera (Sd Card Capacity): Working / Not Working / Not Verified 

VIII. Switch Information

• Switch (Count): 0 / 1 / 2 /------
• Switch (Type): 4-Port / 8-Port
• Switch (Status): VMS / Local / Non-Live / In Stock / Dismantled /Not verified
• Switch (Make): D-Link / Cisco / Allied / Tejas
• Switch (Model):
• Switch (IP):
• Switch (Serial Number):
• Switch (SI): Technosys (LSY)/ TCIL (LSY)/ TCIL (RC)/ TCIL (Smart City)/ TASL (Technosys) 

IX. Categorization and Remarks

• Pole Category: AMC / LSY / Judicial 
• Remarks:

X. 📷 Photos <Mandatory min 1 Photo>
Capture Photo
Photo Gallery
Automatic Photo Stamp

cancel and  Save Button

Complete Inspection

Note 1:
Inspection-time editing – the inspector fills values (e.g., status, serial number, remarks).
Configuration-time editing – an administrator can add, remove, or modify the inspection template itself (fields, options, even new device types) without changing code.

Note 2:
When I enter the quantity for Cameras or Switches, the corresponding rows for Make, Model, Serial Number, SI, and Status should automatically expand based on the entered quantity. These fields should also remain fully editable so that I can modify the details if required. Additionally, if I need to add another device type in the future, I should be able to do so, and entering its quantity should automatically expand the corresponding detail rows in the same way
---

# Technology Stack

Frontend

- React Native
- Expo
- TypeScript
- Expo Router
- React Native Paper

Database

- SQLite

Future

- PDF Generator
- Excel Export
- Backup

---

# Design Philosophy

The project is configuration driven.

Administrators can modify inspection templates without changing application code.

Supported operations include:

- Add Section
- Delete Section
- Rename Section
- Add Asset
- Delete Asset
- Rename Asset
- Add Fields
- Remove Fields
- Dropdown Configuration
- Mandatory Field Configuration

---

# Project Status

Current Version

0.9 (Development)

Current Phase

Architecture & Configuration Engine

---

# Future Roadmap

- Dynamic Template Engine
- Dynamic Asset Engine
- Photo Module
- Watermark
- Reports
- Dashboard
- Backup
- Restore
