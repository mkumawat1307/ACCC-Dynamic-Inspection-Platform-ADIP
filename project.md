# ACCC Inspection Platform — Architecture Map

## 1. Technology Stack

- **Framework**: Expo (React Native) with Expo Router for file-based navigation
- **Language**: TypeScript (strict mode)
- **Database**: SQLite (expo-sqlite v16) with dual-database architecture
  - Global DB: `accc_global.db` (Projects, Divisions, Districts, Blocks)
  - Per-Project DB: `Projects/<Name>/inspection.db` (18 tables, 22 total with global)
- **State Management**: React Context (InspectionContext, PhotoStatesContext, WatermarkSettingsContext, InspectionScrollContext)
- **UI Library**: react-native-paper (Material Design)
- **Dropdown**: react-native-element-dropdown (patched for Android)
- **Testing**: Jest (jest-expo preset), 109 test suites, 1303 tests
- **Package Manager**: Yarn 1.22 (pinned via package.json `packageManager` field)
- **Build**: EAS Build for Android APK

---

## 2. Project Architecture

### File Structure
```
frontend/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout with providers
│   ├── index.tsx           # Home screen (project list)
│   ├── inspection/
│   │   ├── new.tsx         # New/edit inspection screen
│   │   ├── capture.tsx     # Photo capture
│   │   └── edit.tsx        # Legacy edit screen
│   ├── projects/
│   │   ├── dashboard.tsx   # Project dashboard
│   │   ├── new.tsx         # Create/edit project
│   │   └── dashboard-settings.tsx
│   └── settings/           # Settings screens (device types, fields, watermark, etc.)
├── src/
│   ├── components/
│   │   ├── app/            # App-level components (dialogs, styles)
│   │   ├── camera/         # Camera capture components
│   │   ├── dashboard/      # Dashboard cards
│   │   ├── inspection/     # Inspection form components
│   │   │   ├── DeviceSection.tsx
│   │   │   ├── GeneralInformation.tsx
│   │   │   ├── SectionRenderer.tsx
│   │   │   ├── FieldRenderer.tsx
│   │   │   └── ...         # Photo, dialogs, scroll, etc.
│   │   └── settings/       # Settings UI components
│   ├── context/            # React Context providers
│   │   ├── InspectionContext.tsx
│   │   ├── PhotoStatesContext.tsx
│   │   ├── WatermarkSettingsContext.tsx
│   │   └── InspectionScrollContext.tsx
│   ├── database/
│   │   ├── db.ts           # Dual SQLite connection manager
│   │   ├── schema.ts       # DDL + migrations
│   │   ├── tables/         # Table DDL files
│   │   ├── seeds/          # Seed data
│   │   ├── repositories/   # Repository pattern (18 repos)
│   │   ├── helpers/        # ProjectDBManager, BackupManager
│   │   ├── services/       # ProjectCreateService, ProjectEditService
│   │   └── seeds/          # Seed functions
│   ├── hooks/              # Custom hooks
│   ├── models/             # TypeScript interfaces
│   ├── native/             # Native modules (WatermarkEncoder)
│   ├── utils/              # Utilities (progress, storage, backup, etc.)
│   └── __tests__/          # Jest tests (69 suites)
```

### Dual Database Architecture (Critical)
- **Global DB** (`accc_global.db`): Projects, Divisions, Districts, Blocks
- **Per-Project DB** (`Projects/<Name>/inspection.db`): All inspection data (18 tables)
- **Sequential Open/Close Model**: Only ONE `SQLiteDatabase` handle active at a time
  - `ensureGlobalDb()` / `ensureProjectDb()` switch via `closeCurrentDb()` → `openDatabaseAsync()`
  - **NEVER** call `getGlobalDatabase()` during inspection flow — corrupts native handle on Android
- **Project data passed via navigation params + context** to avoid DB switching mid-flow

---

## 3. Project → Inspection Lifecycle

### Project Creation
1. User taps "New Project" → `/projects/new` with optional `editProjectId`
2. `ProjectCreateService.createProject()` → inserts into global `Projects` table
3. `ProjectDBManager.createProjectDb()` → creates per-project SQLite file + runs `createProjectSchema()` + seeds all settings tables
4. Project appears in home screen list (`ProjectRepository.getProjects()`)

### Opening a Project
1. User taps "Open" → `InspectionContext.openProject(project)` → `setActiveProject(dbPath)` + `setProject(project)`
2. Navigate to `/projects/dashboard` with `projectId` + `projectData` (JSON string)
3. Dashboard loads inspections from project DB via `InspectionRepository.getInspections()`

### Inspection Lifecycle
```
CREATE (Draft)
  → createInspection() inserts row with Status='Draft', PoleID=''
  → initializeDefaultValues() populates InspectionValues with defaults
  
INITIALIZE
  → load sections/fields from template
  → load saved InspectionValues
  → if device counts > 0, initializeDeviceRecords() creates DeviceRecords
  
EDIT
  → User fills fields (auto-saved via debounced saveFieldValue)
  → Device fields stored in DeviceRecords.DeviceData JSON
  → Progress calculated from unified state
  
SAVE DRAFT
  → flushPendingDeviceSaves() + update status if needed
  
COMPLETE
  → validateSectionsAndDevices() + validatePhotosForSave()
  → updateInspectionStatus(inspectionId, 'Completed')
  
REOPEN/EDIT
  → Navigate with existing inspectionId
  → loadProject() detects routeInspectionId → setInspectionId()
  → Load all existing data
```

### InspectionID Generation
- Auto-increment `InspectionID` in `Inspections` table (per-project DB)
- Status values: `'Draft'`, `'Completed'`, `'Submitted'`
- `createdAt` / `updatedAt` timestamps on all tables

---

## 4. Inspection Structure

An inspection contains three categories:

