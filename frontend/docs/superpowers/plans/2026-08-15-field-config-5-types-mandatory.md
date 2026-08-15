# Field Configuration — 5 Field Types + Numbers + Device Mandatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict NEW field creation to exactly 5 field types (Text Input, Numbers, Multiline Text, Dropdown, Checkbox) on BOTH the Sections flow and the Device Types flow; fix Numbers numeric input behavior (0 valid, empty distinct from 0, no arbitrary text); align the two New Field/Add Field popups; and fix the Device Type Mandatory bug by enforcing `DeviceFieldDefinitions.IsRequired` in the validation/save layer.

**Architecture:** One shared `CREATEABLE_FIELD_TYPES` constant (5 entries) drives both New Field dialogs so they can never drift apart; the existing 9-entry `FIELD_TYPES` is kept solely for legacy label lookup (`getTypeLabel`) and template import. Numbers input is sanitized by a single pure helper shared by `renderFieldInput.tsx` and `DeviceSection.tsx` (integer-only for `camera_count`/`switch_count`, digits + one decimal otherwise). Mandatory is enforced at the validation layer: the existing `validateInspection` gains per-type empty rules for sections, and a new `validateDeviceMandatory` parses each `DeviceRecords.DeviceData` JSON against `DeviceFieldDefinitions.IsRequired`. Device values are flushed deterministically: `DeviceSection` registers the latest in-memory record per key into a module-level registry synchronously; `flushPendingDeviceSaves()` cancels all timers and writes the latest records to SQLite immediately (no waiting on the 500 ms debounce), and only then does validation run — so results never depend on timing. No schema change is needed (`FieldType` is a free-text column, no enum constraint).

**Tech Stack:** TypeScript (strict), expo-sqlite v16 (sequential open/close model — NEVER dual connections), react-native-paper dialogs, Jest (jest-expo + in-memory SQLite mock), Yarn 1.22.

## Global Constraints

