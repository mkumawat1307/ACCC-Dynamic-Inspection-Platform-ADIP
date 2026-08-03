# ACCC Dynamic Inspection Platform (ADIP)

# Design System

Version: 2.1

Status: Active

Last Updated: July 2026

---

# Purpose

This document defines the visual language and user experience standards of the ACCC Dynamic Inspection Platform.

Every screen, component, dialog, form, and future module shall follow these design guidelines.

The goals are:

- Professional appearance
- Easy field operation
- Fast data entry
- Consistent UI
- Minimal learning curve
- Excellent readability

---

# 1. Design Philosophy

The application is designed for engineers working in the field.

The interface should be:

- Clean
- Professional
- Minimal
- Fast
- Touch-friendly
- Readable in sunlight
- Easy to operate with one hand

Users should spend their time inspecting assets, not learning the application.

---

# 2. Design Principles

The platform follows these principles:

### Simplicity

Avoid unnecessary controls.

Keep every screen focused.

---

### Consistency

Buttons, cards, icons, spacing, and colors should remain consistent across the application.

---

### Efficiency

Reduce typing.

Use dropdowns where appropriate.

Auto-save whenever possible.

---

### Accessibility

Large touch targets.

Readable fonts.

High color contrast.

Simple navigation.

---

### Feedback

Every important action should provide feedback.

Examples

Inspection Saved

Photo Captured

GPS Updated

Export Completed

---

# 3. Color Palette

## Primary

Blue

#1565C0

Purpose

Navigation

Primary Buttons

Headers

---

## Secondary

Light Blue

#42A5F5

Purpose

Highlights

Information

---

## Success

Green

#2E7D32

Purpose

Completed

Saved

Live Status

---

## Warning

Orange

#FB8C00

Purpose

Pending

Attention

---

## Error

Red

#D32F2F

Purpose

Validation Errors

Failed Status

---

## Background

Light Gray

#F5F5F5

---

## Card

White

#FFFFFF

---

## Divider

#E0E0E0

---

# 4. Typography

Primary Font

Inter

Fallback

System Font

---

Heading 1

24

Bold

---

Heading 2

20

SemiBold

---

Heading 3

18

Medium

---

Body

16

Regular

---

Caption

14

Regular

---

Small

12

Regular

---

# 5. Icon System

Primary Icon Library

Material Icons

Guidelines

Use recognizable icons.

Avoid decorative icons.

Every icon should communicate meaning.

Examples

Dashboard

Camera

Photo

GPS

Settings

Reports

Search

Delete

Edit

Save

Refresh

Upload

Download

---

# 6. Spacing System

Extra Small

4

Small

8

Medium

16

Large

24

Extra Large

32

These spacing values should be used consistently throughout the application.

---

# 7. Border Radius

Input

8

Button

10

Card

12

Dialog

16

Photo Preview

12

---

# 8. Elevation

Cards

Low elevation

Buttons

Minimal elevation

Dialogs

Medium elevation

Avoid excessive shadows.

---

# 9. Buttons

Primary Button

Filled

Blue

White Text

---

Secondary Button

Outlined

Blue Border

---

Danger Button

Filled

Red

---

Disabled Button

Gray

---

Loading Button

Display loading indicator.

Prevent multiple clicks.

---

# 10. Forms

Forms are the most frequently used interface.

Guidelines

Large input controls.

Clear labels.

Placeholder text.

Auto-save.

Validation messages.

Minimal scrolling.

Logical grouping.

---

# 11. Input Fields

Support

Text

Number

Multiline

Dropdown

Checkbox

Switch

Date

Date Auto

Time

GPS

Each field should display:

Title

Required Indicator

Help Text (optional)

Validation Message

---

# 12. Cards

Cards should be used for

Projects

Inspections

Photos

Reports

Dashboard Statistics

Cards should include

Title

Subtitle

Status

Quick Actions

---

# 13. Dashboard Design

Dashboard should display

- Configurable statistic cards (Smart Dashboard)
- Smart Card Generator (auto-creates cards from inspection form fields)
- Manual card creation (entity count, dropdown breakdown, sum, field count, date breakdown)
- Card enable/disable and reorder
- Recent inspections
- Search
- Quick Actions
- Project information

The dashboard should prioritize the most important information.

Cards can be grouped into sections (e.g., "Total Summary", "Today's Summary") with collapsible section headers.

Smart cards are non-editable and are managed through the Dashboard Settings screen.

## Smart Dashboard Cards

Card types:

- **Entity Count**: Count of inspections, cameras, switches, or devices (Total / Today's)
- **Dropdown Breakdown**: Group inspections by a dropdown field value (e.g., Pole Status)
- **Sum**: Sum of a numeric field (e.g., camera_count)
- **Field Count**: Count of inspections with a text/multiline field populated
- **Date Breakdown**: Group inspections by date

Cards auto-refresh when:
- Inspection data changes (via InspectionDataBus)
- App returns to foreground
- Midnight passes
- 60-second focused poll fires

Card refresh is project-isolated — opening Project B does not refresh Project A's dashboard.

---

# 14. Inspection Screen

The inspection screen should be divided into sections.

Example

General Information

Pole Structure

Junction Box

Earthing

Meter

Connectivity

Camera

Switch

Remarks

Photos

Each section should be collapsible in future versions.

---

# 15. Camera Module

Each camera should appear inside its own card.

Card contains

Camera Number

Status

Fields

Photo Button

Remarks

Camera type/status/make options are loaded from the database (DeviceOptions table) and are admin-configurable through Settings > Device Options. Options are no longer hardcoded in the component.

Future

Expand/Collapse

---

# 16. Switch Module

Same layout as Camera.

Consistent UI.

Switch type/status/make options are loaded from the database (DeviceOptions table) and are admin-configurable through Settings > Device Options. Options are no longer hardcoded in the component.

---

# 17. Photo Preview

Photo preview should support

Thumbnail

Full Screen View

Delete

Retake

Metadata

Future Annotation

---

# 18. Dialogs

Dialogs should be used for

Delete Confirmation

Permission Requests

Warnings

Errors

Completion Confirmation

Project Delete Confirmation (with warning about cascading inspection deletion)

Dialogs should have

Title

Description

Primary Action

Secondary Action

---

# 19. Loading States

Every long operation should display progress.

Examples

Saving

Exporting

Backup

Restore

Synchronization

Importing Templates

Exporting Templates

---

# 20. Empty States

Instead of blank screens, display meaningful guidance.

Examples

No Inspections

Create your first inspection.

No Photos

Capture a photo.

No Search Results

Try another keyword.

---

# 21. Error States

Errors should explain:

What happened

Why it happened (if known)

How to fix it

Avoid technical jargon.

---

# 22. Responsive Design

Support

Small Phones

Large Phones

Tablets (future)

Landscape Mode (future)

---

# 23. Dark Mode

Version 1

Light Theme Only

Future

Dark Theme Support

---

# 24. Accessibility

Support

Readable Fonts

High Contrast

Large Touch Areas

Simple Navigation

Meaningful Icons

Future

Screen Reader Support

---

# 25. Animation

Animations should be subtle.

Allowed

Fade

Slide

Expand

Collapse

Avoid flashy animations.

---

# 26. Image Standards

Photos should

Maintain quality

Avoid distortion

Compress when appropriate

Store metadata

Burn watermark into gallery photos (green #76FF03 on light black background)

Save to device gallery AND app Download folder

---

# 27. Branding

Application Name

ACCC Dynamic Inspection Platform

Short Name

ADIP

Logo

To be finalized

Splash Screen

Professional

Government-friendly

---

# 28. Admin Panel Design

Settings admin panel follows a drill-down navigation pattern:

Settings

↓

Sections (within Template)

↓

Fields (within Section)

↓

Options (within Field)

↓

Device Options (Camera/Switch dropdown configuration)

Each level provides CRUD operations with reorder support.

Device Options are accessible from Settings > Device Options and allow administrators to configure the dropdown values for Camera and Switch inspection fields (type, status, make, model, etc.) without code changes.

---

# 29. Template Import/Export

Template configurations can be exported and imported in JSON format.

Export produces a self-contained JSON file with all template, section, field, and option data.

Import uses expo-document-picker to select JSON files and creates a new template from the imported data.

Both operations are accessible from the Settings screen.

---

# 30. Project Management

Project cards support edit and delete actions.

Delete triggers a confirmation dialog warning that all inspections within the project will also be deleted.

Edit opens a modal with pre-filled form data.

Project dashboard includes a CSV export button for project-wise inspection data export using expo-sharing.

---

# 31. Future UI Enhancements

Planned

Dynamic Theme

Custom Branding

Project-specific Colors

Template-specific Layouts

Charts

GIS Maps

AI Assistant

Voice Commands

---

# Design Summary

The ACCC Dynamic Inspection Platform shall maintain a clean, professional, consistent, and field-friendly interface.

Every future screen should follow this design system to ensure a uniform user experience and reduce training requirements.
