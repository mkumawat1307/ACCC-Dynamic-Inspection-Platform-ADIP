# Reset to Default — Investigation & Design Report

**Date:** 2026-08-17  
**Status:** Investigation complete — awaiting approval before implementation  
**Scope:** Part 1 (complete property restoration) + Part 2 (dropdown default enforcement)

---

## A. Current Reset Behavior

The existing `ResetRepository.performReset()` (223 lines) in `frontend/src/database/repositories/ResetRepository.ts` performs a transactional reset of the inspection form configuration. It is called from `app/settings/index.tsx` via a two-case confirmation dialog (normal vs. destructive warning when inspections exist).

### What it currently does:

1. **Deactivates custom sections** — `UPDATE InspectionSections SET IsActive = 0` WHERE `IsDefault = 0`
2. **Deactivates custom fields** — `UPDATE InspectionFields SET IsActive = 0` WHERE FieldKey NOT IN (28 default keys)
3. **Deactivates non-default device types** — `UPDATE DeviceFieldDefinitions SET IsActive = 0` WHERE DeviceType NOT IN ('Camera', 'Switch')
4. **Deactivates non-default device options** — `UPDATE DeviceOptions SET IsActive = 0` WHERE DeviceType NOT IN ('Camera', 'Switch')
5. **Deletes non-default device types** — `DELETE FROM ProjectDeviceTypes` WHERE DeviceType NOT IN ('Camera', 'Switch')
6. **Restores default section properties** — Updates 10 default sections with canonical SectionName, Description, Icon, DisplayOrder, IsRepeatable, IsVisible=1, IsActive=1
7. **Restores default inspection fields** — Updates all 28 default fields with canonical FieldName, FieldType, Placeholder, DefaultValue, HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly, Width, Icon, IsActive=1
8. **Reactivates default device fields** — `UPDATE DeviceFieldDefinitions SET IsActive = 1` WHERE DeviceType IN ('Camera', 'Switch'), then updates 16 fields with canonical Label, FieldType, IsRequired, DisplayOrder, IsVisible=1
9. **Reactivates default device options** — `UPDATE DeviceOptions SET IsActive = 1` WHERE DeviceType IN ('Camera', 'Switch'), then updates 43 options with canonical OptionLabel, OptionValue, DisplayOrder, IsActive=1
10. **Replaces all FieldOptions** — `DELETE FROM FieldOptions` then re-inserts 66 entries from seed data
11. **Ensures default device types** — `INSERT OR IGNORE INTO ProjectDeviceTypes` for Camera and Switch

### What it does NOT do (gaps identified):

- **Does not restore FieldOption `IsDefault` flags** — The seed data (`field-options.data.ts`) has ZERO `IsDefault=1` entries. All 66 options are inserted with `IsDefault: 0`. This means after reset, no inspection dropdown field has a pre-selected default.
- **Does not restore DeviceOption `IsDefault` flags** — The `CANONICAL_DEVICE_OPTIONS` array in ResetRepository has no `IsDefault` property. The device options seed (`device-options.seed.ts`) also has no `IsDefault` column in its INSERT. After reset, no device dropdown field has a pre-selected default.
- **Does not enforce "max 1 default" for FieldOptions** — Nothing in the reset logic or the `FieldOptionRepository.create()`/`update()` methods prevents multiple options from having `IsDefault=1`.
- **Does not enforce "max 1 default" for DeviceOptions** — The `DeviceOptionsRepository.setDefault()` method correctly clears all defaults before setting one, but `update()` does NOT enforce this constraint — it blindly writes `IsDefault` as provided.

---

## B. Missing Behavior (What the User Wants)

### Part 1: Complete Property Restoration

The user wants the reset to restore **every property** of default configuration items to their canonical values. Currently missing:

1. **Inspection field defaults** — `DefaultValue` is restored (line 154), but no `IsDefault` flag exists on InspectionFields (defaults come from `DefaultValue` column, which IS restored ✅)
2. **FieldOption `IsDefault` flags** — Should be restored to match a defined canonical state. Currently seed data has zero defaults, so this is "correct" per seed — but the user may want to define canonical defaults.
3. **DeviceOption `IsDefault` flags** — Same issue. No canonical defaults defined.

### Part 2: Dropdown Default Enforcement

The user wants **every dropdown field** (both inspection FieldOptions and DeviceOptions) to enforce **max 1 default option**. Zero defaults allowed. One default allowed. Two or more defaults: not allowed.

