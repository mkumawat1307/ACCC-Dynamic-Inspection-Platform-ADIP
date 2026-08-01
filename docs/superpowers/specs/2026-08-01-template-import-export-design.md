# Template Import/Export — Design

**Date:** 2026-08-01
**Status:** Approved (design), pending spec review

## Goal

Let a user export their fully customized inspection form (all templates, sections, fields, options, custom device types, device options, project device type mappings) to a JSON file, share it to another person's phone, and have that person import it so their inspection form becomes exactly the exported one — replacing the default form.

This is a **form transfer tool**, not just a backup. The importing phone's form becomes identical to the exporter's.

## Requirements

1. **Export everything**: all templates (default + imported/custom), all sections/fields/options, custom device types (`DeviceFieldDefinitions`), device options (`DeviceOptions`), and project device type mappings (`ProjectDeviceTypes`).
2. **Import replaces the current form in-place**: deactivate existing sections/fields/device rows, insert imported ones. The form becomes exactly the exported state.
3. **Safe**: existing inspection data is preserved (deactivate + add, same pattern as Reset to Default). No `DELETE` on inspection tables.
4. **Proper UI**: full modal flow (not `Alert` popups) — export summary, success dialog, import confirmation, progress spinners, error dialogs with Retry.

## JSON Format (v2.0)

```json
{
  "version": "2.0",
  "exportedAt": "ISO",
  "templates": [
    {
      "TemplateName": "ACCC Dynamic Inspection Platform",
      "Description": "...",
      "IsDefault": 1,
      "sections": [
        {
          "SectionName": "...",
          "SectionKey": "...",
          "Description": null,
          "Icon": null,
          "DisplayOrder": 1,
          "IsRepeatable": 0,
          "IsVisible": 1,
          "fields": [
            {
              "FieldName": "...",
              "FieldKey": "...",
              "FieldType": "text",
              "Placeholder": null,
              "DefaultValue": null,
              "HelpText": null,
              "ValidationRule": null,
              "DisplayOrder": 1,
              "IsRequired": 1,
              "IsVisible": 1,
              "IsReadOnly": 0,
              "IsSystemField": 0,
              "Width": 12,
              "options": [
                { "OptionLabel": "...", "OptionValue": "...", "DisplayOrder": 1, "IsDefault": 0 }
              ]
            }
          ]
        }
      ],
      "deviceTypes": [
        { "DeviceType": "Camera", "FieldName": "CameraType", "Label": "Camera Type", "FieldType": "dropdown", "IsRequired": 1, "DisplayOrder": 1 }
      ],
      "deviceOptions": [
        { "DeviceType": "Camera", "FieldName": "CameraType", "OptionLabel": "Bullet", "OptionValue": "Bullet", "DisplayOrder": 1 }
      ]
    }
  ],
  "projectDeviceTypes": ["Camera", "Switch", "UPS"]
}
```

Key changes vs current v1.0 export:
- `templates` is now an array (all templates, not just the default).
- Field-level `IsSystemField` and `Width` added (currently dropped).
- `deviceTypes` = `DeviceFieldDefinitions` grouped by template.
- `deviceOptions` = `DeviceOptions` grouped by template.
- `projectDeviceTypes` = active types from `ProjectDeviceTypes`.
- Backward compatible: `importTemplate` still accepts v1.0 files (single template, no device data → device data left untouched).

## Data Layer

All in `frontend/src/utils/templateData.ts`. DB access via `getDatabase()` (project DB, sequential open/close respected). Settings is outside the inspection flow, so no `getGlobalDatabase()` corruption risk.

### `exportTemplates()`

- Reads all templates (`InspectionTemplates`), all active sections, fields (incl. `IsSystemField`, `Width`), field options.
- Reads `DeviceFieldDefinitions` + `DeviceOptions` grouped by `TemplateID`.
- Reads active `ProjectDeviceTypes`.
- Writes JSON to `FileSystem.documentDirectory` and shares via `expo-sharing` (same as current `exportDefaultTemplate`).
- Returns `{ fileUri, fileName, summary }` where `summary = { templateCount, sectionCount, fieldCount, deviceTypeCount, deviceOptionCount }`.
- Returns `null` when the project has no templates.

