# ACCC Dynamic Inspection Platform (ADIP)

# Product Requirements Document (PRD)

---

## Document Information

| Item | Value |
|------|-------|
| Project Name | ACCC Dynamic Inspection Platform (ADIP) |
| Current Module | ACCC Pole Inspection |
| Version | 1.8.1 |
| Status | Active Development |
| Product Owner | Manish Kumawat |
| Technical Architect | Project Documentation |
| Platform | Android |
| Framework | React Native (Expo) |
| Database | SQLite |
| Architecture | Offline-First, Configuration-Driven |
| Last Updated | July 2026 |

---

# 1. Executive Summary

The ACCC Dynamic Inspection Platform (ADIP) is an offline-first Android application developed to digitize the inspection of Smart City surveillance infrastructure.

The first implementation focuses on pole inspections, including cameras, switches, junction boxes, earthing, metering, connectivity, and inspection photographs.

Rather than creating separate applications for every inspection type, ADIP is designed as a reusable inspection platform where inspection templates and form structures can evolve while preserving existing inspection data.

The application is optimized for field engineers who often work in locations without reliable internet connectivity. All inspection data is stored locally and can be reviewed, edited, exported, and synchronized in future versions.

---

# 2. Project Vision

Build a professional, configurable inspection platform that allows organizations to perform infrastructure inspections efficiently, consistently, and without relying on paper-based processes.

The platform should reduce manual effort, improve data quality, simplify report generation, and support future inspection types without requiring a new application.

---

# 3. Business Problem

Current inspection processes commonly involve:

- Paper-based inspection forms
- Manual photo management
- Duplicate data entry
- Missing GPS information
- Inconsistent reporting
- Difficult record retrieval
- Delayed report preparation

These challenges increase operational cost and reduce inspection quality.

---

# 4. Business Objectives

The platform aims to:

- Replace paper inspection forms with a digital workflow.
- Operate completely offline during field inspections.
- Capture structured inspection data.
- Automatically capture GPS information.
- Integrate photo evidence with inspections.
- Improve inspection accuracy and consistency.
- Reduce report preparation time.
- Provide a scalable foundation for future inspection modules.

---

# 5. Product Scope

### Included in Current Scope

- Dashboard
- Project selection
- New inspection
- Edit inspection
- Search inspections
- Offline SQLite database
- GPS capture
- Photo capture
- Auto-save
- Dynamic inspection sections
- Dynamic field rendering
- Camera and switch inspection
- Inspection history
- Duplicate Pole ID detection
- Device options admin panel (Camera/Switch dropdowns configurable from Settings)
- Template import/export (JSON)
- Project edit and delete
- Project-wise CSV export
- Drill-down admin flow (Sections → Fields → Options)
- DB-driven camera/switch dropdown options (fallback to hardcoded if DB empty)
- Simplified settings screen

### Planned for Future Releases

- Cloud synchronization
- User authentication
- Role-based access
- PDF report generation
- Excel export
- Backup and restore
- AI-assisted inspection
- OCR improvements

---

# 6. Target Users

### Field Inspector

Responsible for:

- Performing inspections
- Capturing photos
- Recording field observations
- Updating inspection status

### Supervisor

Responsible for:

- Reviewing completed inspections
- Monitoring inspection progress
- Verifying inspection quality

### Administrator

Responsible for:

- Managing projects
- Managing templates
- Configuring sections and fields
- Configuring camera and switch device options
- Importing and exporting inspection templates
- Maintaining application settings

# 7. User Roles & Personas

The ACCC Dynamic Inspection Platform (ADIP) is designed for multiple user roles involved in the inspection lifecycle. Each role has different responsibilities, permissions, and system interactions.

---

## 7.1 Field Inspector

### Description

The Field Inspector is the primary user of the application. They perform on-site inspections and collect all required data directly from the field.

### Responsibilities

- Select Project and District
- Create a new inspection
- Record pole details
- Inspect cameras
- Inspect switches
- Inspect junction boxes
- Verify earthing
- Record meter readings
- Capture GPS coordinates
- Capture inspection photographs
- Add remarks
- Save inspections offline

### Goals

- Complete inspections quickly
- Minimize typing
- Avoid data loss
- Work without internet connectivity