```
INSPECTION
│
├── Standard Sections (IsDefault=1)
│   ├── general_information        # Pole ID, GPS, inspector, division, district
│   ├── pole_structure             # Foundation, pole availability, SI, status
│   ├── junction_box               # JB status, power cable, cable length
│   ├── earthing                   # Wire, chamber, cover, voltage
│   ├── meter                      # Meter box, status, power, serial
│   ├── connectivity               # Connectivity type
│   └── remarks                    # Free text
│
├── Custom Sections (IsDefault=0, IsRepeatable=0)
│   └── Dynamically defined through DB (InspectionSections + InspectionFields)
│
└── Device Sections (IsDefault=0, IsRepeatable=1)
    ├── camera_information         # Linked to camera_count field
    ├── switch_information         # Linked to switch_count field
    └── Custom Device Sections     # Dynamically defined via DeviceFieldDefinitions
```

### Key Distinction: Custom Sections vs Custom Device Sections
| Aspect | Custom Sections | Custom Device Sections |
|--------|----------------|----------------------|
| Table | `InspectionSections` (IsDefault=0, IsRepeatable=0) | `ProjectDeviceTypes` + `DeviceFieldDefinitions` |
| Fields | `InspectionFields` linked by SectionID | `DeviceFieldDefinitions` linked by DeviceType |
| Values | `InspectionValues` (FieldID) | `DeviceRecords.DeviceData` JSON |
| Count | N/A | Controlled by `{type}_count` field in standard sections |
| Rendering | `FieldRenderer` via `SectionRenderer` | `DeviceSection` via `SectionRenderer` |

---

## 5. Standard Sections

### Data Flow
```
InspectionSections (SectionKey, IsDefault=1, IsActive=1)
    ↓
InspectionFields (FieldKey, FieldType, DefaultValue, IsRequired, DisplayOrder)
    ↓
InspectionValues (InspectionID, FieldID, FieldValue)
    ↓
FieldRenderer → InspectionValueRepository.saveValue()
```

### Key Repositories/Functions
- `InspectionRepository.getSections(templateId)` — loads sections for template
- `InspectionRepository.getFieldsByKey(sectionKey, templateId)` — loads fields for section
- `InspectionRepository.getInspectionValues(inspectionId)` — loads saved values
- `InspectionValueRepository.saveValue(inspectionId, fieldId, value)` — saves with FK validation
- `InspectionRepository.initializeDefaultValues()` — populates defaults on creation

### Visibility/Active Logic
- `IsActive=1` AND `IsVisible=1` required for both sections and fields
- System fields (`date`, `division`, `district`) excluded from progress
- Count fields (`*_count`) excluded from progress (controllers only)

---

## 6. Custom Sections

### Architecture
- Created via Settings → Sections UI
- Stored in `InspectionSections` with `IsDefault=0`, `IsRepeatable=0`
- Fields added via Settings → Fields UI → stored in `InspectionFields`
- **No TypeScript code required** — fully dynamic via DB

### Rendering
- `SectionRenderer` loads all sections from `InspectionRepository.getSections()`
- For each section, loads fields via `InspectionFieldRepository.getFieldsBySection(sectionId)`
- Renders via `FieldRenderer` with `InspectionValueRepository` for values

---

## 7. Device Sections

### Architecture
```
Device Count Field (e.g., camera_count in general_information)
    ↓
SectionRenderer detects {type}_count field → sets deviceCounts[type]
    ↓
DeviceFieldDefinitionsRepository.getByDeviceType(deviceType, templateId)
    ↓
DeviceRecordsRepository.initializeDeviceRecords(inspectionId, deviceType, count, templateId)
    ↓
DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData JSON, IsActive)
    ↓
DeviceSection renders DeviceRecord[] with fields from DeviceFieldDefinitions
```

### Device Types (Database-Driven, NOT Hardcoded)
- **Camera**: 10 fields (CameraType, CameraStatus, CameraMake, CameraModel, CameraIP, CameraSerialNumber, CameraSI, SDCardCapacity, SDCardStatus)
- **Switch**: 7 fields (SwitchType, SwitchStatus, SwitchMake, SwitchModel, SwitchIP, SwitchSerialNumber, SwitchSI)
- **NVR**: Not in seeds but supported via `DeviceFieldDefinitions` + `ProjectDeviceTypes`
- **Custom**: Add via Settings → Device Types → adds to `ProjectDeviceTypes` + `DeviceFieldDefinitions`

### Device Count Fields
- Defined in `pole-inspection-data.ts` seed: `camera_count`, `switch_count`
- `FieldType: "number"`, `FieldKey: "{type}_count"`
- **Excluded from progress** — controllers only
- Changing count triggers `initializeDeviceRecords()` or `deactivateBeyond()`

---

## 8. Custom Device Sections

### Discovery Mechanism
1. `DeviceFieldDefinitionsRepository.getDeviceTypes(templateId)` → distinct DeviceTypes
2. For each type, `getByDeviceType(deviceType, templateId)` → field definitions
3. Count field detected by `{type}_count` pattern in standard sections
4. `SectionRenderer` renders `DeviceSection` for matching `SectionKey` (`{type}_information`)

### No Hardcoded Device Types
- Camera/Switch/NVR are just seed data
- Adding new device type = insert into `ProjectDeviceTypes` + `DeviceFieldDefinitions`
- `SectionRenderer` dynamically discovers and renders all

---

## 9. Device Record Lifecycle

### Count Changes
```
Count = 0
  → DeviceSection: no render (count <= 0)

Count = 1 (0→1)
  → SectionRenderer.updateValue() → initializeDeviceRecords(inspectionId, type, 1)
  → Creates DeviceRecord with empty DeviceData JSON
  → DeviceSection renders 1 card

Count = 2 (1→2)
  → initializeDeviceRecords(inspectionId, type, 2)
  → Reuses existing DeviceNo=1, creates DeviceNo=2
  → DeviceSection renders 2 cards

Count = 3 (2→3)
  → Same pattern, creates DeviceNo=3

Count = 0 (3→0)
  → deactivateBeyond(inspectionId, type, 0) → IsActive=0 for all
  → DeviceRecords PERSIST with IsActive=0 (data preserved)

Count = 3 (0→3)
  → initializeDeviceRecords(inspectionId, type, 3)
  → Reactivates IsActive=0 records by DeviceNo (preserves data)
  → Creates new only for missing DeviceNo
```