Current enforcement gaps:
- `FieldOptionRepository.create()` — No enforcement. Sets `IsDefault` to whatever is passed (default 0).
- `FieldOptionRepository.update()` — No enforcement. Writes `IsDefault` as provided.
- `DeviceOptionsRepository.add()` — No enforcement. Sets `IsDefault` to whatever is passed.
- `DeviceOptionsRepository.update()` — No enforcement. Writes `IsDefault` as provided.
- `DeviceOptionsRepository.setDefault()` — ✅ Correctly enforces: clears all, then sets one.

---

## C. Why FieldOptions Allow Multiple Defaults

**Root cause:** No constraint at the repository layer or DB layer.

- The `FieldOptions` table schema has `IsDefault INTEGER DEFAULT 0` — no UNIQUE constraint, no CHECK constraint limiting to one per FieldID.
- `FieldOptionRepository.create()` accepts an optional `IsDefault` parameter (defaults to 0) and writes it directly.
- `FieldOptionRepository.update()` accepts an optional `IsDefault` parameter and writes it directly.
- There is no `setDefault()` method equivalent to `DeviceOptionsRepository.setDefault()`.

**The UI for managing FieldOptions is the sections/fields settings screens** — but those screens don't expose an `IsDefault` toggle for field options. The `IsDefault` on FieldOptions is only consumed by `SectionRenderer.tsx:80-82` to pre-select a dropdown value when creating a new inspection.

---

## D. Why DeviceOptions Enforce One Default

**Partial enforcement exists:**

- `DeviceOptionsRepository.setDefault()` (line 117-129) correctly does a two-step: clear all defaults for the field, then set the target option as default.
- The `device-options.tsx` UI uses this method when the user toggles the "Default Selection" switch.

**But `update()` doesn't enforce:**

- `DeviceOptionsRepository.update()` (line 107-115) writes `IsDefault` directly from the input without clearing other defaults first.
- If `update()` is called with `IsDefault: 1` while another option already has `IsDefault: 1`, both will have defaults.

---

## E. DB Operations During Reset

All operations run inside `db.withTransactionAsync()`. On error, the entire transaction rolls back.

| Step | Table | Operation | Condition |
|------|-------|-----------|-----------|
| 1 | InspectionSections | UPDATE IsActive=0 | IsDefault=0 |
| 2 | InspectionFields | UPDATE IsActive=0 | FieldKey NOT IN (28 defaults) |
| 3 | DeviceFieldDefinitions | UPDATE IsActive=0 | DeviceType NOT IN ('Camera','Switch') |
| 4 | DeviceOptions | UPDATE IsActive=0 | DeviceType NOT IN ('Camera','Switch') |
| 5 | ProjectDeviceTypes | DELETE | DeviceType NOT IN ('Camera','Switch') |
| 6 | InspectionSections | UPDATE (restore props) | SectionKey = default keys AND IsDefault=1 |
| 7 | InspectionFields | UPDATE (restore props) | FieldKey = default keys |
| 8 | DeviceFieldDefinitions | UPDATE IsActive=1 | DeviceType IN ('Camera','Switch') |
| 9 | DeviceFieldDefinitions | UPDATE (restore props) | DeviceType+FieldName matches |
| 10 | DeviceOptions | UPDATE IsActive=1 | DeviceType IN ('Camera','Switch') |
| 11 | DeviceOptions | UPDATE (restore props) | DeviceType+FieldName+OptionValue matches |
| 12 | FieldOptions | DELETE ALL | (unconditional) |
| 13 | FieldOptions | INSERT 66 rows | From seed data |
| 14 | ProjectDeviceTypes | DELETE | DeviceType NOT IN ('Camera','Switch') |
| 15 | ProjectDeviceTypes | INSERT OR IGNORE | Camera, Switch |

**Note:** Steps 14-15 are redundant with steps 5 and 5-again. The code runs `DELETE FROM ProjectDeviceTypes WHERE DeviceType NOT IN (?,?)` twice (lines 122-124 and 209-212).

---

## F. Invalid Records After Reset

**No invalid records are created by the reset itself.** The reset only touches configuration tables (InspectionSections, InspectionFields, DeviceFieldDefinitions, DeviceOptions, FieldOptions, ProjectDeviceTypes). It never touches data tables (InspectionValues, DeviceRecords, RepeatableValues, Photos).

