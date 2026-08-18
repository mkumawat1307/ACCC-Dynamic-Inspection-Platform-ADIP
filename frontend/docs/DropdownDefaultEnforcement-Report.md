# Dropdown Default Enforcement — Final Report

**Date:** 2026-08-17  
**Status:** Implementation complete — all gates pass

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/database/repositories/FieldOptionRepository.ts` | Added `setDefault()` method + enforcement in `create()`/`update()` |
| `frontend/src/database/repositories/DeviceOptionsRepository.ts` | Added enforcement in `update()`/`add()` + `setDefault()` method |
| `frontend/src/database/repositories/ResetRepository.ts` | Removed redundant DELETE from ProjectDeviceTypes |
| `frontend/src/__tests__/repositories/FieldOptionRepository.test.ts` | NEW: 9 tests for default enforcement |
| `frontend/src/__tests__/repositories/DeviceOptionsRepository.test.ts` | NEW: 7 tests for default enforcement |
| `frontend/src/__tests__/repositories/ResetRepository.test.ts` | Added 4 new tests (28-31) |
| `frontend/src/__tests__/repositories/DropdownDefaultInvariant.test.ts` | NEW: 7 invariant tests |

---

## Repository Behavior: Before vs After

### FieldOptionRepository

| Operation | Before | After |
|-----------|--------|-------|
| `create()` | Writes `IsDefault` directly | If `IsDefault=1`, clears sibling defaults first |
| `update()` | Writes `IsDefault` directly | If `IsDefault=1`, clears sibling defaults first |
| `setDefault()` | **Did not exist** | Clears all siblings, sets target as default |

### DeviceOptionsRepository

| Operation | Before | After |
|-----------|--------|-------|
| `add()` | Writes `IsDefault` directly (not even in INSERT) | If `IsDefault=1`, clears sibling defaults first |
| `update()` | Writes `IsDefault` directly | If `IsDefault=1`, clears sibling defaults first |
| `setDefault()` | ✅ Already worked | No change |

### ResetRepository

| Operation | Before | After |
|-----------|--------|-------|
| `performReset()` | Had redundant DELETE from ProjectDeviceTypes | Removed redundant DELETE |

---

## Tests Added

### FieldOptionRepository (9 tests)
1. `setDefault` makes exactly one option default
2. `setDefault` clears previous default
3. Clearing default allows zero defaults
4. `create(IsDefault=1)` clears sibling default
5. `create(IsDefault=0)` does not clear sibling default
6. `update(IsDefault=1)` clears sibling default
7. `update(IsDefault=0)` does not clear sibling default
8. Unrelated dropdown is unaffected (isolation)
9. 3+ options still produce maximum one default

### DeviceOptionsRepository (7 tests)
10. Existing `setDefault` behavior remains correct
11. `update(IsDefault=1)` clears previous default
12. `update(IsDefault=0)` does not clear other defaults
13. `add(IsDefault=1)` clears previous default
14. `add(IsDefault=0)` does not clear other defaults
15. Unrelated DeviceType/field is unaffected (isolation)
16. Repeated default changes remain correct

### ResetRepository (4 new tests)
17. Reset restores canonical default flags
18. Reset does not create duplicate defaults
19. Reset remains idempotent
20. Existing inspection data remains unchanged

### Invariant Tests (7 tests)
21-27. Verify `COUNT(IsDefault=1) <= 1` holds across all repository operations

---

## Validation Results

| Gate | Result |
|------|--------|
| Jest | ✅ 104 suites, 1270 tests (1 skipped, 1269 passed) |
| TSC | ✅ Clean — no errors |
| Lint | ✅ 0 errors, 684 warnings (all pre-existing) |

---

## Confirmations

- ✅ **No seed files changed** — `frontend/src/database/seeds/` has no modifications
- ✅ **Historical inspection data untouched** — Reset never touches InspectionValues, DeviceRecords, Photos, or Inspections tables
- ✅ **Every dropdown enforces zero-or-one default** — Repository-level enforcement in all code paths:
  - `FieldOptionRepository.setDefault()` / `create()` / `update()`
  - `DeviceOptionsRepository.setDefault()` / `add()` / `update()`
  - `ResetRepository.performReset()` (restores seed data which has zero defaults)

---

## Remaining Warnings

All 684 lint warnings are pre-existing (`require()` style imports, `import/first`, `array-type`). No new warnings introduced by this change.

---

## Edge Case Verification

**Clearing B (no option becomes default):**
- `setDefault()` clears all, sets one → if called with IsDefault=0, no option becomes default
- `create(IsDefault=0)` / `update(IsDefault=0)` → does NOT clear other defaults → zero defaults allowed ✅

**Isolation:**
- `FieldOptionRepository.setDefault(1, 10)` only clears `WHERE FieldID = 1` → unrelated fields unaffected ✅
- `DeviceOptionsRepository.setDefault("Camera", "CameraType", 10)` only clears `WHERE DeviceType = 'Camera' AND FieldName = 'CameraType'` → unrelated types/fields unaffected ✅
