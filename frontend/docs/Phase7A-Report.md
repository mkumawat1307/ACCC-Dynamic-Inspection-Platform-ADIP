# Phase 7A – Device Type Default Selection: Export Fix

## Summary

Device Type dropdown defaults (configured via Settings → Device Options → Default Selection) were visible in the inspection form but **blank in Excel/CSV export**. The fix persists default values into `DeviceRecords.DeviceData` at creation time so export reads them correctly.

## Root Cause

When `DeviceSection.tsx` created new `DeviceRecord` entries (initial mount or grow), it built `DeviceData` JSON containing default values from `DeviceOptionsRepository.getDropdownData()` — but stored the record **only in React state**. The only DB write path was `updateField()` → `scheduleDeviceRecordSave()`, which only fires on manual user interaction. Export (`exportData.ts:282-287`) reads from `DeviceRecords.DeviceData` in SQLite, so unpersisted records produced blank cells.

## Fix

**File:** `src/components/inspection/DeviceSection.tsx`

Two persistence points added:

1. **Initial mount** (lines 61-84): Each new `DeviceRecord` now calls `await DeviceRecordsRepository.save(newRec)` immediately, sets `RecordID` and `persistedIds`.

2. **Grow effect** (lines 110-177): Restructured to query `DeviceRecordsRepository.getByInspection()` for active records, persist only truly new records via `save()`, then pass persisted records into `setRecords` via a `persistedByNo` map. The `.then()` callback is now `async`.

No changes to `DeviceRecordsRepository.save()`, `exportData.ts`, or any other file.

## Verification

### Gates Passed

| Gate | Result |
|------|--------|
| Jest full suite | 99 suites / 1202 tests (1 skipped), all passing |
| TSC | Clean — 0 errors |
| Lint | 0 errors, 609 warnings (all pre-existing) |

### New Tests

| Test | File | What it verifies |
|------|------|-----------------|
| 1. Dropdown default in DB | `DeviceSection.defaultPersistence.test.tsx` | New device gets `PTZ` in DeviceData JSON |
| 2. No default → null | same | No `isDefault=1` option → null in DeviceData |
| 3. User value replaces default | same | `save()` with user value overwrites default in DB |
| 4. Multiple devices all get defaults | same | count=3 → all 3 records have `PTZ` default |
| 5. Existing record preserved | same | Re-render doesn't overwrite user-set value |
| 6. Device-type isolation | same | Camera default doesn't affect Battery records |
| 7. Grow 1→3 preserves existing | same | Device 1 retains `Fixed`, devices 2-3 get `PTZ` |
| 8. Number defaults are null | same | Non-dropdown fields default to null, not zero |
| 9. 3→1→3 restore preserves data | same | Deactivated records retain user values |
| 10. Multiple inspections independent | same | Inspection 42 and 99 each get independent records |

### Existing Tests Updated

| Test | File | Change |
|------|------|--------|
| "grow pads fresh rows..." | `DeviceSection.test.tsx:508` | `RecordID` assertion changed from `toBeUndefined()` to `toBeDefined()` — new records now get persisted immediately |
| "device-type isolation" | `DeviceSection.integration.test.tsx:412` | Battery rows assertion changed from `toBe(0)` to `toBe(2)` — Battery records are now correctly persisted |

## Files Changed

| File | Change |
|------|--------|
| `src/components/inspection/DeviceSection.tsx` | Persist new records on mount + restructured grow effect |
| `src/__tests__/components/inspection/DeviceSection.test.tsx` | Added `save` mock, updated RecordID assertion |
| `src/__tests__/components/inspection/DeviceSection.integration.test.tsx` | Updated Battery isolation assertion |
| `src/__tests__/components/inspection/DeviceSection.defaultPersistence.test.tsx` | **New** — 10 regression tests |

## What Was NOT Changed

- `DeviceRecordsRepository.ts` — no changes to `save()`, `scheduleDeviceRecordSave()`, or any other method
- `exportData.ts` — export logic unchanged (it was always correct; the bug was upstream)
- `DeviceOptionsRepository.ts` — default option queries unchanged
- `schema.ts` — database schema unchanged
- `settings/device-options.tsx` — settings UI unchanged
- `SectionRenderer.tsx` — inspection form renderer unchanged
- All verified subsystems from Phase 7: dropdown auto-scroll, section auto-scroll, scroll orchestration, dropdownScrollGate, count input fix, DeviceSection restore lifecycle, flush-before-deactivate, countOpsRef, autosave, validation, save/back

## Risk Assessment

**Low risk.** The fix uses the existing `DeviceRecordsRepository.save()` API that is already well-tested (used by `scheduleDeviceRecordSave` → `persist`). The grow effect now queries active records before creating new ones, preventing duplicates. `validateSectionsAndDevices()` in `new.tsx` already calls `flushPendingDeviceSaves()` before save/validation, so records created by the fix are flushed before the user can navigate away.

## Remaining Work

- **Physical Android verification**: Must build and test on device to confirm no expo-sqlite regression
- **Commit**: Changes are NOT committed per user directive