---

## 7.2 Supervisor

### Description

Supervisors review completed inspections and ensure inspection quality before reports are submitted.

### Responsibilities

- Review inspection records
- Verify photographs
- Review observations
- Check inspection completeness
- Monitor inspection progress

---

## 7.3 Administrator

### Description

Administrators manage the inspection platform and maintain inspection configurations.

### Responsibilities

- Manage projects (create, edit, delete)
- Manage districts
- Configure inspection templates
- Configure sections (create, edit, reorder)
- Configure fields (create, edit, reorder)
- Configure dropdown options (create, edit, reorder)
- Configure camera and switch device options
- Import and export inspection templates
- Export project-wise inspection data as CSV
- Maintain application settings

---

# 8. Functional Requirements

The system shall provide the following core functionality.

---

## FR-01 Dashboard

The application shall provide a dashboard displaying:

- Total inspections
- Completed inspections
- Draft inspections
- Project statistics
- Camera statistics
- Switch statistics
- Recent inspections

---

## FR-02 Project Selection

The application shall allow users to:

- Select Project
- Select District
- Select Division
- Select Block (if applicable)

---

## FR-03 Inspection Management

The system shall allow users to:

- Create inspection
- Edit inspection
- Delete inspection
- Search inspection
- Filter inspection
- View inspection details
- Duplicate inspection (future enhancement)

---

## FR-04 Offline Operation

The application shall operate completely without internet.

All inspection data shall be stored locally using SQLite.

The application shall continue functioning even when:

- Mobile network is unavailable
- Wi-Fi is unavailable
- GPS signal is temporarily weak

---

## FR-05 Auto Save

The application shall automatically save user input whenever a value changes.

Users shall never need to press a "Save" button.

---

## FR-06 Dynamic Inspection Forms

Inspection forms shall be generated dynamically using configuration stored in the database.

Each inspection template shall contain:

- Sections
- Fields
- Validation rules
- Display order
- Default values

The application shall render forms based on this configuration rather than hardcoded layouts.

---

## FR-07 Dynamic Device Sections

The application shall support multiple instances of configurable devices within a single inspection.

Examples include:

- Cameras
- Switches
- Future device types

Users shall specify the number of required devices, and the application shall automatically generate the corresponding inspection groups without requiring additional coding.

---

## FR-08 GPS Capture

The application shall:

- Request location permission
- Capture Latitude
- Capture Longitude
- Capture Timestamp
- Store location with inspection

Future versions may also support:

- Accuracy
- Altitude
- Reverse geocoding

---

## FR-09 Photo Capture

The application shall allow users to capture inspection photographs.

Each photograph shall support:

- Preview before saving
- Automatic naming convention
- Timestamp
- GPS coordinates (where available)
- Pole ID watermark
- District watermark
- Date and time watermark

Future versions may support OCR and annotation.

---

## FR-10 Search

Users shall be able to search inspections using:

- Pole ID
- Project
- District
- Date
- Status

---

## FR-11 Reports

The system shall support:

- Inspection summary
- Project-wise CSV export
- Excel export (future)
- PDF export (future)
- Photo reports
- Audit reports

Report templates shall be configurable in future versions.

---

## FR-12 Device Options Administration

The application shall allow administrators to manage camera and switch dropdown options from the Settings screen.

Configurable options include:

- Camera Type, Camera Status, Camera Make, Camera SI, Camera SD Card
- Switch Type, Switch Status, Switch Make, Switch SI

Options are stored in the DeviceOptions database table and are DB-driven rather than hardcoded. Camera and switch inspection sections load dropdown options from the DeviceOptions table. If the DeviceOptions table is empty, sections fall back to hardcoded default values.

---

## FR-13 Template Import/Export

The application shall support exporting the complete inspection template (sections, fields, and dropdown options) as a JSON file from Settings → Export Template.

The application shall support importing an inspection template from a JSON file from Settings → Import Template.

This allows administrators to transfer template configurations between devices or create backups.

---

## FR-14 Project Edit and Delete

The application shall allow users to edit project details (name, district, division, client, description) from the home screen via an Edit button on each project card.

The application shall allow users to delete a project via a Delete button. Deletion shall show a warning dialog listing what will be removed (project, inspections, photos, device data) and require confirmation before proceeding.

