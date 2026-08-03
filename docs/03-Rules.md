# ACCC Dynamic Inspection Platform (ADIP)

# AI Development Rules

Version: 2.5

Status: Active

---

# Purpose

This document defines the mandatory development rules for the ACCC Dynamic Inspection Platform.

These rules ensure that every developer and AI coding assistant follows consistent standards and does not unintentionally introduce architectural inconsistencies.

Unless explicitly instructed by the Product Owner, these rules must always be followed.

---

# 1. General Principles

The application is designed as a professional enterprise inspection platform.

Every code change must prioritize:

- Maintainability
- Scalability
- Readability
- Reusability
- Offline capability

Never implement quick fixes that increase long-term technical debt.

---

# 2. Technology Rules

Always use:

- React Native
- Expo
- TypeScript
- SQLite
- React Context
- Expo Router

Never introduce alternative technologies without approval.

Examples

❌ Firebase

❌ Supabase

❌ Realm

❌ Redux

❌ MobX

Unless specifically approved.

---

# 3. TypeScript Rules

Always use strict typing.

Every object shall have an interface or type.

Never use:

any

unless absolutely unavoidable.

Prefer

interface

over

type

for data models.

---

# 4. Folder Rules

Every file must belong to the correct folder.

components/

Reusable UI

repositories/

Database operations

models/

Interfaces

helpers/

Database helpers (ProjectDBManager.ts)

utils/

Helper functions (exportData.ts, templateData.ts, date.ts, location.ts)

hooks/

Reusable React Hooks

context/

Shared application state

Never mix responsibilities.

---

# 5. Database Rules

SQLite is the only local database.

Rules

Never execute SQL inside screens.

Never execute SQL inside components.

Only repositories may access SQLite.

Always use transactions where appropriate.

Always use foreign keys.

Always keep database normalized.

---

# 6. Repository Pattern

Repositories are mandatory.

Repositories shall:

Insert

Update

Delete

Search

Filter

Return strongly typed models.

Screens shall never contain database logic.

---

# 7. UI Rules

UI should remain:

Simple

Professional

Consistent

Field-friendly

Large touch targets.

Minimal typing.

Fast navigation.

Do not redesign working screens without approval.

---

# 8. Component Rules

Components should:

Be reusable.

Receive data through props.

Avoid direct database access.

Avoid business logic where possible.

Single responsibility.

---

# 9. Dynamic Form Rules

Inspection forms shall never be hardcoded.

Forms must be generated from database configuration.

Future inspection types should require configuration rather than code duplication.

---

# 10. Auto Save Rules

Every editable field shall support auto-save.

Never require manual Save buttons for normal data entry.

Saving should occur automatically after user input changes.

---

# 11. Photo Rules

Photos belong to inspections.

Current support includes:

Preview