### Key Functions
- `initializeDeviceRecords(inspectionId, deviceType, targetCount, templateId)` — creates/reactivates
- `deactivateBeyond(inspectionId, deviceType, deviceNo)` — sets IsActive=0 for DeviceNo > count
- `restorePendingDeactivatedRecords(inspectionId, deviceType, maxDeviceNo)` — reactivates on grow
- `getByInspection(inspectionId, deviceType)` — returns only `IsActive=1`

### Data Persistence Rules
- **3→0→3 preserves data** — DeviceRecords persist with `IsActive=0`, reactivated on grow
- **DeviceNo allocation** — Sequential 1..N, never reused for different devices
- **Duplicate prevention** — `initializeDeviceRecords` deduplicates by DeviceNo

---

## 10. Device Defaults / Options

### DeviceOptions Table
```sql
DeviceOptions:
  OptionID, TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive
```

### Default Behavior (Current Implementation)
- **Seed data has `IsDefault=1` for first option of each field** (e.g., CameraType="4K")
- **BUT** `initializeDeviceRecords()` and `DeviceSection` mount effect **do NOT auto-populate** defaults
- All dropdown fields start **empty** (`null`) — user must explicitly select
- `IsDefault` used only as metadata (UI hinting), NOT auto-selection

### Progress Counting
- Empty dropdown (`""` or `null`) → **incomplete**
- Explicit user selection → **complete**
- `IsDefault` metadata **does NOT** count as completion

### DeviceFieldDefinitions
```sql
DeviceFieldDefinitions:
  FieldDefID, TemplateID, DeviceType, FieldName, Label, Placeholder, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive
```

---

## 11. Database Schema

### Global DB (`accc_global.db`)
| Table | PK | FK | Purpose |
|-------|----|----|---------|
| `Projects` | ProjectID | DistrictID → Districts | Project metadata + DBPath |
| `Divisions` | DivisionID | — | Division lookup |
| `Districts` | DistrictID | DivisionID | District lookup |

### Per-Project DB (`inspection.db`)
| Table | PK | FK | Purpose |
|-------|----|----|---------|
| `InspectionTemplates` | TemplateID | — | Template definitions |
| `InspectionSections` | SectionID | TemplateID | Sections (standard + custom) |
| `InspectionFields` | FieldID | SectionID | Field definitions |
| `FieldOptions` | OptionID | FieldID | Dropdown options for standard fields |
| `Inspections` | InspectionID | ProjectID | Inspection records |
| `InspectionValues` | ValueID | InspectionID, FieldID | Standard/custom field values |
| `DeviceFieldDefinitions` | FieldDefID | TemplateID | Device field definitions |
| `DeviceOptions` | OptionID | TemplateID | Dropdown options for device fields |
| `DeviceRecords` | RecordID | InspectionID | Device instances (DeviceData JSON) |
| `Photos` | PhotoID | InspectionID | Photo metadata |
| `InspectionPoleIdHistory` | HistoryID | InspectionID | Pole ID rename audit |
| `DashboardCards` | CardID | ProjectID | Dashboard configuration |
| `RepeatableGroups/Fields/Records/Values` | — | — | Repeatable group support |
| `ProjectDeviceTypes` | ID | — | Custom device type registry |

### Key Constraints
- `InspectionValues`: FK → Inspections(InspectionID) ON DELETE CASCADE, FK → InspectionFields(FieldID) ON DELETE CASCADE
- `DeviceRecords`: FK → Inspections(InspectionID) ON DELETE CASCADE
- `DeviceFieldDefinitions`: UNIQUE(TemplateID, DeviceType, FieldName)
- `DeviceOptions`: IsDefault INTEGER DEFAULT 0

---

## 12. Database Relationships

```
Projects (Global)
    ↓ 1:N (ProjectID)
Inspections (Per-Project)
    ↓ 1:N (InspectionID)
    ├── InspectionValues → InspectionFields → InspectionSections → InspectionTemplates
    ├── DeviceRecords (DeviceData JSON) → DeviceFieldDefinitions + DeviceOptions
    ├── Photos
    ├── RepeatableRecords/Values
    └── InspectionPoleIdHistory
```

### Project Isolation
- **Enforced by**: Separate SQLite file per project (`Projects/<Name>/inspection.db`)
- **Connection model**: Sequential open/close — only one DB handle active
- **Cross-project queries impossible** — tables are standalone per file
- **Validation**: `saveFieldValue` checks `Inspections` + `InspectionFields` exist in current DB

---

## 13. Inspection State Architecture

### UnifiedInspectionState (Single Source of Truth)
```typescript
interface UnifiedInspectionState {
  fieldValues: Record<number, string>;      // FieldID → value (standard/custom)
  deviceRecords: InMemoryDeviceRecords;     // DeviceType → DeviceRecord[]
  deviceCounts: Record<string, number>;     // "camera_count" → 3
}
```

### State Flow in `new.tsx`
```
new.tsx (owner of UnifiedInspectionState)
    │
    ├─ updateInspectionState(updater) → merges fieldValues, deviceCounts, deviceRecords
    │                                    → queues progress calculation
    │
    ├─ GeneralInformation
    │     onFieldChange → updateInspectionState
    │     ensureInspectionId() → lazy draft creation
    │     releaseAbandonedDraft() → cleanup on "Edit Existing"
    │
    ├─ SectionRenderer (standard/custom)
    │     onFieldChange → updateInspectionState
    │     deviceRecords passed as prop
    │
    └─ SectionRenderer (device)
          deviceRecords from unified state → currentDeviceRecords (useMemo)
          DeviceSection receives initialRecords=currentDeviceRecords
          DeviceSection.onFieldChange → updateInspectionState
```