---

## FR-15 Project-wise CSV Export

The application shall allow users to export inspection data for a specific project as a CSV file from the project dashboard.

The CSV shall include inspection fields, device data, and GPS coordinates. The exported file shall be shareable via device sharing options.

---

# 9. Inspection Workflow

The inspection workflow shall follow a structured sequence to ensure consistency.

Current workflow:

1. Select Project
2. Select District
3. Enter Pole ID
4. Verify Pole Information
5. Inspect Pole Structure
6. Inspect Junction Box
7. Verify Earthing
8. Record Meter Details
9. Verify Connectivity
10. Inspect Cameras
11. Inspect Switches
12. Capture Remarks
13. Capture Photographs
14. Review Inspection
15. Complete Inspection

The workflow is designed to minimize missed inspection steps while maintaining flexibility for future templates.

---

# 10. Application Modules

The current version of the platform consists of the following primary modules.

## Dashboard

Provides an overview of inspection activity and key statistics.

---

## Projects

Maintains the list of available projects. Supports creating, editing, and deleting projects.

---

## Districts

Maintains district-level configuration.

---

## Inspection Engine

Core module responsible for:

- Creating inspections
- Editing inspections
- Auto-save
- Validation
- Dynamic rendering

---

## Photo Module

Responsible for:

- Camera integration
- Image storage
- Photo preview
- Metadata management

---

## Database Module

Provides offline data persistence using SQLite through the Repository Pattern.

---

## Settings Module

Responsible for application configuration.

Current implementation includes:

- Sections management (drill-down: list, create, edit, reorder)
- Fields management (drill-down: list, create, edit, reorder)
- Dropdown options management (drill-down: list, create, edit, reorder)
- Camera options management (type, status, make, SI, SD card)
- Switch options management (type, status, make, SI)
- Export template (JSON)
- Import template (JSON)

---

## Export Module

Responsible for:

- Project-wise CSV export
- Shareable inspection data

---

# 11. Non-Functional Requirements

Non-functional requirements define how the application should operate rather than what functionality it provides. These requirements ensure the platform remains reliable, maintainable, scalable, and user-friendly.

---

## 11.1 Performance

The application shall provide a fast and responsive user experience.

### Requirements

- Application launch time should be less than 3 seconds on supported devices.
- Dashboard should load within 2 seconds.
- Inspection forms should open within 1 second.
- Field changes should be saved automatically within 500 milliseconds.
- Search results should appear within 1 second.
- Scrolling should remain smooth even with large inspection datasets.
- Camera Open and Save pthoto with all watermarks within 2 second.
---

## 11.2 Reliability

The application shall continue functioning even under adverse conditions.

### Requirements

- No internet connection required.
- Unexpected application closure shall not lose saved inspection data.
- Auto-save shall minimize data loss.
- Database corruption shall be minimized through transaction-based operations.
- Graceful handling of unexpected errors.

---

## 11.3 Availability

The platform shall be available whenever the application is installed.

### Requirements

- Operate completely offline.
- No dependency on cloud services during inspections.
- No login required for offline inspection mode (current version).

---

## 11.4 Maintainability

The codebase shall be modular and easy to maintain.

### Requirements

- Repository Pattern for database operations.
- TypeScript throughout the project.
- Reusable UI components.
- Configuration-driven inspection forms.
- DB-driven device options (not hardcoded).
- Centralized validation.
- Clear folder structure.

---

## 11.5 Scalability

The architecture shall support future expansion without major redesign.

Future inspection types may include:

- Pole Inspection
- NVR Inspection
- UPS Inspection
- Solar Inspection
- OFC Inspection
- Data Centre Inspection
- Traffic Signal Inspection
- Smart Pole Inspection
- Control Room Inspection

The addition of new inspection types should primarily involve creating new templates and configuration rather than modifying application logic.

---

# 12. Database Requirements

The application shall use SQLite as the primary local database.

### Design Principles

- Offline-first architecture.
- Normalized database structure.
- Repository Pattern.
- Transaction support.
- Foreign key constraints.
- Auto-generated primary keys.

### Current Core Tables (18 Tables)

- Projects
- Districts
- Blocks
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
- Divisions
- DeviceOptions