However, **orphaned data can exist after reset**:
- If a custom field was deactivated, its values in `InspectionValues` still reference the `FieldID`. The field is `IsActive=0` so it won't appear in forms, but the data persists.
- If a custom section was deactivated, its fields' values persist in `InspectionValues`.
- This is **by design** — the user explicitly requested that inspection data is never deleted.

---

## G. Custom vs Default Identification

| Table | Default Indicator | Custom Indicator |
|-------|------------------|-----------------|
| InspectionSections | `IsDefault = 1` | `IsDefault = 0` |
| InspectionFields | `FieldKey` matches one of 28 hardcoded keys | `FieldKey` not in the 28 |
| DeviceFieldDefinitions | `DeviceType IN ('Camera', 'Switch')` | `DeviceType NOT IN ('Camera', 'Switch')` |
| DeviceOptions | `DeviceType IN ('Camera', 'Switch')` | `DeviceType NOT IN ('Camera', 'Switch')` |
| FieldOptions | Linked to default InspectionFields via FieldID FK | Linked to custom InspectionFields |
| ProjectDeviceTypes | `DeviceType IN ('Camera', 'Switch')` | `DeviceType NOT IN ('Camera', 'Switch')` |

**Key insight:** InspectionFields uses FieldKey-based identification (hardcoded list), while other tables use IsDefault flags or DeviceType-based identification. This is because InspectionFields need to be matched by semantic key, not just by existence.

---

## H. Historical Data Preservation

The reset **never touches** these data tables:
- `InspectionValues` — field values for inspections
- `DeviceRecords` — device record data (JSON blobs)
- `RepeatableValues` — repeatable group values
- `RepeatableRecords` — repeatable group records
- `Photos` — photo metadata
- `Inspections` — inspection records
- `InspectionPoleIdHistory` — pole ID history

**All historical data is preserved.** The reset only deactivates custom configuration items (sets `IsActive=0`). The data rows still exist and can be queried directly, but they won't appear in the UI because the configuration they reference is inactive.

---

## I. Historical Custom Config Renderability

After reset, custom configurations become **invisible in new inspections** but their data persists:

1. **Custom sections** → `IsActive=0` → `SectionRenderer` won't load them (filters by `IsActive=1`)
2. **Custom fields** → `IsActive=0` → `InspectionFieldRepository.getFieldsBySection()` filters by `IsActive=1`
3. **Custom device types** → `IsActive=0` → Device section won't appear
4. **Custom device options** → `IsActive=0` → Dropdown options won't load

**For existing inspections that used custom configs:**
- The `InspectionValues` rows still reference the `FieldID` of now-inactive fields
- If the user opens an old inspection, those values **will not render** because the field is inactive
- This is the expected behavior — the user was warned: "Data stored for those custom configurations in existing inspections will remain but will no longer appear in the form"

**Can custom configs be re-activated?** Not currently. There's no "undo reset" or "reactivate custom" feature. Once reset, custom configurations are gone (unless restored from a template backup).

---

## J. Minimal Safe Implementation

### Part 1: Complete Property Restoration

**Changes needed:**

1. **`ResetRepository.ts`** — No changes needed for property restoration. All canonical properties are already restored. The only gap is `IsDefault` flags on FieldOptions and DeviceOptions, which leads to Part 2.

### Part 2: Dropdown Default Enforcement

**Approach: Repository-level enforcement (recommended)**

This is the safest approach because it enforces the constraint regardless of which UI or code path sets defaults.

#### Changes to `FieldOptionRepository.ts`:

1. **Add `setDefault(fieldId, optionId)` method** — mirrors `DeviceOptionsRepository.setDefault()`:
   ```typescript
   static async setDefault(fieldId: number, optionId: number): Promise<void> {
     const db = await getDatabase();
     await db.runAsync(
       `UPDATE FieldOptions SET IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP
        WHERE FieldID = ? AND IsActive = 1`,
       [fieldId]
     );
     await db.runAsync(
       `UPDATE FieldOptions SET IsDefault = 1, UpdatedAt = CURRENT_TIMESTAMP
        WHERE OptionID = ?`,
       [optionId]
     );
   }
   ```