### Authoritative State
- **`new.tsx`** owns `inspectionState` (React state)
- Child components receive `onFieldChange` callback to update it
- **Progress calculated from unified state** (immediate UI feedback)
- Database is eventually consistent (debounced saves)

---

## 14. New Inspection Screen (`app/inspection/new.tsx`)

### Navigation Params
```typescript
{
  projectId: string;           // Required
  inspectionId?: string;       // For editing existing
  projectData?: string;        // JSON Project object (avoids global DB call)
}
```

### Lazy Draft Creation (Critical Fix)
```typescript
// Before: Draft created on screen mount
// After: Draft created ONLY when Pole ID passes duplicate validation
const ensureDraftInspection = async () => {
  if (routeInspectionId) return inspectionIdRef.current; // Editing existing
  if (createdDraftIdRef.current) return createdDraftIdRef.current;
  // Creates Inspection row + initializeDefaultValues()
  // Only called from GeneralInformation.handlePoleIdSave() after duplicate check passes
};
```

### Edit Existing Flow
1. User enters duplicate Pole ID → 300ms debounce → `getInspectionByPoleId()` → "Inspection Already Exists" alert
2. User taps "Edit Existing" → `releaseAbandonedDraft()` deletes session draft → `router.replace()` with existing `inspectionId`
3. Screen remounts with `routeInspectionId` → `loadProject()` → `setInspectionId(existingId)`

### Key State
- `inspectionState: UnifiedInspectionState` — unified state
- `inspectionProgress` — calculated from unified state
- `createdDraftIdRef`, `creatingDraftRef` — lazy draft refs
- `inspectionIdRef` — mirrors `inspectionId` for callbacks

---

## 15. SectionRenderer

### Responsibilities
- Load section fields + options + saved values
- Detect `{type}_count` fields → update `deviceCounts`
- Call `initializeDeviceRecords()` for each device type with count > 0
- Push initialized records to unified state via `onFieldChange`
- Render standard fields via `FieldRenderer`
- Render device sections via `DeviceSection` (passing `currentDeviceRecords`)
- Render `PhotoSection` for photos section

### Key Logic
```typescript
// Detect device count fields
const match = field.FieldKey.match(/^(.+)_count$/);
if (match && deviceTypes.includes(deviceType)) {
  counts[deviceType] = parsedCount;
}

// Initialize device records
const initializedRecords = await DeviceRecordsRepository.initializeDeviceRecords(
  inspectionId, deviceType, count, templateId
);
onFieldChange(prev => ({ ...prev, deviceRecords: { ...prev.deviceRecords, [type]: records } }));
```

### Hooks Order Fix
- `useMemo` for `currentDeviceRecords` placed **before** early returns (`loading`, `error`)
- Prevents "change in the order of Hooks" error

---

## 16. DeviceSection

### Two Modes
| Mode | Condition | Behavior |
|------|-----------|----------|
| **Parent-Driven** | `initialRecords.length > 0` | Uses `initialRecords` as authoritative; syncs from parent; no DB loads |
| **Standalone Fallback** | `initialRecords.length === 0` | Loads from DB; creates missing records; handles count changes locally |

### Key Features
- **Stable `EMPTY_RECORDS` constant** — prevents infinite render loop from `initialRecords = []` default
- **`parentDrivenRef`** — tracks mode based on `initialRecords.length > 0`
- **Debounced saves** — `scheduleDeviceRecordSave(record, 500ms)`
- **Count change handling**:
  - Shrink: `deactivateBeyond()` + flush saves
  - Grow (standalone): `restorePendingDeactivatedRecords()` + create new with empty data
- **React keys**: `dev-${record.DeviceNo}` — stable per DeviceNo

---

## 17. Save / Autosave

| Trigger | Debounce | Function | Destination |
|---------|----------|----------|-------------|
| Pole ID change | 300ms (check) / 500ms (save) | `handlePoleIdSave` | `InspectionValues` + `Inspections.PoleID` |
| Standard field | 500ms | `saveFieldValue` | `InspectionValues` |
| Device field | 500ms | `scheduleDeviceRecordSave` | `DeviceRecords.DeviceData` |
| GPS | Immediate | `fetchCurrentLocation` | `InspectionValues` (gps, location) |
| Save button | Immediate | `validateSectionsAndDevices` + `updateInspectionStatus` | `Inspections.Status` |

### Race Condition Handling
- `poleCheckTimeout` (300ms) clears `saveTimeout` on duplicate detection
- `poleIdSaveChain` serializes pole ID saves
- `flushPendingDeviceSaves()` called before validation/completion

---

## 18. Duplicate Pole ID Flow

### Detection (GeneralInformation.tsx)
```typescript
// 300ms debounce on pole_id change
poleCheckTimeout.current = setTimeout(async () => {
  const existing = await InspectionRepository.getInspectionByPoleId(text.trim());
  if (existing && existing.InspectionID !== inspectionId) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current); // Cancel pending save
    Alert.alert("Inspection Already Exists", ..., [
      { text: "Edit Existing", onPress: async () => {
          await releaseAbandonedDraft(); // Delete session draft
          setValues({});
          setInspectionId(existing.InspectionID);
          router.replace({ pathname: "/inspection/new", params: { projectId, inspectionId: existing.InspectionID } });
        }
      },
      { text: "Create New", onPress: () => { setValues({pole_id: ""}); setPoleId(""); setFormUnlocked(false); }},
      { text: "Cancel", style: "cancel" }
    ]);
  }
}, 300);
```

### Unique Pole ID
1. User enters unique ID → 300ms check finds nothing → 500ms save fires
2. `handlePoleIdSave` → `ensureInspectionId()` creates draft → `updatePoleIdDirectSave()`
2. Draft now exists with entered Pole ID

---

## 19. Progress Architecture

### Calculation Sources
| Section Type | Data Source |
|--------------|-------------|
| Standard/Custom | `InspectionValues` (overridden by `unifiedState.fieldValues`) |
| Device | `DeviceRecords.DeviceData` JSON (from `unifiedState.deviceRecords`) |