- **Never commit.** The user explicitly forbade commits ("Do NOT commit"). Every task ends with a verification run, not a `git commit`.
- **5 allowed NEW types (verbatim):** `text` (Text Input), `number` (Numbers), `multiline` (Multiline Text), `dropdown` (Dropdown), `checkbox` (Checkbox). Same order, same labels, on BOTH flows.
- **Legacy types stay in data + render.** `date`, `date_auto`, `time`, `GPS` (sections) and any existing device `date`/other fields are NOT deleted, NOT migrated, NOT removed from `VALID_FIELD_TYPES` (template import, 13 entries, stays as-is), `DashboardCardManager.FIELD_TYPE_LABELS`, or `SmartCardGenerator`. Only NEW-field creation offers the 5.
- **Edit fallback:** when editing an existing field whose type is outside the 5, the dialog must show that legacy type as a non-removable indicator chip (NOT silently change the type on save).
- **Numbers rules:** numeric field, NOT free text. `"0"` is a valid value. Empty (`""`) is distinct from `"0"` and is treated as missing when required. Non-numeric characters are stripped, never stored. Count fields (`camera_count`, `switch_count`) remain integer-only.
- **Mandatory enforcement lives in the validation layer**, not just UI: `handleSave` and `validateBeforeExit` in `app/inspection/new.tsx` must both block when a required field is empty, identify the missing field(s) by name, and preserve all entered values (no navigation away, no data loss).
- **Per-type empty rules (verbatim):** text/multiline — whitespace-only is invalid; numbers — no value is invalid, `"0"` is valid; dropdown — no selection is invalid; checkbox — must be checked (`"1"`) when required (convention decision; see Task 5 rationale).
- **Deterministic validation — NEVER timer-dependent (verbatim user requirement).** Mandatory validation must NOT depend on the 500 ms `DeviceSection` debounce. `DeviceSection` keeps a module-level registry of the **latest in-memory record per key** (updated synchronously on every keystroke; the 500 ms timer only triggers the happy-path write). Validation flow is: **(1) flush** — `flushPendingDeviceSaves()` cancels all pending timers and writes every latest in-memory record to SQLite **immediately** (awaiting the writes themselves, NOT the timeout), **(2) validate** against the flushed rows, **(3) save**. A just-typed value must be visible to validation instantly; a cleared value must be rejected instantly — regardless of how much time elapsed since the keystroke.
- **AGENTS.md isolation (mandatory):** all device/section field data lives in the project DB only; no new tables, no cross-DB joins, no `getGlobalDatabase()` during the inspection flow. Route all access through `src/database/repositories/`.
- **Sequential DB model:** never open a second SQLite handle; never call `getGlobalDatabase()` mid-flow. `app/inspection/new.tsx` gets project data from params/context (already does).
- **No placeholders, no dead code.** Each removed/added behavior ships with its tests in the same task.
- **Run from `frontend/`.** Full gate: `yarn test --silent` (expect ~69 suites, 808 tests), `npx tsc --noEmit` (exit 0), `yarn lint` (0 errors; pre-existing warnings OK).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/database/repositories/FieldRepository.ts` (MODIFY) | add `CREATEABLE_FIELD_TYPES` (5) next to `FIELD_TYPES` (keep 9 for labels); change number label to `Numbers` in both lists |
| `frontend/src/utils/fieldInput.ts` (NEW) | `sanitizeNumberInput(text, { integerOnly })` pure helper; shared by renderFieldInput + DeviceSection |
| `frontend/src/components/inspection/renderFieldInput.tsx` (MODIFY) | NUMBER case uses shared sanitizer (decimal-pad, digits + one decimal); count fields integer-only |
| `frontend/src/components/inspection/DeviceSection.tsx` (MODIFY) | NUMBER fields get numeric keyboard + shared sanitizer (today they render as plain free-text inputs) |
| `frontend/app/settings/fields.tsx` (MODIFY) | dialog chip list → `CREATEABLE_FIELD_TYPES`; keep `FIELD_TYPES` for `getTypeLabel`; legacy-edit indicator chip; popup layout aligned (wrap grid) |
| `frontend/src/components/app/settings/components/DeviceTypeDialogs.tsx` (MODIFY) | delete local `FIELD_TYPES` (5); import `CREATEABLE_FIELD_TYPES`; legacy-edit indicator chip; popup layout aligned (wrap grid) |
| `frontend/src/database/repositories/InspectionRepository.ts` (MODIFY) | `validateInspection`: per-type empty rules (number/checkbox cases); add `validateDeviceMandatory(inspectionId)` + `flushPendingDeviceSaves()` call |
| `frontend/src/database/repositories/DeviceRecordsRepository.ts` (MODIFY) | add module-level pending-save registry + `flushPendingDeviceSaves()` |
| `frontend/src/components/inspection/DeviceSection.tsx` (MODIFY) | register debounced saves into the registry (Task 4) |
| `frontend/app/inspection/new.tsx` (MODIFY) | `handleSave` + `validateBeforeExit`: flush pending device saves, then run BOTH section + device validation and merge missing lists |
| Tests (NEW/MODIFY) | `fieldInput.test.ts` (new), `renderFieldInput.test.tsx` (new), `DeviceSection.test.tsx` (new), `fields.test.tsx` (new), `DeviceTypeDialogs.test.tsx` (new), `InspectionRepository.test.ts` (extend), `DeviceRecordsRepository.test.ts` (extend), `schema.test.ts` (CREATEABLE ⊆ VALID_FIELD_TYPES) |
| Docs (MODIFY) | `docs/06-Memory.md`, `docs/09-Decisions.md` (note checkbox-mandatory convention + shared 5-type constant) |

**Task dependency order:** 1 → 2 → 3 → 4 → 5 → 6 → 7. Each task ends with green gates so the tree compiles and passes at every checkpoint.

---

## Task 1: Shared `CREATEABLE_FIELD_TYPES` constant (5 types)

**Files:**
- Modify: `frontend/src/database/repositories/FieldRepository.ts`
- Test: `frontend/src/__tests__/database/repositories/FieldRepository.test.ts`

**Interfaces:**
- Produces: `CREATEABLE_FIELD_TYPES: readonly { value: string; label: string }[]` — `[text/Text Input, number/Numbers, multiline/Multiline Text, dropdown/Dropdown, checkbox/Checkbox]`.
- `FIELD_TYPES` (9) stays unchanged in shape but its `number` label changes to `"Numbers"` (cosmetic consistency).
- Invariant test: every `CREATEABLE_FIELD_TYPES` value is present in `FIELD_TYPES` and in `templateData.ts` `VALID_FIELD_TYPES`.

- [ ] **Step 1: Write the failing tests** in `FieldRepository.test.ts`:
  - `CREATEABLE_FIELD_TYPES` has exactly the 5 expected `{value,label}` pairs in order.
  - Every `CREATEABLE_FIELD_TYPES` value ⊆ `FIELD_TYPES` values (constant is a strict subset of the legacy list).
  - `getTypeLabel` still resolves legacy values not in the createable list (e.g. `"GPS"`, `"date_auto"`, `"date"`).
- [ ] **Step 2: Implement** `CREATEABLE_FIELD_TYPES` in `FieldRepository.ts` next to `FIELD_TYPES`.
- [ ] **Step 3: Gate** — `yarn test --silent FieldRepository` green; `npx tsc --noEmit` exit 0.

---

## Task 2: Numbers input behavior (shared sanitizer)

**Files:**
- Create: `frontend/src/utils/fieldInput.ts`
- Modify: `frontend/src/components/inspection/renderFieldInput.tsx`
- Test: `frontend/src/__tests__/utils/fieldInput.test.ts`
- Test: `frontend/src/__tests__/components/inspection/renderFieldInput.test.tsx` (new)

**Interfaces:**
- Produces: `sanitizeNumberInput(text: string, opts?: { integerOnly?: boolean }): string`
  - default: keeps `[0-9]` and a single leading decimal point; strips all other chars; `""` stays `""`; `"0"` stays `"0"`.
  - `integerOnly: true`: keeps only `[0-9]` (unchanged behavior for count fields).
- `renderFieldInput.tsx` NUMBER case: `keyboardType="decimal-pad"`, `onChangeText={updateNumber}` where `updateNumber` uses `sanitizeNumberInput`; for `camera_count`/`switch_count` (detected via `fieldKey`) uses `integerOnly: true`; empty → `""` (NOT `"0"`).

- [ ] **Step 1: Write the failing tests** in `fieldInput.test.ts`:
  - `sanitizeNumberInput("12")` === `"12"`; `sanitizeNumberInput("")` === `""`; `sanitizeNumberInput("0")` === `"0"`.
  - `sanitizeNumberInput("12.5")` === `"12.5"`; `sanitizeNumberInput("12.5.7")` === `"12.57"` (single decimal point kept, rest stripped).
  - `sanitizeNumberInput("abc-12.5x")` === `"12.5"` (non-numeric stripped, minus sign dropped — no negatives).
  - `sanitizeNumberInput("abc", { integerOnly: true })` === `""`; `sanitizeNumberInput("12.9", { integerOnly: true })` === `"129"`.
- [ ] **Step 2: Write the failing component tests** in `renderFieldInput.test.tsx`:
  - NUMBER field typed `"12.5"` → `onChange` called with `"12.5"`; empty → `onChange` with `""`.
  - `camera_count` typed `"12.9"` → `onChange` with `"129"` and `onCameraCountChange` with `129`.
  - `camera_count` cleared → `onChange` with `""`, `onCameraCountChange` with `0` (empty maps to 0 for the count callback only; storage stays `""`).
- [ ] **Step 3: Implement** `fieldInput.ts` + rewire `renderFieldInput.tsx` NUMBER case.
- [ ] **Step 4: Gate** — `yarn test --silent renderFieldInput fieldInput` green; `npx tsc --noEmit` exit 0.

---

## Task 3: Device Type Numbers input (DeviceSection)

**Files:**
- Modify: `frontend/src/components/inspection/DeviceSection.tsx`
- Test: `frontend/src/__tests__/components/inspection/DeviceSection.test.tsx` (new)

**Interfaces:**
- Produces: in `DeviceSection.tsx` `renderField`, a `"number"` `FieldType` renders a `TextInput` with `keyboardType="decimal-pad"` and `onChangeText` → `sanitizeNumberInput` (default mode); empty → `null` (matches existing `text || null` storage convention). Dropdown and other non-number fields unchanged.

- [ ] **Step 1: Write the failing tests** in `DeviceSection.test.tsx` (react-test-renderer; mock the three repositories + the debounce):
  - Number field for a device renders a `TextInput` with `keyboardType="decimal-pad"`.
  - Typing `"abc12.5"` → stored `DeviceData` contains `"12.5"` for that `FieldName`; typing empty → `null`.
  - Non-number (text/dropdown) fields keep their existing behavior (regression: dropdown options load, text is free).
- [ ] **Step 2: Implement** the number branch in `DeviceSection.renderField`.
- [ ] **Step 3: Gate** — `yarn test --silent DeviceSection` green; `npx tsc --noEmit` exit 0.

---

## Task 4: Device Mandatory — deterministic flush + `validateDeviceMandatory`

**Files:**
- Modify: `frontend/src/database/repositories/DeviceRecordsRepository.ts`
- Modify: `frontend/src/components/inspection/DeviceSection.tsx`
- Modify: `frontend/src/database/repositories/InspectionRepository.ts`
- Test: `frontend/src/__tests__/database/repositories/DeviceRecordsRepository.test.ts` (extend)
- Test: `frontend/src/__tests__/database/repositories/InspectionRepository.test.ts` (extend)

**Interfaces:**
- Produces:
  - Module-level latest-record registry in `DeviceRecordsRepository`:
    - `scheduleDeviceRecordSave(key: string, record: DeviceRecord, debounceMs = 500)` — stores the LATEST record under `key` (replaces any prior), resets the per-key timer. The timer, when it fires, writes that record via `save()` and removes the key. No DB write happens at registration time.
    - `flushPendingDeviceSaves(): Promise<void>` — cancels every pending timer and, for each key, writes the **latest** record to SQLite immediately; awaits all writes (`Promise.all`); removes the keys. Resolves immediately when nothing is pending. This is synchronous-in-effect (no `setTimeout` wait), deterministic, and idempotent.
  - `DeviceSection.debouncedSave(record)` — keys by `RecordID` (or `-DeviceNo` for new records); on change it calls `scheduleDeviceRecordSave` with the freshly-built record so the registry always holds the newest value. On its timer firing, clear the registry entry.
  - `InspectionRepository.validateDeviceMandatory(inspectionId, templateId?): Promise<{ valid: boolean; missingFields: string[] }>`:
    1. `SELECT` required device field defs (`IsRequired = 1 AND IsActive = 1` for the default template).
    2. Load all `DeviceRecords` for the inspection.
    3. For each record, `JSON.parse(DeviceData)`; a required field is missing when its value is empty per the per-type rules (Task 5 reuses the same empty-check helper).
    4. Missing label format: `"<DeviceType> — <Label> (Device <DeviceNo>)"` (e.g. `"Camera — Camera Type (Device 1)"`).

**Determinism contract (verbatim test scenarios — must pass with `jest.useFakeTimers()` and NO `advanceTimersByTime` call):**
- Enter a required device field value → press Save immediately → flush writes the latest record → `validateDeviceMandatory` sees the value → valid.
- Clear a required device field → press Save immediately → flush writes the cleared record → validation rejects with the field named.
- The result is identical whether the 500 ms timer is still pending, has fired, or has never been scheduled.

- [ ] **Step 1: Write the failing registry tests** in `DeviceRecordsRepository.test.ts`:
  - `scheduleDeviceRecordSave` twice for the same key (e.g. "1" then "12") → `flushPendingDeviceSaves` persists ONLY the latest value (the 500 ms timer must NOT have fired).
  - `flushPendingDeviceSaves` with no pending → resolves immediately, no DB call.
  - **Timer-independence:** with fake timers, schedule a save, then `flushPendingDeviceSaves()` WITHOUT advancing timers → the write completes and the value is queryable from the DB; the pending timer is cancelled (no second write after `advanceTimersByTime(500)`).
  - Multiple keys flushed concurrently all persist their latest values.
- [ ] **Step 2: Write the failing validator tests** in `InspectionRepository.test.ts`:
  - Required device field with empty `DeviceData` value → `valid:false`, missing list contains the formatted label.
  - Same field filled → `valid:true`.
  - A record with unparseable `DeviceData` JSON → treated as all-missing (safely, no throw).
  - **Save-path integration (fake timers, no advance):** seed a required field def + an in-memory record, `scheduleDeviceRecordSave` with a value, `flushPendingDeviceSaves()`, then `validateDeviceMandatory` → `valid:true`. Repeat with the value cleared → `valid:false`.
- [ ] **Step 3: Implement** registry + `flushPendingDeviceSaves` in `DeviceRecordsRepository`, rewire `DeviceSection.debouncedSave` onto it, add `validateDeviceMandatory` in `InspectionRepository`.
- [ ] **Step 4: Gate** — `yarn test --silent DeviceRecordsRepository InspectionRepository` green; `npx tsc --noEmit` exit 0.

---

## Task 5: Per-type mandatory rules in section validation (incl. checkbox convention)

**Files:**
- Modify: `frontend/src/database/repositories/InspectionRepository.ts`
- Test: `frontend/src/__tests__/database/repositories/InspectionRepository.test.ts`

**Decision (checkbox convention):** A **required checkbox must be checked** (`"1"`). Rationale: the app stores checkbox state as `"1"`/`"0"` (see `renderFieldInput.tsx` CHECKBOX + SWITCH), and a required boolean/acknowledgement field is meaningless unless affirmatively set. An unchecked `"0"` is treated as "not done" and is missing when required. This mirrors the existing `SWITCH` semantics (only `"1"` means on). (Alternative — "any explicit value including `0`" — was rejected because it would let a user silently pass a required checkbox by unchecking it.)

**Interfaces:**
- Produces: shared empty-check helper `isFieldValueEmpty(type: string, value: string): boolean` used by BOTH `validateInspection` and `validateDeviceMandatory`:
  - `text`/`multiline`: `value.trim() === ""`
  - `number`: `value === ""` (i.e. `"0"` is NOT empty)
  - `dropdown`: `value.trim() === ""`
  - `checkbox`: `value !== "1"`
  - `switch`: `value !== "1"`
  - default: `value.trim() === ""`
- `validateInspection` loop uses this helper instead of the current single `!value || value.trim() === ""` rule. `autoFilledFields` (`date`, `division`, `district`) skip logic unchanged.

- [ ] **Step 1: Write the failing tests** in `InspectionRepository.test.ts`:
  - Required `number` field with `"0"` → valid; with `""` → missing.
  - Required `text` field with `"   "` (whitespace) → missing.
  - Required `checkbox` with `"0"` → missing; with `"1"` → valid.
  - Required `switch` with `"0"` → missing; with `"1"` → valid.
  - Existing cases (empty text missing; auto-filled date/division/district skipped) still pass.
- [ ] **Step 2: Implement** the helper + rewire `validateInspection`.
- [ ] **Step 3: Gate** — `yarn test --silent InspectionRepository` green; `npx tsc --noEmit` exit 0.

---

## Task 6: Wire device mandatory into save/exit flow + popup UI alignment

**Files:**
- Modify: `frontend/app/inspection/new.tsx`
- Modify: `frontend/app/settings/fields.tsx`
- Modify: `frontend/src/components/app/settings/components/DeviceTypeDialogs.tsx`
- Test: `frontend/src/__tests__/components/inspection/...` (extend existing `new.tsx`-adjacent test if present; otherwise component-level via `fields.test.tsx` / `DeviceTypeDialogs.test.tsx`)

**Interfaces:**
- Produces:
  - `new.tsx` `handleSave` + `validateBeforeExit` follow the exact deterministic order:
    1. `await DeviceRecordsRepository.flushPendingDeviceSaves()` (cancel timers, write latest — no timeout wait)
    2. `await InspectionRepository.validateInspection` (sections, per-type rules)
    3. `await InspectionRepository.validateDeviceMandatory` (devices, flushed rows)
    4. Merge both `missingFields` into ONE Alert; abort on any missing; otherwise proceed to `updateInspectionStatus("Completed")` / `router.back()`.
  - `fields.tsx` dialog chip list → `CREATEABLE_FIELD_TYPES` (wrap grid layout preserved); when editing a field whose type is not in the 5, render an extra non-interactive indicator chip with `getTypeLabel(fieldType)`; `FIELD_TYPES` still used for card chips + `getTypeLabel`.
  - `DeviceTypeDialogs.tsx` `FieldDialog`: local `FIELD_TYPES` removed; imports `CREATEABLE_FIELD_TYPES`; same legacy-edit indicator chip; chip row switched from horizontal `ScrollView` to a wrap grid matching `fields.tsx` (`chipRowStyle`).

- [ ] **Step 1: Write the failing UI tests**:
  - `fields.test.tsx`: "New Field" dialog renders exactly 5 type chips with the createable labels (no Date/Date (Auto)/Time/GPS); editing a legacy `GPS` field renders the indicator chip and saving preserves `GPS`.
  - `DeviceTypeDialogs.test.tsx`: `FieldDialog` renders exactly the same 5 chips/labels; no `Date`; editing a legacy field preserves its type.
- [ ] **Step 2: Write the failing save-flow integration tests** for `new.tsx` (react-test-renderer, fake timers, mock repositories as in `GeneralInformation.test.tsx`):
  - **Immediate-save success:** render with a required device field; type a value into the device field (updates the registry synchronously); press Save WITHOUT advancing timers → `flushPendingDeviceSaves` called first → `validateDeviceMandatory` returns valid → `updateInspectionStatus("Completed")` invoked → success alert shown.
  - **Immediate-save rejection after clear:** type then clear a required device field; press Save immediately → flush runs → validation rejects → Alert lists `"<DeviceType> — <Label> (Device <DeviceNo>)"` → `updateInspectionStatus` NOT invoked → no navigation.
  - **Exit path:** same flush→validate order on `validateBeforeExit` (hardware back) so a just-typed required value does not block exit.
- [ ] **Step 3: Implement** the `new.tsx` flow changes (flush → validate sections → validate devices → merged alert).
- [ ] **Step 4: Implement** the two dialog changes.
- [ ] **Step 5: Gate** — `yarn test --silent fields DeviceTypeDialogs new` green; `npx tsc --noEmit` exit 0.

---

## Task 7: Regression coverage + full gate

**Files:**
- Test: `frontend/src/__tests__/database/schema.test.ts` (extend)
- Test: `frontend/src/__tests__/database/isolation.test.ts` (extend, AGENTS.md mandatory pattern — device field definitions are per-project; assert a device field created in Project A is absent in Project B)

**Interfaces:**
- Produces: invariant + isolation regression tests.

- [ ] **Step 1: Write the tests**:
  - `schema.test.ts`: every `CREATEABLE_FIELD_TYPES` value is in `VALID_FIELD_TYPES` (template import can round-trip any createable type).
  - `isolation.test.ts`: mirror the existing isolation pattern for `DeviceFieldDefinitions` — create a device field in Project A, open Project B, assert it does NOT appear.
  - `new.tsx`-flow regression: section required `checkbox` unchecked blocks `handleSave`; filled device mandatory field unblocks.
  - **Timer-determinism regression (verbatim user scenarios, fake timers, no advance):** (a) enter a required device field → immediate Save → validation sees the value → inspection saves successfully; (b) clear a required device field → immediate Save → validation rejects it. Both run under `jest.useFakeTimers()` with the 500 ms timer pending and never advanced — proving the result does not depend on timing.
- [ ] **Step 2: Full gate run** from `frontend/`:
  - `yarn test --silent` (all suites green)
  - `npx tsc --noEmit` (exit 0)
  - `yarn lint` (0 errors; pre-existing warnings OK)
- [ ] **Step 3: Final review** — verify no commits were made, no legacy data types removed, both popups show identical 5 types.

---

## Completion Checklist

- [ ] Both New Field popups show exactly: Text Input, Numbers, Multiline Text, Dropdown, Checkbox — same order/labels.
- [ ] Legacy fields (date, date_auto, time, GPS, device date, etc.) still render and edit without type loss.
- [ ] Numbers field: `"0"` valid; empty distinct from 0; non-numeric stripped; `camera_count`/`switch_count` integer-only.
- [ ] Device Number fields no longer accept arbitrary text.
- [ ] Required checkbox = checked (`"1"`); required `"0"` blocks save.
- [ ] Device Type Mandatory enforced in `handleSave` AND `validateBeforeExit`, with per-device missing labels and no data loss.
- [ ] Validation is deterministic and timer-independent: `flushPendingDeviceSaves()` cancels timers and writes the latest records immediately; the immediate-save success + immediate-save-rejection tests pass under fake timers with NO timer advancement.
- [ ] `validateDeviceMandatory` + flush tested; the 500 ms debounce never gates validation.
- [ ] Template import still accepts all 13 legacy types.
- [ ] Isolation regression test present; no cross-DB leaks.
- [ ] Full gates green; no commits.