### DeviceOptions Table

Stores configurable dropdown options for camera and switch device fields.

Fields:

- OptionID (INTEGER PRIMARY KEY)
- DeviceType (TEXT — 'Camera' or 'Switch')
- FieldName (TEXT — e.g., 'CameraType', 'SwitchMake')
- OptionLabel (TEXT — display label)
- OptionValue (TEXT — stored value)
- DisplayOrder (INTEGER)
- IsActive (INTEGER — 1 = active, 0 = inactive)

### InspectionSections.IsDefault Column

INTEGER column (migration adds it, default 0). Marks the original 10 built-in sections as IsDefault=1. Only default sections appear in inspection forms. Custom admin sections are stored in the database but hidden from inspection forms.

### Inspections.SectionsSnapshot Column

TEXT column (migration adds it). Originally used to snapshot section configuration at inspection creation time. Now deprecated — section configuration is read live from the database.

Future tables may be added as the platform evolves, while preserving backward compatibility where practical.

---

# 13. Dynamic Inspection Engine

The Dynamic Inspection Engine is the core of the platform.

Instead of hardcoding inspection screens, the application builds inspection forms from database configuration.

### Responsibilities

- Load inspection templates.
- Load sections (default sections only via IsDefault flag).
- Load fields.
- Render UI dynamically.
- Apply validation.
- Save values automatically.
- Support configurable display order.
- Support DB-driven device options for camera and switch dropdowns.
- Support future inspection templates.

### Benefits

- Minimal code changes for new templates.
- Reusable inspection engine.
- Consistent user experience.
- Easier long-term maintenance.

---

# 14. Offline Strategy

The platform is designed using an Offline-First architecture.

### Data Storage

All operational inspection data shall be stored locally using SQLite.

### Offline Capabilities

The application shall support:

- Creating inspections.
- Editing inspections.
- Searching inspections.
- Viewing inspection history.
- Capturing photos.
- Recording GPS coordinates (subject to device availability).
- Auto-save.
- Exporting inspection data as CSV.
- Importing/exporting templates as JSON.

### Future Synchronization

Future versions may introduce cloud synchronization.

Synchronization shall:

- Upload only changed records.
- Preserve local data until successful synchronization.
- Resolve conflicts through defined synchronization rules.

---

# 15. Data Validation

To improve data quality, the platform shall validate user input before marking inspections as complete.

Examples include:

- Mandatory fields.
- Numeric validation.
- Date validation.
- Dropdown validation.
- Duplicate Pole ID detection.
- GPS availability checks (where required).
- Photo requirements (where applicable).

Validation rules should be configurable to support different inspection templates.

---

# 16. Error Handling

The application shall provide clear and actionable feedback when errors occur.

### Examples

- GPS unavailable.
- Camera permission denied.
- Storage unavailable.
- Database error.
- Duplicate Pole ID detected.
- Required field missing.

Errors shall be logged for debugging while displaying user-friendly messages.

---

# 17. Security Requirements

The current version stores data locally.

### Requirements

- Protect database integrity.
- Prevent accidental data loss.
- Restrict destructive operations through confirmation dialogs.
- Follow Android permission best practices.

### Future Enhancements

- User authentication.
- Role-based access control.
- Data encryption.
- Secure synchronization.
- Audit logs.

---

# 18. Data Integrity

The platform shall maintain consistent and accurate inspection records.

### Principles

- Every inspection shall have a unique identifier.
- Related records shall reference their parent inspection.
- Foreign key relationships shall be maintained.
- Auto-save shall preserve intermediate changes.
- Soft deletion may be considered for future versions where audit history is required.

---

# 19. Logging and Diagnostics

The application shall include logging to assist development and troubleshooting.

### Logging Areas

- Database operations.
- Repository actions.
- Navigation events.
- Auto-save events.
- GPS acquisition.
- Camera operations.
- Error events.

Debug logging should be disabled or reduced for production releases.

---

# 20. Future Extensibility

The platform shall be designed to support future enhancements with minimal impact on existing functionality.

Potential future enhancements include:

- AI-assisted inspection recommendations.
- OCR-based data extraction.
- Digital signatures.
- Cloud synchronization.
- Role-based permissions.
- Multi-language support.
- Analytics dashboard.
- GIS integration.
- Workflow approvals.

