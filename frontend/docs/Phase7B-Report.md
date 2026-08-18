# Phase 7B — Normal Inspection Field Default Persistence Report

## Bug
Normal inspection-section dropdown field defaults display in form but are blank in Excel/CSV export until the user manually touches the field.

## Root Cause
Identical pattern to Phase 7A (Device Type default persistence). In `SectionRenderer.tsx` `loadSection()`, default values (IsDefault option, Field.DefaultValue) were resolved into React state (`valueMap`) but **never persisted** to `InspectionValues` table. When export reads from `InspectionValues`, the field is empty — it was never saved to DB.

## Fix
**File:** `frontend/src/components/inspection/SectionRenderer.tsx`

After resolving the value for each field (saved → IsDefault → DefaultValue → ""), added a persistence call:

```typescript
if (!saved && resolved) {
  await InspectionValueRepository.saveValue(inspectionId, field.FieldID, resolved);
}
```

This ensures defaults are persisted to `InspectionValues` table on section load. Both Excel and CSV export read from the same `InspectionValues` source, so the fix applies to both.

### Key Design Decisions
1. **Only persist when `saved` is null** — existing user data is never overwritten
2. **Only persist when resolved value is non-empty** — empty strings are not persisted
3. **Persists in `loadSection()` useEffect** — not during render, not on every render; safe for DB writes
4. **Resolves all defaults first, then persists** — consistent value map before persistence
5. **No change to export logic** — source of truth (`InspectionValues`) is now correctly populated

### Value Precedence (unchanged)
1. Saved value (`InspectionValues.FieldValue`)
2. IsDefault option (`FieldOption.IsDefault=1`)
3. Field default (`InspectionFields.DefaultValue`)
4. Empty string

## Test Coverage — 15 Regression Tests
**File:** `frontend/src/__tests__/components/inspection/SectionRenderer.defaultPersistence.test.tsx`

| # | Test | Verifies |
|---|------|----------|
| 1 | NEW dropdown field + IsDefault → saveValue called | Default option persisted |
| 2 | NEW text field + DefaultValue → saveValue called | Text default persisted |
| 3 | EXISTING saved value wins over IsDefault | Existing data not overwritten |
| 4 | EXISTING saved value wins over Field.DefaultValue | Existing data not overwritten |
| 5 | No default and no saved value → no saveValue | Empty not persisted |
| 6 | TEXT field with no default → no saveValue | Empty not persisted |
| 7 | Multiple fields get own defaults independently | Per-field isolation |
| 8 | Default for Field A doesn't affect Field B | No cross-field contamination |
| 9 | saveValue not called repeatedly on re-render | Idempotent behavior |
| 10 | Existing value after default change → preserved | Precedence correct |
| 11 | saveValue receives correct inspectionId and fieldId | Correct targeting |
| 12 | Multiple inspections each get own defaults | Per-inspection isolation |
| 13 | Value precedence: saved > IsDefault > DefaultValue > empty | Full precedence chain |
| 14 | Non-dropdown field without DefaultValue → no saveValue | No false persistence |
| 15 | DefaultValue with empty string → no saveValue | Empty string skipped |

## Verification

| Gate | Result |
|------|--------|
| Jest (all) | 100 suites / 1217 tests (1 skipped) — all green |
| TSC | Clean |
| Lint | 0 errors, 622 pre-existing warnings |
| Tests (Phase 7B) | 15/15 passing |

## Files Changed
- `frontend/src/components/sectionRenderer.tsx` — 4 lines added: persist resolved defaults in loadSection()
- `frontend/src/__tests__/components/inspection/SectionRenderer.defaultPersistence.test.tsx` — 15 new regression tests