2. **Add enforcement in `create()` and `update()`** — When `IsDefault=1` is set, clear other defaults first:
   ```typescript
   // In create(), after insert:
   if (data.IsDefault === 1) {
     await db.runAsync(
       `UPDATE FieldOptions SET IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP
        WHERE FieldID = ? AND IsActive = 1 AND OptionID != ?`,
       [data.FieldID, result.lastInsertRowId]
     );
   }
   ```

#### Changes to `DeviceOptionsRepository.ts`:

1. **Add enforcement in `update()`** — When `IsDefault=1` is set, clear other defaults first:
   ```typescript
   // In update(), before the UPDATE:
   if (option.IsDefault === 1) {
     await db.runAsync(
       `UPDATE DeviceOptions SET IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP
        WHERE DeviceType = ? AND FieldName = ? AND TemplateID = ? AND IsActive = 1
        AND OptionID != ?`,
       [option.DeviceType, option.FieldName, option.TemplateID ?? 1, option.OptionID!]
     );
   }
   ```

2. **Add enforcement in `add()`** — When `IsDefault=1` is set, clear other defaults first.

#### Changes to `ResetRepository.ts`:

1. **Remove redundant DELETE** — Lines 209-212 duplicate lines 122-124.

#### Changes to `device-options.tsx` (UI):

1. **Toggle behavior** — When user sets a new default, the `setDefault()` call already clears others. No change needed here.

#### Changes to FieldOptions settings UI (if exists):

Currently there's no UI for managing FieldOption defaults. The `IsDefault` flag is only set programmatically. If the user wants to expose this in the UI, that's a separate feature.

### Summary of Changes

| File | Change | Risk |
|------|--------|------|
| `FieldOptionRepository.ts` | Add `setDefault()` method + enforcement in `create()`/`update()` | Low — additive, backward-compatible |
| `DeviceOptionsRepository.ts` | Add enforcement in `update()` and `add()` | Low — additive, backward-compatible |
| `ResetRepository.ts` | Remove redundant DELETE | Trivial |
| `device-options.tsx` | No change needed | None |

---

## K. Tests Required

### FieldOptionRepository tests:

1. `setDefault()` clears other defaults and sets target
2. `create()` with `IsDefault=1` clears other defaults
3. `update()` with `IsDefault=1` clears other defaults
4. `create()` with `IsDefault=0` does NOT clear other defaults
5. Multiple calls to `setDefault()` result in exactly one default
6. `setDefault()` with non-existent optionId doesn't crash

### DeviceOptionsRepository tests:

1. `update()` with `IsDefault=1` clears other defaults
2. `add()` with `IsDefault=1` clears other defaults
3. `setDefault()` already works (verify existing tests)
4. `update()` with `IsDefault=0` does NOT clear other defaults

### ResetRepository tests (existing 27 tests):

1. Verify existing tests still pass (no regression)
2. Add test: after reset, no FieldOptions have `IsDefault=1` (matches seed data)
3. Add test: after reset, no DeviceOptions have `IsDefault=1` (matches seed data)

### Integration test:

1. Set a FieldOption as default, run reset, verify all defaults are cleared
2. Set a DeviceOption as default, run reset, verify all defaults are cleared

---

## L. Risks

1. **Low risk: Repository enforcement changes** — Adding enforcement in `create()`/`update()` is backward-compatible. Existing callers that pass `IsDefault=0` (or omit it) are unaffected.

2. **Low risk: Removing redundant DELETE** — The duplicate `DELETE FROM ProjectDeviceTypes` in ResetRepository is safe to remove.

3. **Medium risk: FieldOptions UI exposure** — If the user wants to expose FieldOption defaults in the UI (currently not exposed), that requires new UI work. The repository-level enforcement is ready regardless.

4. **No risk: Historical data** — Reset never touches data tables. All inspection data, photos, and device records are preserved.

5. **No risk: Seed data** — Seed files are not modified. Reset imports directly from seeds.

6. **Android-specific: Sequential DB model** — All changes respect the sequential open/close model. No dual connections are opened.

---

## Recommendation

**Proceed with Part 2 only** (dropdown default enforcement at repository level). Part 1 is already complete — all canonical properties are restored by the existing reset logic.

The changes are:
1. Add `setDefault()` + enforcement to `FieldOptionRepository`
2. Add enforcement to `DeviceOptionsRepository.update()` and `add()`
3. Remove redundant DELETE in `ResetRepository`
4. Add tests

Estimated scope: ~50 lines of production code, ~80 lines of tests.