Watermark (green #76FF03 on light black background, burned into gallery photos)

GPS (mandatory for capture)

Timestamp

Minimum 1 photo required for validation

Future support should include:

OCR

Compression

Never store unnecessary duplicate images.

---

# 12. GPS Rules

Always request permission gracefully.

Handle permission denial.

Do not block inspection creation when GPS is unavailable unless required by configuration.

---

# 13. Validation Rules

Validation should be centralized.

Never duplicate validation logic.

Support:

Required fields

Numeric validation

Dropdown validation

Duplicate Pole ID detection

Template-specific rules

---

# 14. Error Handling

Every error shall:

Be logged.

Provide a user-friendly message.

Avoid application crashes.

Never silently ignore exceptions.

---

# 15. Performance Rules

Avoid unnecessary re-renders.

Lazy load where possible.

Optimize FlatLists.

Avoid repeated database queries.

Reuse components.

---

# 16. Naming Conventions

Components

PascalCase

Example

InspectionCard.tsx

Repositories

PascalCaseRepository

Example

InspectionRepository.ts

Hooks

useSomething

Example

useInspection.ts

Interfaces

PascalCase

Example

InspectionField

Database Tables

PascalCase

Example

InspectionTemplates

Variables

camelCase

Constants

UPPER_CASE

---

# 17. Code Style

Functions should:

Be small.

Be readable.

Do one thing.

Prefer early returns.

Avoid deeply nested conditions.

Comment only when necessary.

Write self-explanatory code.

---

# 18. Security Rules

Never store sensitive credentials in source code.

Use environment variables where applicable.

Validate all user input.

Prepare for future authentication.

---

# 19. Offline Rules

Offline functionality is mandatory.

Inspection features must continue working without internet.

Cloud synchronization shall never replace offline capability.

---

# 20. Future Development Rules

New features should:

Reuse existing components.

Reuse repositories.

Reuse validation.

Reuse dynamic rendering.

Avoid duplicate code.

---

# 20a. Database Connection Rules (Mandatory)

The app uses a **sequential open/close model** with a single `SQLiteDatabase` handle. This is the only safe pattern on Android due to expo-sqlite v16 bugs.

- Never open two `SQLiteDatabase` handles simultaneously.
- Never call `closeAsync()` then immediately `openDatabaseAsync()` for a different file (handle corruption).
- Never use `ATTACH DATABASE` with dot-qualified DDL (`CREATE TABLE p.Name(...)`) — expo-sqlite Android rejects it.
- During the inspection flow, NEVER call `getGlobalDatabase()` — it closes the project DB and corrupts the native handle.
- Project data must be passed via navigation params + React Context to avoid DB switching mid-flow.
- Route all DB access through `src/database/repositories/` using the connection manager (`db.ts`).
- Use `cleanPath()` to strip `file://` before comparing DB paths.

See `docs/09-Decisions.md` (ADR-014) and `docs/10-DATABASE_ARCHITECTURE.md` for full reasoning.

---

# 21. Device Options Rules

Camera and switch dropdown options (type, status, make, SI, SD card) must be DB-driven via the DeviceOptions table, not hardcoded in component source code.

CameraSection and SwitchSection components must load dropdown options from DeviceOptionsRepository.

If the DeviceOptions table is empty, components may fall back to hardcoded default arrays for backward compatibility, but the primary source of options must always be the database.

Device options must be manageable from Settings → Camera Options / Switch Options.

When adding a new device dropdown field, seed data must be added to the device-options.seed.ts file.

Do not hardcode device option arrays in components or screens. Always query DeviceOptionsRepository.

Custom device types (added via Settings → Device Types) use DeviceFieldDefinitions for field schemas and DeviceRecords for per-inspection device data (JSON storage). ProjectDeviceTypes tracks which device types are enabled for each project. DeviceSection renders device sections generically based on DeviceFieldDefinitions, replacing the need for hardcoded CameraSection/SwitchSection for new device types.

---

# 22. Section IsDefault Rules

InspectionSections has an IsDefault column (INTEGER, default 0).

Only sections with IsDefault=1 (the original 10 built-in sections) shall appear in inspection forms.

Custom sections created by administrators through Settings → Sections are stored with IsDefault=0 and are hidden from inspection forms but visible in the admin Sections screen.

When querying sections for inspection rendering, always filter by IsDefault=1.

When querying sections for admin management, return all sections regardless of IsDefault.

---

# 23. AI Assistant Rules

When generating code, AI assistants must:

Understand existing architecture before coding.

Never rewrite working modules without approval.

Never introduce new libraries without approval.

Follow Repository Pattern.

Follow React Context.

Use TypeScript.

Maintain offline-first architecture.

Maintain configuration-driven inspection forms.

Respect project folder structure.

Keep backward compatibility whenever possible.

Never hardcode device option arrays in components — use DeviceOptionsRepository.

Never add sections to inspection forms without checking the IsDefault flag.

If uncertain, ask for clarification instead of making architectural assumptions.

---

# 24. Documentation Rules

Whenever a major feature is completed, update:

06-Memory.md

07-Changelog.md

04-Phases.md

Documentation should remain synchronized with the implementation.

---

# 25. Git Rules

Commit after each completed sprint.

Commit message format:

Sprint X - Feature Name

Example

Sprint 5 - Dynamic Camera Sections

Do not combine unrelated changes into a single commit.

---

# 26. Final Rule

This document takes precedence over AI-generated preferences.

If an AI assistant suggests changes that conflict with these rules, these rules shall be considered the authoritative source unless explicitly overridden by the Product Owner.