### Progress Calculation Rules
- **Standard fields**: `isFieldApplicable()` excludes `date`, `division`, `district`, count fields (`*_count`)
- **Device fields**: All visible `DeviceFieldDefinitions` counted; reads from `DeviceData` JSON
- **Count fields** (`*_count`): **Excluded** — controllers only
- **Empty values**: `isFieldValueEmpty()` returns true for `""`, `null`, `undefined`
- **Device progress**: Per-instance (`DeviceNo`), aggregated per device type

### getInspectionProgress() Modes
| Mode | Trigger | Data Source |
|------|---------|-------------|
| Unified State | Field/device change in UI | `unifiedState` (immediate) |
| Fallback | Initial load / no unified state | Database (flushes pending saves first) |

---

## 20. Navigation

### Inspection-Related Routes
| Route | Params | Purpose |
|-------|--------|---------|
| `/` | — | Home (project list) |
| `/projects/new` | `editProjectId?` | Create/edit project |
| `/projects/dashboard` | `projectId`, `projectData` | Project dashboard |
| `/inspection/new` | `projectId`, `inspectionId?`, `projectData?` | New/edit inspection |
| `/inspection/capture` | `inspectionId`, `projectId`, `sectionKey` | Photo capture |

### Parameter Passing
- `projectData` passed as JSON string to avoid `getGlobalDatabase()` call
- `inspectionId` passed for editing existing
- `router.replace()` used for "Edit Existing" to replace screen in stack

---

## 21. Storage

### DownloadStorage (`src/utils/downloadStorage.ts`)
- Wraps `expo-file-system` `downloadAsync`
- Saves to `FileSystem.documentDirectory/Download/ACCC Dynamic Inspection/`
- **Android SAF fallback** for scoped storage (Android 11+)
- Path normalization: strip leading `/`, block `../`, collapse duplicate `Download/Download/`

### Android Backup (`src/utils/androidBackup.ts`)
- Uses `expo-file-system` SAF (Storage Access Framework)
- User picks backup directory once → persists URI
- Creates ZIP of project DB folders
- **Release APK tested** — development warnings ("DownloadStorage unavailable", "AndroidBackup native module not available") are expected in Expo Go

---

## 22. Tests

### Test Structure (69 suites, 1303 tests)
| Category | Files | Coverage |
|----------|-------|----------|
| Database Isolation | `isolation.test.ts` | Cross-project DB isolation |
| Device Records | `DeviceRecordsRepository*.test.ts` | CRUD, initialize, deactivate, restore |
| Device Section | `DeviceSection*.test.tsx` | Rendering, count changes, defaults, persistence |
| SectionRenderer | `SectionRenderer.*.test.tsx` | Count input, default persistence |
| GeneralInformation | `GeneralInformation.test.tsx` | Pole ID, duplicate, GPS, rename |
| InspectionRepository | `InspectionRepository.test.ts` | CRUD, validation, Pole ID |
| InspectionValueRepository | `InspectionValueRepository.test.ts` | FK validation, saveValue |
| Progress | (via integration) | Progress calculation |
| Database | `schema.test.ts`, `seed.test.ts` | Schema creation, migrations |

### Key Test Patterns
- **Mocking**: `expo-sqlite`, `expo-file-system`, `expo-router` mocked in `jest.setup.ts` / `__mocks__/`
- **Real SQLite**: Some tests use in-memory SQLite mock (`__mocks__/expo-sqlite.ts`)
- **Isolation tests**: Use distinct DB paths per project
- **Per-project seeding**: Each test opens fresh project DB

---

## 23. Known Resolved Bugs

| Bug | Fix |
|-----|-----|
| Duplicate Pole ID → unwanted SIK/00 draft | Lazy draft creation (`ensureDraftInspection`) + `releaseAbandonedDraft` |
| DeviceSection infinite render loop | Stable `EMPTY_RECORDS` constant + identity check in sync effect |
| SectionRenderer hooks-order crash | `useMemo` moved before early returns |
| Device count excluded from progress | `field.FieldKey.endsWith("_count")` skip in `countCompletedFields` |
| Device 3→0→3 data loss | `deactivateBeyond` (IsActive=0) + `restorePendingDeactivatedRecords` |
| Dropdown Pressable crash | Reverted to TouchableWithoutFeedback (patch preserved) |
| Device default auto-selection | Removed auto-population; fields start empty |
| `getGlobalDatabase()` during inspection | Removed; project data passed via navigation params + context |

---

## 24. Current Known Issues

| Issue | Status |
|-------|--------|
| Device dropdowns auto-selecting (fixed in code, verify in tests) | Fixed — fields start empty |
| Invalid FieldID warnings / FK errors | Under investigation — likely `DeviceFieldDefinitions.FieldDefID` vs `InspectionFields.FieldID` confusion |
| Storage warnings in Expo Go | Out of scope — release APK works |
| AndroidBackup native module unavailable | Out of scope — release APK works |

---

## 25. Code Ownership Map