### `importTemplate()`

Replace-in-place (deactivate + add), safe for existing inspection data:

1. Parse + validate (existing validation logic extended for v2.0; v1.0 fallback).
2. In one transaction:
   - Deactivate all non-default `InspectionTemplates` rows and their sections/fields/options (`IsActive = 0`).
   - Insert/activate imported templates, sections, fields, options. Default template matched by `TemplateName` (upsert).
   - Deactivate all `DeviceFieldDefinitions` + `DeviceOptions`; insert imported ones (keyed on `(TemplateID, DeviceType, FieldName)`).
   - Deactivate all `ProjectDeviceTypes`; insert imported active types.
3. Returns a pre-import summary for the confirmation dialog: `{ willReplaceSections, willAddTemplates, willReplaceDeviceTypes }` (e.g., "This will replace 8 sections, 42 fields, 3 device types").

## UI

### Settings screen (`app/settings/index.tsx`)

Replace current `Alert`-based `handleExportTemplate` / `handleImportTemplate` with a modal flow.

### New components

- `app/settings/components/TemplateExportDialogs.tsx` — export modal flow.
- `app/settings/components/TemplateImportDialogs.tsx` — import modal flow.
- `src/components/template/useTemplateFlow.ts` — shared state machine hook: `idle | exporting | exported | importing | parsing | confirming | imported | error`.

### Export flow (tap "Export Template")

1. **Exporting dialog** — spinner + "Building template file…" (summary counts shown once gathered: "3 templates, 8 sections, 42 fields, 3 device types").
2. **Success dialog** — message, summary, fileName; buttons **Share** / **Close**.
3. **Error dialog** — message + **Retry** / **Close**.

### Import flow (tap "Import Template")

1. **Document picker** (Android JSON file picker).
2. **Parsing dialog** — spinner "Reading template file…".
3. **Confirmation dialog** — "Import template 'X'? This will replace the current form: 8 sections, 42 fields, 3 device types. Existing inspection data will NOT be deleted." Buttons **Cancel** / **Import**.
4. **Importing dialog** — spinner "Applying template…".
5. **Success dialog** — "Template imported". Button **Close**.
6. **Error dialog** — Retry / Close (validation errors show specific message).

## Testing

### Unit tests (`src/__tests__/utils/templateData.test.ts`, extended)

- Export: all templates gathered, summary counts correct, JSON v2.0 structure, `deviceTypes`/`deviceOptions`/`projectDeviceTypes` included, `IsSystemField`/`Width` captured.
- Import replace-in-place: non-default sections/fields deactivated, imported inserted, device types/options upserted, `ProjectDeviceTypes` replaced, existing inspection data untouched.
- Import validation: v2.0 structure, v1.0 fallback, malformed files, field type validation (existing tests preserved).
- Backward compat: v1.0 file imports without device data.

### UI flow tests (`useTemplateFlow`)

State transitions: idle→exporting→exported→error, retry, import confirm→success.

### Isolation regression (AGENTS.md mandate)

New test mirroring `src/__tests__/database/isolation.test.ts`: export from Project A → import into Project B → assert Project A's custom form does NOT leak into Project B. Mocks stay path-aware; distinct DB handles per test.

## Edge Cases

- Empty project (no templates) → export returns `null` → "No template found to export."
- File has newer/unknown version → import rejects with clear message.
- Duplicate template names across import → merged (default matched by `TemplateName`).
- `IsDefault` flag from file respected — exported default stays default on import.
- Import with no sections → allowed but warns "Template has no sections."

## Isolation Requirements

- All template/device data lives in the project DB — export/import never touches `accc_global.db`.
- Sequential open/close model respected — only one `SQLiteDatabase` handle at a time.
- No cross-DB joins.