These enhancements should build upon the existing modular and configuration-driven architecture rather than requiring a complete redesign.

# 21. Acceptance Criteria

The following acceptance criteria define when the product and its features are considered complete.

---

## AC-01 Dashboard

The Dashboard shall:

- Display total inspections.
- Display completed inspections.
- Display draft inspections.
- Display project statistics.
- Display recent inspections.

---

## AC-02 Inspection Creation

Users shall be able to:

- Create a new inspection.
- Select Project.
- Select District.
- Enter Pole ID.
- Save inspection automatically.
- Resume draft inspections.

---

## AC-03 Dynamic Inspection Form

The inspection engine shall:

- Load templates from the database.
- Render sections dynamically.
- Render fields dynamically.
- Support field ordering.
- Support validation rules.
- Support configurable field visibility.

---

## AC-04 Camera Inspection

The system shall support:

- Multiple cameras.
- Camera-specific inspection fields.
- Individual camera remarks.
- Individual camera photos.
- Dropdown options loaded from DeviceOptions table.

---

## AC-05 Switch Inspection

The system shall support:

- Multiple switches.
- Switch-specific inspection fields.
- Individual switch remarks.
- Individual switch photos.
- Dropdown options loaded from DeviceOptions table.

---

## AC-06 Photo Management

Users shall be able to:

- Capture photos.
- Preview photos before saving.
- Delete unwanted photos.
- Store photos with inspection records.
- Associate photos with inspection components.

---

## AC-07 GPS

The application shall:

- Capture Latitude.
- Capture Longitude.
- Record capture timestamp.
- Handle GPS permission denial gracefully.

---

## AC-08 Search

Users shall be able to search inspections using:

- Pole ID.
- Project.
- District.
- Date.
- Inspection status.

---

## AC-09 Offline Operation

The application shall function without internet connectivity for all core inspection activities.

---

## AC-10 Data Integrity

The application shall:

- Prevent orphan records.
- Preserve relationships.
- Automatically save user input.
- Recover from unexpected application closure without losing previously saved information.

---

## AC-11 Device Options Administration

Administrators shall be able to:

- View, create, edit, and reorder camera dropdown options.
- View, create, edit, and reorder switch dropdown options.
- Options persist in the DeviceOptions table.
- Camera and switch inspection sections load options from the database.

---

## AC-12 Template Import/Export

Administrators shall be able to:

- Export the complete inspection template (sections, fields, options) as JSON.
- Import an inspection template from JSON.
- Imported templates are stored in the database.

---

## AC-13 Project Management

Users shall be able to:

- Edit existing projects from the home screen.
- Delete projects with confirmation warning dialog.
- Deleted projects remove all associated inspections, photos, and device data.

---

## AC-14 Project-wise CSV Export

Users shall be able to:

- Export inspection data for a specific project as CSV.
- Share the exported CSV file via device sharing options.

---

# 22. Success Metrics (KPIs)

The following Key Performance Indicators (KPIs) will be used to evaluate project success.

### Productivity

- Reduce inspection completion time.
- Reduce report preparation time.
- Reduce duplicate data entry.

### Quality

- Increase inspection completeness.
- Improve photo quality and organization.
- Reduce missing GPS records.
- Reduce manual reporting errors.

### System

- Stable offline operation.
- Fast application performance.
- Minimal crashes.
- Reliable database storage.

---

# 23. Risks

## Technical Risks

- SQLite database corruption.
- Android permission changes.
- Large image storage requirements.
- GPS inaccuracies.
- Device hardware limitations.

---

## Operational Risks

- Incomplete inspections.
- Incorrect user input.
- Damaged mobile devices.
- Battery depletion during field work.

---

## Project Risks

- Requirement changes.
- Scope expansion.
- Limited testing time.
- Delayed feature implementation.

---

# 24. Risk Mitigation

To reduce identified risks, the project shall adopt the following strategies.

### Data Protection

- Auto-save.
- Database transactions.
- Validation.
- Confirmation dialogs.
- Backup support (future).

### Performance

- Lazy loading.
- Efficient database queries.
- Image optimization.

### Reliability

- Offline-first architecture.
- Graceful error handling.
- Logging and diagnostics.