| Feature | Main File | Supporting Files | Repository | DB Tables | Tests |
|---------|-----------|------------------|------------|-----------|-------|
| Project | `app/projects/new.tsx`, `ProjectRepository.ts` | `ProjectDBManager.ts`, `ProjectCreateService.ts` | `ProjectRepository` | `Projects`, `Divisions`, `Districts` | `ProjectRepository.test.ts` |
| Inspection Creation | `app/inspection/new.tsx`, `InspectionRepository.ts` | `InspectionContext.tsx` | `InspectionRepository` | `Inspections`, `InspectionValues` | `InspectionRepository.test.ts` |
| Pole ID | `GeneralInformation.tsx` | `InspectionRepository.ts` | `InspectionRepository` | `Inspections.PoleID` | `GeneralInformation.test.tsx` |
| Duplicate Detection | `GeneralInformation.tsx` (300ms debounce) | `InspectionRepository.getInspectionByPoleId` | `InspectionRepository` | `Inspections.PoleID` | `GeneralInformation.test.tsx` |
| Standard Sections | `SectionRenderer.tsx`, `FieldRenderer.tsx` | `InspectionRepository`, `InspectionFieldRepository`, `InspectionValueRepository` | `InspectionFieldRepository`, `InspectionValueRepository` | `InspectionSections`, `InspectionFields`, `InspectionValues` | `SectionRenderer.*.test.tsx` |
| Custom Sections | `SectionRenderer.tsx` (dynamic) | Settings UI | `InspectionRepository` | `InspectionSections`, `InspectionFields` | — |
| Device Sections | `SectionRenderer.tsx`, `DeviceSection.tsx` | `DeviceFieldDefinitionsRepository`, `DeviceRecordsRepository` | `DeviceFieldDefinitionsRepository`, `DeviceRecordsRepository` | `DeviceFieldDefinitions`, `DeviceRecords`, `DeviceOptions` | `DeviceSection*.test.tsx`, `SectionRenderer.*.test.tsx` |
| Custom Devices | `DeviceFieldDefinitionsRepository` | Settings → Device Types | `DeviceFieldDefinitionsRepository` | `ProjectDeviceTypes`, `DeviceFieldDefinitions` | — |
| Device Records | `DeviceRecordsRepository.ts` | `DeviceSection.tsx`, `SectionRenderer.tsx` | `DeviceRecordsRepository` | `DeviceRecords` | `DeviceRecordsRepository*.test.ts` |
| Device Defaults | `DeviceRecordsRepository.initializeDeviceRecords` | `DeviceOptionsRepository` | `DeviceOptionsRepository` | `DeviceOptions`, `DeviceFieldDefinitions` | `deviceTypeDefaultSelection.test.ts` |
| Progress | `inspectionProgress.ts` | `InspectionRepository`, `DeviceRecordsRepository` | `InspectionRepository`, `DeviceRecordsRepository` | `InspectionValues`, `DeviceRecords` | (via integration) |
| Save Draft | `new.tsx` `handleSave` | `InspectionRepository` | `InspectionRepository` | `Inspections.Status` | — |
| Complete | `new.tsx` `handleSave` | `InspectionRepository`, `PhotoRepository` | `InspectionRepository` | `Inspections.Status` | — |
| Photos | `PhotoSection.tsx`, `PhotoRepository.ts` | `WatermarkEncoder` (native) | `PhotoRepository` | `Photos` | `PhotoRepository.test.ts`, `useCaptureFlow.test.tsx` |
| Storage | `downloadStorage.ts`, `storageManager.ts` | `androidBackup.ts` | — | FileSystem | `downloadStorage.test.ts`, `backupZip.test.ts` |
| Navigation | `app/inspection/new.tsx`, `app/index.tsx` | `InspectionContext` | — | — | — |

---

## 26. Complete Data Flow Diagrams

### A. New Inspection
```
User: "New Inspection"
    ↓
app/inspection/new.tsx (projectId from params)
    ↓
loadProject() → context.setProject() + setInspectionDate() + setPoleId("")
    ↓
initialize() → getSections() → setSections()
    ↓
SectionRenderer (general_information)
    ↓
GeneralInformation renders pole_id field (editable, formUnlocked=false)
    ↓
User types Pole ID
    ↓
300ms: getInspectionByPoleId() → if duplicate → Alert "Inspection Already Exists"
    ↓
500ms: handlePoleIdSave() → ensureDraftInspection() → createInspection() + initializeDefaultValues()
    ↓
updateInspectionPoleId() → setInspectionId(draftId)
    ↓
formUnlocked=true → all fields editable
    ↓
SectionRenderer loads other sections + device counts
    ↓
For each {type}_count > 0: initializeDeviceRecords() → DeviceRecords created
    ↓
DeviceSection renders with initialRecords from unified state
```

### B. Existing Inspection Editing
```
User: "Open" project → dashboard → "Open" inspection
    ↓
app/inspection/new.tsx with routeInspectionId + projectData
    ↓
loadProject() → routeInspectionId exists → setInspectionId(existingId)
    ↓
GeneralInformation.init() → loadInspectionValues() → setValues() + setFormUnlocked(true)
    ↓
SectionRenderer loads all sections with saved values
    ↓
Device counts loaded → initializeDeviceRecords() reactivates/restores DeviceRecords
    ↓
DeviceSection renders with initialRecords (parent-driven mode)
```

### C. Duplicate Pole ID
```
User enters existing Pole ID (e.g., "SIK/001")
    ↓
300ms debounce → getInspectionByPoleId("SIK/001") → returns existing
    ↓
Alert "Inspection Already Exists" with 3 buttons
    ↓
"Edit Existing" pressed
    ↓
releaseAbandonedDraft() → deleteInspection(sessionDraftId)
    ↓
setInspectionId(existing.InspectionID)
    ↓
router.replace("/inspection/new", { projectId, inspectionId: existing })
    ↓
Screen remounts with routeInspectionId → existing inspection opens
    ↓
NO unwanted draft remains
```

### D. Standard Field Save
```
User types in FieldRenderer
    ↓
onChange → setValues() → 500ms debounce
    ↓
InspectionValueRepository.saveValue(inspectionId, fieldId, value)
    ↓
FK validation: InspectionID exists? FieldID exists?
    ↓
INSERT or UPDATE InspectionValues
    ↓
onFieldChange → unifiedState.fieldValues updated
    ↓
Progress recalculated from unified state
```

### E. Custom Section Field Save
```
Same as Standard Field Save
    ↓
Only difference: SectionKey not in standard list
    ↓
SectionRenderer renders dynamically via getFieldsBySection()
```

### F. Device Count Change
```
User changes camera_count from 1→2
    ↓
SectionRenderer.updateValue() → setDeviceCounts({Camera: 2})
    ↓
initializeDeviceRecords(inspectionId, "Camera", 2, templateId)
    ↓
Queries existing records (active + inactive) up to DeviceNo=2
    ↓
Reactivates IsActive=0 records within count
    ↓
Creates missing DeviceNo with empty DeviceData
    ↓
onFieldChange → unifiedState.deviceRecords.Camera = [rec1, rec2]
    ↓
DeviceSection receives initialRecords=[rec1, rec2] (parent-driven)
    ↓
Renders 2 device cards
```

### G. Device Field Save
```
User selects CameraType dropdown on Camera 1
    ↓
DeviceSection.updateField(index, "CameraType", "4K")
    ↓
setRecords → scheduleDeviceRecordSave(record, 500ms)
    ↓
500ms later: persist() → INSERT/UPDATE DeviceRecords
    ↓
onPersisted → updates persistedIds Map + setRecords with RecordID
    ↓
onFieldChange → unifiedState.deviceRecords.Camera updated
    ↓
Progress recalculated (computeDeviceRecordProgress reads DeviceData JSON)
```

### H. Device 3→0→3
```
Count 3→0:
  deactivateBeyond(inspectionId, "Camera", 0) → IsActive=0 for all 3
  Records persist with DeviceData intact
  
Count 0→3:
  initializeDeviceRecords(inspectionId, "Camera", 3)
  Queries DeviceNo 1..3 (active + inactive)
  Reactivates IsActive=0 records by DeviceNo (preserves DeviceData)
  Creates new only for missing DeviceNo
  Progress restores to previous values
```

### I. Progress Calculation
```
getInspectionProgress(inspectionId, templateId, unifiedState)
    ↓
1. Load sections from template
2. Load InspectionValues → valueMap
3. Override with unifiedState.fieldValues
4. Override count fields with unifiedState.deviceCounts
5. For each standard section: countCompletedFields()
   - Skip date/division/district/count fields
   - isFieldValueEmpty() on effective value
6. For each device type:
   a. Get currentCount from unifiedState.deviceCounts["{type}_count"]
   b. Get records from unifiedState.deviceRecords[type]
   c. For deviceNo 1..currentCount:
      - computeDeviceRecordProgress(record, visibleDefs)
      - Parses DeviceData JSON, checks isFieldValueEmpty()
   d. If no record for deviceNo → total=visibleDefs.length, completed=0
7. Aggregate overall completed/total
```

### J. Database Relationships
```
Global DB (accc_global.db)          Per-Project DB (inspection.db)
┌─────────────────────────┐         ┌──────────────────────────────────┐
│ Projects                │ 1:N     │ Inspections                      │
│ - ProjectID (PK)        │────────▶│ - InspectionID (PK)              │
│ - DistrictID (FK)       │         │ - ProjectID (FK)                 │
│ - DBPath                │         │ - PoleID, Status, Dates          │
├─────────────────────────┤         ├──────────────────────────────────┤
│ Divisions               │         │ InspectionValues                 │
│ Districts               │         │ - ValueID (PK)                   │
└─────────────────────────┘         │ - InspectionID (FK) ────────┐  │
                                    │ - FieldID (FK) ─────────────┼──┤  │
                                    └─────────────────────────────┘  │  │
                                              ▲                      │  │
                                              │                      ▼  │
                                    ┌──────────────────────────────────┤
                                    │ InspectionFields                 │
                                    │ - FieldID (PK)                   │
                                    │ - SectionID (FK) ──────────────┤ │
                                    │ - FieldKey, FieldType, Default   │ │
                                    └──────────────────────────────────┤
                                              ▲
                                              │
                                    ┌──────────────────────────────────┤
                                    │ InspectionSections               │
                                    │ - SectionID (PK)                 │
                                    │ - TemplateID (FK) ─────────────┤ │
                                    │ - SectionKey, IsDefault,         │ │
                                    │   IsRepeatable, IsActive         │ │
                                    └──────────────────────────────────┤
                                              ▲
                                              │
                                    ┌──────────────────────────────────┤
                                    │ InspectionTemplates              │
                                    │ - TemplateID (PK)                │
                                    │ - IsDefault                      │
                                    └──────────────────────────────────┘

Per-Project DB (Device Tables)
┌──────────────────────────────────┐
│ DeviceRecords                    │
│ - RecordID (PK)                  │
│ - InspectionID (FK) ─────────────┤ (from Inspections above)
│ - DeviceType, DeviceNo           │
│ - DeviceData (JSON)              │
│ - IsActive                       │
├──────────────────────────────────┤
│ DeviceFieldDefinitions           │
│ - FieldDefID (PK)                │
│ - TemplateID (FK) ───────────────┤ (from InspectionTemplates)
│ - DeviceType, FieldName          │
│ - FieldType, IsRequired,         │
│   IsVisible, DisplayOrder        │
├──────────────────────────────────┤
│ DeviceOptions                    │
│ - OptionID (PK)                  │
│ - TemplateID (FK) ───────────────┤
│ - DeviceType, FieldName          │
│ - OptionLabel, OptionValue       │
│ - IsDefault, IsActive            │
├──────────────────────────────────┤
│ ProjectDeviceTypes               │
│ - ID (PK)                        │
│ - DeviceType (UNIQUE)            │
└──────────────────────────────────┘
```

---

## 27. Critical Risks / Architectural Weaknesses

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Dual DB connection on Android** | Native handle corruption, data loss | Sequential open/close model; never call `getGlobalDatabase()` during inspection flow |
| **FK violations from wrong FieldID** | Silent data loss | `saveFieldValue` validates both InspectionID and FieldID exist |
| **DeviceFieldDefinitions.FieldDefID ≠ InspectionFields.FieldID** | FK errors if confused | They are **independent namespaces** — never interchange |
| **Race: pole_id save vs duplicate check** | Duplicate draft created | `poleCheckTimeout` clears `saveTimeout`; `ensureInspectionId` called AFTER duplicate check |
| **DeviceSection infinite loop** | App freeze | Stable `EMPTY_RECORDS` constant; identity check in sync effect |
| **SectionRenderer hooks order** | Crash on loading | `useMemo` before early returns |
| **Device 3→0→3 data loss** | User data loss | `deactivateBeyond` + `restorePendingDeactivatedRecords` preserves data |
| **Project isolation** | Cross-project contamination | Separate SQLite files + sequential connection model + isolation tests |
| **DownloadStorage SAF on Android** | Backup fails | SAF directory creation with proper URI normalization |