---

# 25. Assumptions

The project assumes that:

- Users possess basic Android knowledge.
- GPS hardware is available on supported devices.
- Camera hardware is available.
- Sufficient device storage is available.
- SQLite is supported by the target platform.

Future synchronization assumes intermittent internet connectivity.

---

# 26. Constraints

Current constraints include:

- Android platform only.
- Offline-first operation.
- Local SQLite database.
- Expo framework limitations.
- Mobile device hardware limitations.

The platform should remain compatible with future architectural enhancements without requiring complete redevelopment.

---

# 27. Dependencies

Current dependencies include:

## Framework

- React Native
- Expo

## Language

- TypeScript

## Database

- SQLite

## Device Features

- Camera
- GPS
- File System

## Libraries

Dependencies shall remain documented within the project repository and updated as the application evolves.

---

# 28. Release Strategy

The project shall follow an incremental release approach.

### Version 0.x

Development

Internal testing

Feature implementation

---

### Version 1.0

Initial production release

Pole Inspection

Offline operation

Photo capture

GPS

Dynamic inspection forms

---

### Version 1.5

Administration panel with DB-driven device options

Template import/export

Project edit/delete

Project-wise CSV export

Drill-down admin flow (Sections → Fields → Options)

Simplified settings screen

---

### Future Releases

Additional inspection templates

Cloud synchronization

Role management

Reporting enhancements

AI-assisted inspection

---

# 29. Roadmap

## Phase 1

Project Foundation

Status: Completed

---

## Phase 2

Inspection Engine

Status: Completed

---

## Phase 3

Dynamic Template System

Status: Completed

---

## Phase 4

Administration Panel

Device Options Admin Panel (DB-driven camera/switch options)

Template Import/Export (JSON)

Project Edit/Delete with warning dialog

Project-wise CSV Export

Drill-down Admin Flow (Sections → Fields → Options)

Simplified Settings Screen

Pole ID Lock Fix (SectionRenderer waits for DB load)

Status: Completed

---

## Phase 5

Reporting

PDF

Excel

Dashboard Analytics

---

## Phase 6

Cloud Platform

Authentication

Synchronization

Role-Based Access

Notifications

---

## Phase 7

AI Platform

OCR

Image Analysis

Inspection Recommendations

Predictive Maintenance

---

# 30. Glossary

| Term | Description |
|------|-------------|
| ADIP | ACCC Dynamic Inspection Platform |
| ACCC | Abhay Command & Control Centre |
| TPA | Third Party Audit |
| SI | System Integrator |
| GPS | Global Positioning System |
| SQLite | Local embedded database |
| Template | Configuration defining an inspection form |
| Section | Logical grouping of related inspection fields |
| Field | Individual data entry element |
| DeviceOptions | Database table storing configurable dropdown options for camera and switch device fields |
| IsDefault | Column on InspectionSections marking the original built-in sections that appear in inspection forms |
| Repository Pattern | Data access abstraction layer |
| Offline First | Application designed to operate without internet connectivity |

---

# 31. Appendix

This PRD should be read together with the following project documents:

- 02-Architecture.md
- 03-Rules.md
- 04-Phases.md
- 05-Design.md
- 06-Memory.md
- 07-Changelog.md
- 08-README.md
- 09-Decisions.md

Together these documents provide the complete functional, technical, architectural, and operational definition of the ACCC Dynamic Inspection Platform.

---

# 32. Traceability Matrix

| Requirement | Related Module |
|-------------|----------------|
| Offline Inspection | Inspection Engine |
| GPS Capture | Location Module |
| Photo Capture | Camera Module |
| Dynamic Forms | Template Engine |
| Auto Save | Inspection Repository |
| Search | Dashboard |
| Reporting | Reporting Module |
| Settings | Administration Module |
| Device Options Admin | Settings Module |
| Template Import/Export | Settings Module |
| Project Edit/Delete | Projects Module |
| CSV Export | Export Module |
| DB-Driven Device Options | DeviceOptions Repository |

---

## Document Approval

| Role | Status |
|------|--------|
| Product Owner | Pending |
| Technical Review | Pending |
| Architecture Review | Pending |
| Development Team | Pending |

---

**End of Document**