---

## 28. Safe Modification Rules

### Inspection Records
- **Only create via** `InspectionRepository.createInspection()` → returns new `InspectionID`
- **Never** insert directly into `Inspections` table
- **Draft creation** must go through `ensureDraftInspection()` (lazy, after Pole ID validation)
- **Deletion** only via `InspectionRepository.deleteInspection()` (cascades to all data tables)

### InspectionID Handling
- **Never** hardcode or guess `InspectionID`
- **Always** get from context (`useInspection().inspectionId`) or navigation params
- **When editing existing**: `routeInspectionId` from navigation params → `setInspectionId()`
- **When creating new**: `inspectionId` is `null` until `ensureDraftInspection()` resolves

### ProjectID Handling
- **Global DB only** for `Projects` table
- **Per-project DB** for all inspection data
- **Pass via navigation params** (`projectId` string) + context (`contextProject`)
- **Never** call `getGlobalDatabase()` during inspection flow

### Pole ID Duplicate Detection
- **300ms debounce** on `pole_id` change → `InspectionRepository.getInspectionByPoleId()`
- **Case-insensitive, trimmed** comparison: `LOWER(TRIM(PoleID)) = LOWER(TRIM(?))`
- **On duplicate**: "Edit Existing" → `releaseAbandonedDraft()` + `router.replace()` with existing ID
- **On "Create New"**: Clear field, keep session draft
- **On "Cancel"**: Dismiss alert, keep current input

### DeviceNo Allocation
- **Sequential 1..N** per DeviceType per Inspection
- **Never reused** for different device instances
- **Determined by** `DeviceFieldDefinitions` count field (`{type}_count`)
- **Reactivation**: `initializeDeviceRecords` reuses `IsActive=0` records by DeviceNo

### Inactive Device Records
- `deactivateBeyond(inspectionId, deviceType, count)` sets `IsActive=0` for `DeviceNo > count`
- **Data preserved** in `DeviceData` JSON
- **Reactivated** by `initializeDeviceRecords` on count increase (by DeviceNo)
- **Never hard delete** unless explicit user action

### Device Field Mapping
- **DeviceFieldDefinitions.FieldDefID** → UI rendering, field definitions
- **InspectionFields.FieldID** → `InspectionValues` storage
- **NEVER confuse** `FieldDefID` with `FieldID` — **independent namespaces**
- Device field values stored in `DeviceRecords.DeviceData` JSON (key = `FieldName`)
- Standard/custom field values stored in `InspectionValues` (key = `FieldID`)

### User-Selected vs Default Values
- **Device dropdowns**: Start **empty** (`null`) — user must explicitly select
- **`IsDefault` in DeviceOptions**: Metadata only (UI hinting), **NOT** auto-selection
- **Progress**: Empty = incomplete; Explicit selection = complete
- **Standard fields**: Use `field.DefaultValue` + `FieldOptions.IsDefault` for initial value

### Progress Calculation
- **Source**: `unifiedState` (in-memory) for immediate feedback; DB for fallback
- **Count fields** (`*_count`): **Excluded** from progress
- **System fields** (`date`, `division`, `district`): **Excluded**
- **Device progress**: Per-instance (`DeviceNo`), reads `DeviceData` JSON
- **Default values**: Do NOT count as completion unless user explicitly selected

### Custom Sections
- **Must remain dynamic** — no hardcoded SectionKey checks
- **Discovered via** `InspectionRepository.getSections()` + `getFieldsBySection()`
- **Rendered via** `SectionRenderer` → `FieldRenderer` → `InspectionValueRepository`

### Custom Device Sections
- **Must remain dynamic** — no hardcoded DeviceType checks
- **Discovered via** `DeviceFieldDefinitionsRepository.getDeviceTypes()`
- **Count field**: `{type}_count` pattern in standard sections
- **SectionKey**: `{type}_information` (auto-generated)

### Hardcoding Prohibited
- **Device types**: Camera/Switch/NVR are seed data only
- **Section keys**: Use `SectionKey` from DB
- **Field keys**: Use `FieldKey` from DB
- **Progress exclusions**: Use `field.FieldKey.endsWith("_count")` pattern

### Files NOT to Modify for Unrelated Fixes
- `patches/react-native-element-dropdown+2.12.4.patch` — **never modify**
- `src/utils/downloadStorage.ts` — storage works in release APK
- `src/utils/androidBackup.ts` — backup works in release APK
- `src/database/schema.ts` migrations — only add new migrations, don't edit old ones
- `src/database/db.ts` connection logic — critical for Android stability

### Database Relationships to Respect
| Relationship | Rule |
|--------------|------|
| `Inspections.ProjectID` → `Projects.ProjectID` | Global DB only; enforced at creation |
| `InspectionValues.InspectionID` → `Inspections.InspectionID` | ON DELETE CASCADE; validate before write |
| `InspectionValues.FieldID` → `InspectionFields.FieldID` | ON DELETE CASCADE; validate before write |
| `DeviceRecords.InspectionID` → `Inspections.InspectionID` | ON DELETE CASCADE |
| `InspectionFields.SectionID` → `InspectionSections.SectionID` | ON DELETE CASCADE |
| `InspectionSections.TemplateID` → `InspectionTemplates.TemplateID` | ON DELETE CASCADE |
| `DeviceFieldDefinitions.TemplateID` → `InspectionTemplates.TemplateID` | By convention |
| `DeviceOptions.TemplateID` → `InspectionTemplates.TemplateID` | By convention |

---

This architecture map provides a complete understanding of the ACCC Inspection Platform codebase for safe future modifications.

---