# ACCC Dynamic Inspection Platform — UI/App Layer Documentation Map

Scope: Expo Router app at `frontend/`. Covers `app/**` (all routes), `src/components/**`, `src/context/`, `src/hooks/`, `src/models/`, `src/constants/`, `src/utils/`.
Generated: 2026-08-04. All paths are absolute. Line numbers refer to the cited file.

---

## 1. NAVIGATION MAP

Routing = Expo Router file-based routing (`app/` directory). `experiments.typedRoutes: true` in `app.json:75-77`.
There is exactly ONE layout: the root layout. There are NO nested `_layout.tsx` files. Every screen renders its own header via `react-native-paper` `Appbar.Header` because the root `Stack` sets `headerShown: false`.

### 1.1 Root layout — `D:\AI\Projects\ACCC inspection\frontend\app\_layout.tsx` (99 lines)
- Wraps tree in `PaperProvider` (MD3) > `InspectionProvider` > `SafeAreaProvider`.
- `SplashScreen.preventAutoHideAsync()` at module load (line 16).
- `useIconFonts()` (line 20) loads icon fonts; `initializeDatabase()` runs in a `useEffect` (lines 24-41); splash hidden when fonts loaded (lines 43-48).
- `StatusBar` style="light", translucent=false, backgroundColor `#0B5ED7` (normal) or `#D32F2F` (DB init error).
- `<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F5F5F5" } }} />` (lines 87-94).
- Logs `[perf]` timing markers (lines 39, 45, 76).

### 1.2 Web HTML shell — `D:\AI\Projects\ACCC inspection\frontend\app\+html.tsx` (44 lines)
- `expo-router/html` `ScrollViewStyleReset` + custom CSS to disable body scrolling (web builds only).

### 1.3 Route table (file → path → header title → purpose)

| Route file | Route path | Header title | Purpose |
|---|---|---|---|
| `app\index.tsx` | `/` | "ACCC Dynamic Inspection Platform" (text, line 188) | Home: list/search/sort projects; open/edit/clone/delete |
| `app\projects\new.tsx` | `/projects/new` | "Create Project" / "Edit Project" (line 113) | Create or edit a project record + create project DB |
| `app\projects\dashboard.tsx` | `/projects/dashboard` | "Project Dashboard" (line 84) | Per-project dashboard: info card, stat cards, quick actions |
| `app\projects\dashboard-settings.tsx` | `/projects/dashboard-settings` | "Dashboard Cards" (line 17) | Manage dashboard cards (hosts `DashboardCardManager`) |
| `app\inspection\index.tsx` | `/inspection` | "Inspection List" or `{n} Selected` (lines 178-183) | List inspections w/ search, multi-select, export, delete |
| `app\inspection\new.tsx` | `/inspection/new` | "New Inspection" (default `title` prop) | Dynamic inspection form (accordion sections) |
| `app\inspection\edit.tsx` | `/inspection/edit` | "Edit Inspection" | Thin wrapper rendering `NewInspectionScreen` with `title="Edit Inspection"` |
| `app\reports\index.tsx` | `/reports` | "Reports" (line 74) | Export project inspection data (Excel/CSV) + table preview |
| `app\settings\index.tsx` | `/settings` | "Inspection Settings" (line 158) | Form settings: sections, template export/import, reset-to-default |
| `app\settings\sections.tsx` | `/settings/sections` | "Sections" (line 286) | CRUD/reorder inspection sections |
| `app\settings\fields.tsx` | `/settings/fields` | = `sectionName` param (line 202) | CRUD/reorder fields within a section |
| `app\settings\options.tsx` | `/settings/options` | = `fieldName` param (line 175) | CRUD/reorder dropdown options of a field |
| `app\settings\device-types.tsx` | `/settings/device-types` | "Device Types" (line 345) | Manage device types (Camera, Switch, custom) + their fields |
| `app\settings\device-options.tsx` | `/settings/device-options` | `{selectedType} Options` (line 165) | Manage dropdown options of device-type fields |

Style-only files: `app\index.styles.ts`, `app\inspection\new.styles.ts`, `app\settings\device-types.styles.ts`.

### 1.4 Navigation mechanics
- Imperative navigation only — NO `Link` components anywhere.
- Hooks used: `useRouter()` (`app/index.tsx:23`, `projects/dashboard.tsx:19`, `inspection/index.tsx:36`, etc.), global `router` import (`projects/new.tsx:10`), `useLocalSearchParams<T>()` for typed params, `useFocusEffect` (expo-router) and `useFocusEffect`/`useIsFocused` (@react-navigation/native) for reload-on-focus.
- Params are always strings. Structured data (Project) is passed as JSON string in `projectData` param and parsed on the receiving screen.
- `router.replace` used once: `GeneralInformation.tsx:271-278` (redirect to existing inspection on duplicate Pole ID).

### 1.5 Key route param contracts
- `/projects/dashboard`: `projectId: string`, `projectData?: string` (JSON of Project).
- `/projects/new`: `editProjectId?: string`.
- `/projects/dashboard-settings`: `projectId: string`.
- `/inspection`: `projectId: string`.
- `/inspection/new`: `projectId: string`, `inspectionId?: string` (present = edit mode), `projectData?: string`.
- `/inspection/edit`: `inspectionId: string`, `projectId: string`, `projectData?: string`.
- `/reports`: `projectId?: string`, `projectName?: string`.
- `/settings/sections` → `/settings/fields`: `sectionId: string`, `sectionName: string`.
- `/settings/fields` → `/settings/options`: `fieldId: string`, `fieldName: string`, `fieldKey: string`.
- `/settings/sections` → `/settings/device-types`: `deviceType: string` (slug, e.g. `nvr_information` → `nvr`).
- `/settings/device-types` → `/settings/device-options`: `deviceType: string`, `fieldName: string`.

### 1.6 Android back handling
- `app\inspection\new.tsx:104-119`: `BackHandler.addEventListener("hardwareBackPress", ...)` — runs `validateBeforeExit()`; only `router.back()` if validation passes (else keeps screen). Listener removed on unmount.
- All other screens rely on the default hardware-back stack pop. No other `BackHandler` usage.

---

## 2. SCREEN INVENTORY

### 2.1 HomeScreen — `app\index.tsx` (347 lines)
- Purpose: list all projects (global DB), with search + sort + CRUD.
- State (lines 25-42): `projects: Project[]`, `search`, `sortMenuVisible`, `deleteDialogVisible`, `cloneDialogVisible`, `selectedProject`, `cloneName`, `sortBy` (8 values: newest/oldest/projectAZ/projectZA/districtAZ/districtZA/clientAZ/clientZA).
- Data sources: `ProjectRepository.getProjects()` (line 46), `ProjectRepository.deleteProject` (127), `ProjectRepository.cloneProject` (148); `ProjectDBManager.deleteProjectDb` (124), `cloneProjectDb` (154), `createProjectDb` (161), `getProjectDbPath` (145); `useInspection()` for `openProject`/`closeProject`.
- User actions: New Project → `/projects/new`; Searchbar filter (lines 64-73); Sort menu (222-229); Open (calls `openProject` then pushes `/projects/dashboard` w/ `projectData` JSON); Edit; Clone (dialog → clone DB + record → pushes edit screen); Delete (dialog → delete DB folder + global row); `useFocusEffect` closes project + reloads (lines 53-60).
- Dialogs: `DeleteProjectDialog`, `CloneProjectDialog` from `app\components\ProjectDialogs.tsx`.

### 2.2 NewProjectScreen — `app\projects\new.tsx` (194 lines)
- Purpose: create or edit a project (global DB row + per-project DB creation for new projects).
- State: `projectName`, `district` (DistrictID string), `client`, `description`, `inspectorName`, `districts: District[]`, `loading`, `saving`.
- Data sources: `DistrictRepository.getAll()` (38), `ProjectRepository.getProjectById` (edit prefill, 42), `ProjectRepository.createProject` (86), `ProjectRepository.updateProject` (75), `ProjectDBManager.getProjectDbPath`/`createProjectDb` (84/97).
- User actions: validation alerts (59-70), save → create or update → `router.back()`; dropdown via `react-native-paper-dropdown`.
- NOTE: `createProjectDb` seeds the project DB with the full template (schema + seed) scoped to real ProjectID.

### 2.3 ProjectDashboard — `app\projects\dashboard.tsx` (307 lines)
- Purpose: per-project dashboard.
- State: `statReloadKey` (bump on focus, lines 30-34), `loading`, `project: Project | null`.
- Data sources: project from nav param `projectData` (JSON) or `useInspection().project` context — deliberately NO global-DB fallback (ADR-014) (lines 36-62). `DashboardCardGrid` fetches stats via `DashboardService`.
- Renders: Project Information card (`InfoField` helper, lines 208-223), `DashboardCardGrid`, "Manage Cards" → `/projects/dashboard-settings`, Quick Actions grid: New Inspection, Inspection List, Settings, Reports.
- User actions: all navigation via `DashboardActionCard` onPress.

### 2.4 DashboardSettingsScreen — `app\projects\dashboard-settings.tsx` (29 lines)
- Purpose: thin wrapper; hosts `DashboardCardManager` (line 21) if `projectId` present, else "Project not found."

### 2.5 InspectionListScreen — `app\inspection\index.tsx` (469 lines)
- Purpose: list inspections of a project; search, multi-select, export (Excel/CSV), delete.
- State: `search`, `inspections: InspectionListItem[]`, `selectionMode`, `selectedIds: number[]`, `deleteDialogVisible`; export state derived from `useExportFlow`.
- Data sources: `InspectionListRepository.getByProject` (81-84), `filterByQuery` (163); `useInspection().project` (for name); `useExportFlow` → `exportData.createExportFile` etc.
- User actions: Back; long-press card toggles selection (305-308); tap opens `/inspection/edit`; export icon single export (107-109); bulk export (111-117); delete selected via `DeleteInspectionsDialog` (401-408); New Inspection → `/inspection/new`.
- Selection toolbar (194-264): Select All, Clear Selection, Draft/Completed counts, Export Selected, Delete Selected.
- Styles inline in `StyleSheet.create` (427-468).

### 2.6 NewInspectionScreen — `app\inspection\new.tsx` (399 lines)
- Purpose: the dynamic inspection form. Renders accordion cards per section; `general_information` → `GeneralInformation`; others → `SectionRenderer` (which also embeds `PhotoSection`/`DeviceSection`).
- Props: `title?: string` (default "New Inspection").
- State: `sections: InspectionSection[]`, `expandedSections: number[]` (starts `[1]`), `defaultTemplateId`; `initDoneRef` guard.
- Data sources: `useInspection()` (project, setProject, setInspectionDate, setInspectionId, inspectionId, setPoleId); `getDatabase()` + `db.getFirstAsync` for default TemplateID (124-128); `InspectionRepository.getSections()` (130); `InspectionRepository.createInspection` (182), `validateInspection` (66), `updateInspectionStatus` (237), `deleteInspection` (274); `PhotoRepository.getByInspection` (80).
- User actions: hardware back / Appbar back → `validateBeforeExit()` (requires valid + >=1 photo); Cancel → confirm dialog (deletes draft if new, 254-305); Save → validate → status "Completed" → Alert → back.
- Android back handled here (see section 1.6).

### 2.7 EditInspectionScreen — `app\inspection\edit.tsx` (6 lines)
- Wrapper: `<NewInspectionScreen title="Edit Inspection" />`. Route logic identical to new.tsx; `inspectionId` param present means editing (does not create a new row, and Cancel won't delete).

### 2.8 ReportsScreen — `app\reports\index.tsx` (126 lines)
- Purpose: export all inspection data for a project (Excel/CSV) + preview table.
- State: `exporting: ExportFormat | null`, `table: ReportTable | null`, `loadingPreview`.
- Data sources: `exportData.buildReportTable` (39), `exportData.exportInspections` (55).
- User actions: Export as Excel/CSV buttons (80-93); preview summary + `ReportTablePreview`.
- `EXPORT_ACTIONS` constant at lines 15-18.

### 2.9 SettingsScreen — `app\settings\index.tsx` (247 lines)
- Purpose: inspection form settings hub.
- State: `resetting`, template flow state from `useTemplateFlow()` (15); `errorFlow` ref routing error to export vs import dialog.
- Data sources: `getDatabase()` + raw SQL for "Reset to Default" transaction (42-119) — deactivates non-default sections/fields/device types/options, deletes custom `ProjectDeviceTypes`, etc.; `useTemplateFlow` → `templateData.exportTemplates`/`pickAndParseTemplate`/`applyTemplateImport`.
- User actions: navigate `/settings/sections`; Export Template; Import Template; Reset to Default (destructive confirm).
- Renders `TemplateExportDialogs` + `TemplateImportDialogs`.

### 2.10 SectionsScreen — `app\settings\sections.tsx` (351 lines)
- Purpose: list, create, edit, delete, reorder sections of the default template.
- Local `Section` interface (lines 12-25) includes `FieldCount`.
- Data sources: `getDatabase()` + raw SQL; ordering pins general_information/remarks/photos (line 44); `handleSave` inserts with DisplayOrder shifting before `remarks` (88-109); move up/down swaps DisplayOrder in transaction (142-182).
- User actions: Appbar "+" new section; card press → fields (or device-types if `*_information`); pencil edit; trash delete (non-default only); chevron reorder (locked sections blocked).
- "Locked" sections: `general_information`, `photos`, `remarks` (185-188). Chips: Locked / Device Type / Default / Custom / Hidden.

### 2.11 FieldsScreen — `app\settings\fields.tsx` (289 lines)
- Purpose: manage fields in a section.
- State: `fields: Field[]`, dialog state (name/key/type/placeholder/default/help/required/visible), `editing`.
- Data sources: `FieldRepository.getBySection` (34), `.create`/`.update`/`.hardDelete`/`.reorder`; `FIELD_TYPES` from FieldRepository (line 10).
- User actions: FAB New Field; type chips; reorder; delete; "Manage Options" (dropdown only) → `/settings/options`.

### 2.12 OptionsScreen — `app\settings\options.tsx` (246 lines)
- Purpose: manage dropdown options for a field.
- Data sources: `FieldOptionRepository.getByField`/create/update/hardDelete/reorder.
- State: `options: FieldOption[]`, dialog state (label/value/isDefault).
- User actions: FAB New Option; reorder; delete; "Default Selection" switch.

### 2.13 DeviceTypesScreen — `app\settings\device-types.tsx` (414 lines)
- Purpose: manage device types (Camera, Switch, custom like NVR) and their field definitions; toggle device inclusion in inspection form.
- State: `defaultTemplateId`, `deviceTypes: string[]`, `selectedType`, `fields: DeviceFieldDefinition[]`, `enabledTypes: Set<string>`, plus 4 dialog states.
- Data sources: `DeviceFieldDefinitionsRepository.getDeviceTypes`/`getByDeviceType`/`add`/`update`/`delete`/`moveUp`/`moveDown`; `getDatabase()` raw SQL for toggle logic (97-187): enables/disables `{type}_count` field + `{type}_information` section; `handleDeleteDeviceType` (285-339) cascades deactivation across defs/options/section/count field/ProjectDeviceTypes/DeviceRecords.
- User actions: select type chip; enable/disable in form (Switch); add field; edit field; delete field; reorder; add device type; delete device type; "Options" → `/settings/device-options`.

### 2.14 DeviceOptionsScreen — `app\settings\device-options.tsx` (281 lines)
- Purpose: manage dropdown options per device-type field.
- State: `selectedType`, `selectedField`, `options: DeviceOption[]`, `fields`, dialog state.
- Data sources: `DeviceOptionsRepository.getByField`/add/update/delete/moveUp/moveDown; `DeviceFieldDefinitionsRepository.getByDeviceType`.
- User actions: field chips (dropdown fields only), Add/Edit/Delete/Reorder option.

### 2.15 Route-embedded components (non-route files in app/)
- `app\components\ProjectDialogs.tsx` — `DeleteProjectDialog`, `CloneProjectDialog` (see section 3.7).
- `app\inspection\components\DeleteInspectionsDialog.tsx`, `app\inspection\components\ExportDialogs.tsx` (see section 3.7).
- `app\settings\components\DeviceTypeBody.tsx`, `DeviceTypeDialogs.tsx`, `DeviceTypeFieldCard.tsx`, `TemplateExportDialogs.tsx`, `TemplateImportDialogs.tsx` (see section 3.7).

---

## 3. COMPONENT INVENTORY — `src/components/`

### 3.1 Root level
- `src\components\StatCard.tsx` (65 lines) — `StatCard`
  - Props: `{ title: string; value: number | string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color?: string }` (lines 7-12, default color `COLORS.primary`).
  - Purpose: single dashboard statistic card (icon, big value, title).

### 3.2 `src\components\dashboard\`
- `src\components\dashboard\DashboardActionCard.tsx` (61 lines) — `DashboardActionCard`
  - Props: `{ title: string; subtitle: string; icon: MCI.glyphMap key; onPress: () => void; borderColor?: string; borderWidth?: number }` (lines 7-14; defaults `#D9D9D9`/1).
  - Purpose: tappable quick-action card (icon + title + subtitle).
- `src\components\dashboard\DashboardCardGrid.tsx` (293 lines) — `DashboardCardGrid`
  - Props: `{ projectId: number; reloadKey?: number; focused?: boolean }` (lines 13-17).
  - Purpose: renders enabled dashboard cards grouped by `SectionLabel`; collapsible "Total Summary"/"Today's Summary" panels; pairs non-breakdown cards into rows of 2 `StatCard`s; renders `StatBreakdownCard` for `CardMode` dropdown/datebreakdown.
  - Data sources: `DashboardService.getEnabledCardsWithCounts` (line 30); hooks `useDashboardAutoRefresh`, `useSectionCollapse`; `SECTION_LABEL_TOTAL`/`SECTION_LABEL_TODAY` from seed (line 10).
  - `isBreakdown` helper (lines 19-20). `renderSectionCards` (56-106). testIDs for tests.
- `src\components\dashboard\DashboardCardManager.tsx` (305 lines) — `DashboardCardManager`
  - Props: `{ projectId: number }` (lines 42-44).
  - Purpose: list/enable/reorder/delete dashboard cards + smart-add cards from form fields.
  - Data sources: `DashboardCardRepository.getAllCards`/`deleteCard`/`setCardEnabled`/`reorderCards`/`normalizeSections`/`resetDefaultCards`; `SmartCardGenerator.getAvailableFields`/`addSmartCardsForField`/`getSpec`.
  - Constants: `ENTITY_LABELS` (inspections/cameras/switches/devices, 19-24), `FIELD_TYPE_LABELS` (26-40), `COUNTER_TYPES` from StatisticCountService (16).
  - Dialogs: Add Card picker (193-231), Delete Card (233-246).
- `src\components\dashboard\StatBreakdownCard.tsx` (168 lines) — `StatBreakdownCard`
  - Props: `{ title: string; icon: MCI key; color?: string; rows: BreakdownRow[] }` (lines 11-16).
  - Purpose: breakdown statistic card; renders card-grid layout if <=6 options and labels <=15 chars (`MAX_OPTIONS`=6, `MAX_LABEL_LENGTH`=15, lines 8-9), else a list. `BreakdownRow` from `DashboardService`.

### 3.3 `src\components\export\`
- `src\components\export\useExportFlow.ts` (104 lines) — `useExportFlow(projectId: number, projectName: string)`
  - State machine `ExportFlowState` (lines 9-14): `idle | choosing{target} | exporting{format,target} | success{result} | error{format,message}`.
  - `ExportTarget { ids: number[] }` (5-7).
  - API returned: `{ state, busy, beginExport(target), runExport(format), retry(), dismiss(), open(), share() }` (94-103). Uses `exportData.createExportFile`/`openExportFile`/`shareExportFile`; `busy = phase === "exporting"`.

### 3.4 `src\components\inspection\`
- `src\components\inspection\CameraSection.tsx` (387 lines) — `CameraSection`
  - Props: `{ inspectionId: number; count: number }` (25-28).
  - Purpose: renders `count` camera detail cards for an inspection. Loads existing `Camera` rows via `CameraRepository.getByInspection`, pads to `count` with empty cameras (`makeEmptyCamera`, 30-44); dropdown options from `DeviceOptionsRepository.getDropdownData("Camera", field)` falling back to hardcoded `defaultOptions` (51-90). Debounced (500ms) save via `CameraRepository.save` per camera (151-191); syncs `CameraID` after first save.
- `src\components\inspection\CameraSection.styles.ts` (76 lines) — styles for CameraSection.
- `src\components\inspection\DeviceSection.tsx` (257 lines) — `DeviceSection`
  - Props: `{ inspectionId: number; deviceType: string; count: number; templateId?: number; locked?: boolean }` (13-19).
  - Purpose: generic device-type detail editor (NVR, Router, etc.). Loads `DeviceFieldDefinition`s and existing `DeviceRecord`s; pads to `count`; `DeviceData` is a JSON string of field values (98-105); debounced save (107-128); dropdown values from `DeviceOptionsRepository.getDropdownData(deviceType, fieldName, templateId)`. When `locked`, fields show "Pole ID Required" alert on tap (191-203).
- `src\components\inspection\FieldRenderer.tsx` (191 lines) — `FieldRenderer`
  - Props interface `FieldRendererProps` (16-50): `fieldKey?, fieldName, fieldType, required?, value?, editable?, placeholder?, helpText?, showLockedMessage?, options?, error?, onChange?, onCameraCountChange?, onSwitchCountChange?`.
  - Purpose: label + control + HelperText; auto-fills DATE_AUTO with today's date (92-112); when not editable and `showLockedMessage`, wraps in Pressable alert "Pole ID Required" (170-189).
  - Delegates to `renderInput` from `renderFieldInput.tsx` (120-134).
- `src\components\inspection\GeneralInformation.tsx` (355 lines) — `GeneralInformation` (`forwardRef`)
  - Purpose: renders general_information section fields (date/division/district/block/inspector_name/pole_id/location/gps/remarks...). Loads fields via `InspectionRepository.getFieldsByKey("general_information", templateId)` (149-158) and values via `getInspectionValues` (107-147). Polls context propagation up to 5x50ms (56-64); NEVER calls `getProjectById` (ADR-014).
  - Pole ID logic: unlocks form when set (233-234), debounced (300ms) duplicate check `getInspectionByPoleId` → Alert with "Edit Existing"/"Create New"/"Cancel" (241-291); "Edit Existing" does `router.replace("/inspection/new", {projectId, inspectionId})`.
  - GPS: `getCurrentLocation()` util + save (160-186); "Get Current Location" button.
  - Debounced (500ms) `saveFieldValue` for all fields; `pole_id` also updates `Inspection` row (302-317).
  - Exposes imperative handle `getPoleId()` (192-196).
- `src\components\inspection\PhotoCard.tsx` (94 lines) — `PhotoCard`
  - Props: `{ photo: Photo; index: number; state?: WatermarkState; onPreview: (photo) => void; onDelete: (photoId: number) => void }` (8-14). `WatermarkState` re-exported (line 6).
  - Purpose: single photo list card; shows spinner/checkmark/! for watermark state; preview + delete icon buttons.
- `src\components\inspection\PhotoPreviewModal.tsx` (112 lines) — `PhotoPreviewModal`
  - Props: `{ photo: Photo | null; visible: boolean; onClose: () => void; contextPoleId: string | undefined; block: string; project: Project | null }` (8-15).
  - Purpose: full-screen `Modal` image preview; uses `getFileUri` + `formatLocation` from `photoUtils`.
- `src\components\inspection\PhotoSection.tsx` (231 lines) — `PhotoSection`
  - Props: `{ inspectionId: number; locked?: boolean }` (30-33).
  - Purpose: photos section. Loads `PhotoRepository.getByInspection` + block value; composes `useWatermarkProcessor` + `usePhotoCapture`; renders hidden WebView (watermark canvas), `PhotoPreviewModal`, `PhotoSectionHeader`, empty state, and `PhotoCard` list. Delete blocked while watermarking (90-96); SAF delete for `content://` (106-107). `hasMinPhotos` = >=1; `allComplete` (123-126).
- `src\components\inspection\PhotoSectionHeader.tsx` (128 lines) — `PhotoSectionHeader`
  - Props: `{ photoCount: number; hasMinPhotos: boolean; allComplete: boolean; capturing: boolean; onCapture: () => void }` (5-11).
  - Purpose: header with "Photos (n)" + status chip (Min 1 required / Watermarking... / OK) + Capture button.
- `src\components\inspection\SectionRenderer.tsx` (232 lines) — `SectionRenderer`
  - Props: `{ inspectionId: number; sectionId: number; sectionKey?: string; templateId?: number }` (28-33).
  - Purpose: renders a non-general section: loads fields via `InspectionFieldRepository.getFieldsBySection`; values via `InspectionValueRepository.getValue` (64-90); dropdown options + default option (71-83); saves via `updateValue` → `InspectionValueRepository.saveValue` (127-155); detects `{type}_count` fields to set `deviceCounts` (101-117); renders `DeviceSection` for the matching device-type section when count>0 (196-207); renders `PhotoSection` when `sectionKey === "photos"` (209-216). Form locked while `poleId` empty (125).
- `src\components\inspection\renderFieldInput.tsx` (391 lines) — `renderInput(params)` + `DropdownOption`
  - Param type (11-25): `{ fieldType, label, value, editable, placeholder, error?, options, fieldKey?, onCameraCountChange?, onSwitchCountChange?, onChange?, dropdownFocus, setDropdownFocus }`.
  - Purpose: switch on `fieldType.toUpperCase()`: TEXT, NUMBER (numeric keyboard + strips non-digits + count callbacks), MULTILINE, DATE_AUTO, DATE, TIME, DROPDOWN/PROJECT_DROPDOWN (searchable `Dropdown` from react-native-element-dropdown), SWITCH (`"1"/"0"`), CHECKBOX, GPS (read-only input), default TextInput.
- `src\components\inspection\photoUtils.ts` (72 lines) — pure helpers: `formatDate(dateStr)`, `formatLocation(lat,lng)` → "lat, lng" or "No GPS", `getFileUri(filePath)` → adds `file://` prefix, `formatWatermarkDate(iso)` → "DD-Mon-YYYY hh:mm AM/PM", `formatLatLngWM(lat,lng)`, `generateFileName(district, block, pole, timestamp)` → `DISTRICT_BLOCK_POLE_DDMMMYYYY_HHMMSS.jpg` (sanitized, truncated 20 chars).
- `src\components\inspection\usePhotoCapture.ts` (163 lines) — `usePhotoCapture(options)`
  - Options (12-18): `{ inspectionId; project: Project | null; contextPoleId: string | undefined; block: string; onPhotoCaptured(newPhotoId, assetUri, fileName, lines) }`.
  - API: `{ capturing, capturePhoto }`. Camera + location permissions; `ImagePicker.launchCameraAsync` (quality 0.8); GPS with cache fallback + timeout race (38-68); builds `Photo` row, `PhotoRepository.create`, watermark `lines` [poleId, "district, block", date, gps].
- `src\components\inspection\useWatermarkProcessor.ts` (149 lines) — `useWatermarkProcessor({ project, onPhotosUpdated })`
  - API: `{ watermarkState, watermarkHtml, webViewRef, handleWebViewMessage, enqueueWatermark, clearWatermarkState }`.
  - Purpose: serial queue of `WatermarkJob { photoId, inputPath, fileName, lines, retries }`; reads image base64, builds page via `buildWatermarkPage`, posts to hidden WebView; on message saves watermarked photo via SAF (`ensureTreeUri`/`getProjectDir`/`writePhoto`) and `PhotoRepository.updateFilePath` (96-129); one retry per job (41-53).

### 3.5 `src\components\reports\`
- `src\components\reports\ReportTablePreview.tsx` (67 lines) — `ReportTablePreview`
  - Props: `{ table: ReportTable }` (line 8).
  - Purpose: horizontal scroll preview of report: band row (section names spanning merged widths), header row, data rows (device rows tinted `#E3F2FD`). `COLUMN_WIDTH = 150`.

### 3.6 `src\components\template\`
- `src\components\template\useTemplateFlow.ts` (140 lines) — `useTemplateFlow()`
  - State machine `TemplateFlowState` (12-20): `idle | exporting | exported{result} | parsing | confirming{parsed} | importing | imported{message} | error{message}`.
  - API: `{ state, busy, beginExport, beginImport, confirmImport, cancelImport, dismissExport, dismissImport, dismissError, shareExported, retry }`.
  - Uses `templateData.exportTemplates`/`pickAndParseTemplate`/`applyTemplateImport`/`shareTemplateFile`. `busy` = exporting|parsing|importing (125). `errorSource` ref routes retry (112-123).

### 3.7 Route-embedded components (in `app/`, used by screens)
- `app\components\ProjectDialogs.tsx` (84 lines):
  - `DeleteProjectDialog` — props `{ visible; projectName?; onDismiss; onConfirm }` (4-9). Lists everything that gets deleted.
  - `CloneProjectDialog` — props `{ visible; cloneName; onDismiss; onCloneNameChange; onConfirm; confirmDisabled }` (49-56).
- `app\inspection\components\DeleteInspectionsDialog.tsx` (43 lines):
  - `DeleteInspectionsDialog` — props `{ visible; selectedIds; selectedDrafts; selectedCompleted; onDismiss; onDeleted }` (6-13). Confirm calls `InspectionRepository.deleteMultipleInspections`.
- `app\inspection\components\ExportDialogs.tsx` (140 lines):
  - `InspectionExportDialogs` — props (7-20): format chooser dialog, exporting progress, success (Open/Share/Close), error (Retry/Close). `FORMAT_META` for excel/csv (22-25); `plural()` helper (27-29).
- `app\settings\components\DeviceTypeBody.tsx` (142 lines):
  - `DeviceTypeBody` — props (10-25): device-type chips, enable switch, add/delete type, field list via `DeviceTypeFieldCard`.
- `app\settings\components\DeviceTypeDialogs.tsx` (179 lines):
  - `FieldDialog` (30-88) — field label/type chips/required; `AddTypeDialog` (99-119); `DeleteFieldDialog` (129-145); `DeleteTypeDialog` (154-178). Local `FIELD_TYPES` (5-11).
- `app\settings\components\DeviceTypeFieldCard.tsx` (80 lines):
  - `DeviceTypeFieldCard` (`React.memo`) — props (6-20): renders field label, type/required, Options button (dropdown fields), edit/delete/reorder.
- `app\settings\components\TemplateExportDialogs.tsx` (75 lines) — export progress/success/error dialogs; props (6-14) using `TemplateExportResult`.
- `app\settings\components\TemplateImportDialogs.tsx` (113 lines) — parse/confirm/apply/success/error dialogs; props (6-17) using `ParsedTemplateFile`.

---

## 4. CONTEXT INVENTORY

### 4.1 InspectionContext — `src\context\InspectionContext.tsx` (106 lines)
- Provider: `InspectionProvider` (line 34), mounted in `app\_layout.tsx:79` inside `PaperProvider`.
- Exposed hook: `useInspection()` (lines 96-106) — throws if used outside provider.
- Full interface `InspectionContextType` (lines 13-28):

| Field | Type | Settable via | Purpose |
|---|---|---|---|
| `project` | `Project \| null` | `setProject` | Currently active project |
| `setProject` | `(p: Project \| null) => void` | — | Directly set project (used by new.tsx loadProject) |
| `openProject` | `(p: Project) => Promise<void>` | — | `openProjectDb(p.DBPath, p.ProjectID)` then setProject (45-50) |
| `closeProject` | `() => Promise<void>` | — | `clearActiveProject()` + resets all state (52-58) |
| `removeProject` | `(p: Project) => Promise<void>` | — | close if active, `deleteProjectDb(p.DBPath)` (60-67) |
| `inspectionDate` | `string` | `setInspectionDate` | Current inspection date (DD-Mon-YYYY) |
| `setInspectionDate` | `(d: string) => void` | — | |
| `inspectionId` | `number \| null` | `setInspectionId` | Active inspection row id |
| `setInspectionId` | `(id: number \| null) => void` | — | |
| `poleId` | `string` | `setPoleId` | Pole ID (drives form lock state) |
| `setPoleId` | `(s: string) => void` | — | |

- Implemented with `useState` for all 4 data fields; `value` memoized (69-87). Only one context in the app (verified via grep: only this file calls `createContext`).

---

## 5. MODELS — `src/models/` (all interfaces)

- `src\models\Project.ts` (26 lines) — `Project`: `ProjectID: number`, `ProjectName: string`, `DistrictID: number`, `DBPath?: string | null`, `SAFPath?: string | null`, `DistrictName?: string`, `DivisionName?: string`, `Block?: string | null`, `Client?: string | null`, `Description?: string | null`, `InspectorName?: string | null`, `CreatedAt: string`, `UpdatedAt: string`. (NOTE: model does NOT include `TemplateID`, but `GeneralInformation` reads `(projectData as any)?.TemplateID`.)
- `src\models\District.ts` (4 lines) — `District`: `DistrictID: number`, `DistrictName: string`.
- `src\models\Camera.ts` (29 lines) — `Camera`: `CameraID?`, `InspectionID: number`, `CameraNo: number`, `CameraType: string|null`, `CameraStatus: string|null`, `CameraMake: string|null`, `CameraModel: string|null`, `CameraIP: string|null`, `CameraSerialNumber: string|null`, `CameraSI: string|null`, `SDCardCapacity: string|null`, `SDCardStatus: string|null`, `CreatedAt?`, `UpdatedAt?`.
- `src\models\Switch.ts` (25 lines) — `Switch`: `SwitchID?`, `InspectionID: number`, `SwitchNo: number`, `SwitchType/SwitchStatus/SwitchMake/SwitchModel/SwitchIP/SwitchSerialNumber/SwitchSI: string|null`, `CreatedAt?`, `UpdatedAt?`. (Currently NOT referenced by any UI file in scope.)
- `src\models\DashboardCard.ts` (25 lines) — `CardModeValue = "entitycount" | "dropdown" | "sum" | "fieldcount" | "datebreakdown"` (line 1). `DashboardCard`: `CardID?`, `ProjectID: number`, `CardKey: string`, `Title: string`, `Icon: string`, `Color: string`, `EntityType: string`, `CounterType: string`, `FilterJson?: string|null`, `CountMode: "count" | "distinct"`, `CardMode: CardModeValue`, `DistinctColumn?: string|null`, `BreakdownField?: string|null`, `SectionLabel?: string|null`, `AggregateField?: string|null`, `DeviceType?: string|null`, `SortOrder: number`, `Enabled: number`, `IsDefault: number`, `CreatedAt?`, `UpdatedAt?`.
- `src\models\InspectionField.ts` (27 lines) — `InspectionField`: `FieldID: number`, `SectionID: number`, `FieldName: string`, `FieldKey: string`, `FieldType: string`, `Placeholder: string|null`, `DefaultValue: string|null`, `HelpText: string|null`, `ValidationRule: string|null`, `DisplayOrder: number`, `IsRequired: number`, `IsVisible: number`, `IsActive: number`.
- `src\models\InspectionValue.ts` (13 lines) — `InspectionValue`: `ValueID?`, `InspectionID: number`, `FieldID: number`, `FieldValue: string|null`, `CreatedAt?`, `UpdatedAt?`.
- `src\models\Photo.ts` (21 lines) — `Photo`: `PhotoID?`, `InspectionID: number`, `PhotoType: string|null`, `FileName: string`, `FilePath: string`, `Latitude: number|null`, `Longitude: number|null`, `CapturedAt: string|null`, `Remarks: string|null`, `CreatedAt?`.

### Additional types living in repositories (used heavily by UI, documented here for completeness):
- `src\database\repositories\InspectionTypes.ts` — `InspectionSection { SectionID, SectionName, SectionKey, DisplayOrder }` (1-6); `InspectionField { ...IsActive, CreatedAt, UpdatedAt }` (8-29).
- `src\database\repositories\InspectionListRepository.ts` — `InspectionListItem { InspectionID, PoleID, Division|null, District|null, Block|null, InspectionDate, Status }` (5-13).
- `src\database\repositories\FieldRepository.ts` — `Field` (3-26) + `FIELD_TYPES` (28-38): text/number/multiline/dropdown/date/date_auto/time/GPS/checkbox.
- `src\database\repositories\FieldOptionRepository.ts` — `FieldOption` (3-13).
- `src\database\repositories\DeviceFieldDefinitionsRepository.ts` — `DeviceFieldDefinition { FieldDefID?, TemplateID?, DeviceType, FieldName, Label, FieldType, IsRequired, DisplayOrder, IsActive }` (3-13).
- `src\database\repositories\DeviceOptionsRepository.ts` — `DeviceOption` (3-12); `DEVICE_FIELDS` label map (14-25).
- `src\database\repositories\DeviceRecordsRepository.ts` — `DeviceRecord` (3-12).
- `src\database\repositories\DashboardService.ts` — `BreakdownRow { label, count }` (5-8); `CardWithCount extends DashboardCard { count?; breakdown? }` (10-13).
- `src\database\repositories\SmartCardGenerator.ts` — `SmartFormField` (6-15); `SmartCardKind = CardModeValue | "skip"` (17); `SmartCardSpec` (19-26).
- `src\database\repositories\StatisticCountService.ts` — `CounterTypeConfig` (72-76); `COUNTER_TYPES` (78-92) `{ total: "Total", today: "Today's" }`.

---

## 6. CONSTANTS — `src/constants/`

- `src\constants\ui.ts` (22 lines):
  - `SPACING` (1-7): `xs:4, sm:8, md:12, lg:16, xl:24` (as const).
  - `COLORS` (9-18): `background:"#F5F5F5"`, `surface:"#FFFFFF"`, `primary:"#0B5ED7"`, `textPrimary:"#333"`, `textSecondary:"#666"`, `textMuted:"#999"`, `summaryTotal:"#0B5ED7"`, `summaryToday:"#198754"`.
  - `RADIUS` (20-22): `md:12`.
- `src\database\seeds\dashboard-cards.seed.ts` (referenced by UI): `SECTION_LABEL_TOTAL = "Total Summary"` (line 23), `SECTION_LABEL_TODAY = "Today's Summary"` (line 24) — used by `DashboardCardGrid` (lines 10, 117).
- No other `src/constants/*` files (only `ui.ts`).

---

## 7. HOOKS — `src/hooks/`

- `src\hooks\use-icon-fonts.ts` (52 lines) — `useIconFonts(): readonly [boolean, Error | null]`
  - Loads all `@expo/vector-icons` family fonts via CDN only under Expo Go (`ExecutionEnvironment.StoreClient`), else empty map (resolves immediately in native/web). `ICON_VECTOR_VERSION = "15.1.1"` (must match package.json). Font name→file map `ICON_FAMILIES` (15-37). Used by `app\_layout.tsx:20`.
- `src\hooks\useDashboardAutoRefresh.ts` (56 lines) — `useDashboardAutoRefresh(projectId: number, focused: boolean): number`
  - Returns incrementing `reloadKey`. Triggers reload on: `InspectionDataBus` events for this project (19-26), app foreground via `AppState` (28-35), next midnight (37-47, `msUntilNextMidnight` helper), and a 60s poll while focused (49-53, `POLL_INTERVAL_MS = 60_000`).
- `src\hooks\useSectionCollapse.ts` (52 lines) — `useSectionCollapse(projectId: number): { isCollapsed(label: string): boolean; toggle(label: string): void }`
  - Persists collapsed summary-section labels per project in AsyncStorage key `accc_dash_collapsed_{projectId}` (line 4). Loads on mount (22-34); `toggle` updates state + AsyncStorage (38-49).

---

## 8. UTILS — `src/utils/`

- `src\utils\logger.ts` (16 lines) — `logger` object: `info`, `warn`, `debug` (no-op in prod via `IS_PROD = !__DEV__`, line 1), `error` (always logs).
- `src\utils\date.ts` (43 lines):
  - `formatInspectionDate(date: Date): string` → `"DD-Mon-YYYY"` (16-22).
  - `getTodayDateString(): string` (24-26), `getCurrentInspectionDate(): string` (28-30) — both today's date.
  - `parseInspectionDate(dateStr: string): number` — parses `DD-Mon-YYYY` → epoch ms or `NaN` (32-42).
- `src\utils\InspectionDataBus.ts` (31 lines) — `InspectionDataBus` singleton pub/sub:
  - `subscribe(listener: (e: InspectionChangeEvent) => void): () => void` (10-15).
  - `emitInspectionsChanged(projectId: number): void` (17-26) — fire-and-forget, listener errors swallowed.
  - `__reset()` (28-30) for tests. `InspectionChangeEvent { projectId: number }` (1-4).
- `src\utils\location.ts` (32 lines):
  - `getCurrentLocation(): Promise<CurrentLocation | null>` — requests foreground permission, `Location.getCurrentPositionAsync` Accuracy.High; `CurrentLocation { latitude, longitude }` (4-7). Uses `alert()` on failure.
- `src\utils\storageManager.ts` (73 lines) — SAF (Storage Access Framework) photo storage:
  - `ensureTreeUri(): Promise<string>` — AsyncStorage-cached SAF tree URI (DCIM), requests directory permission (8-21).
  - `getProjectDir(treeUri, projectLabel): Promise<string>` — creates/verifies `ACCC Inspection/<label>` dirs (35-53).
  - `writePhoto(projectDirUri, fileName, base64data): Promise<string>` — createFileAsync `image/jpeg` + base64 write (55-67).
  - `deletePhoto(fileUri): Promise<void>` (69-73).
  - Keys: `accc_saf_tree_uri`, `accc_dir_v2`, `proj_dir_{label}`; legacy cleanup key `accc_saf_accc_dir` (4-6).
- `src\utils\watermarkHtml.ts` (78 lines):
  - `buildWatermarkPage(imageBase64: string, lines: string[], photoId: number): string` — HTML page with `<canvas>` that draws the image, renders sanitized text lines in a rounded translucent box (bottom-left, green `#76FF03` mono), exports JPEG via `toBlob`, posts `{photoId, base64}` via `ReactNativeWebView.postMessage`. Sanitizes lines against `<>&"'` and backticks (line 3).
- `src\utils\exportData.ts` (506 lines):
  - Types: `ExportFormat = "csv" | "excel"` (9); `ExportResult { fileUri, fileName, format, inspectionCount, rowCount, durationMs }` (11-18); `ReportColumn` (20-27); `ReportSection` (29-36); `ReportRow` (38-41); `ReportTable { sections, headers, rows, inspectionCount }` (43-48).
  - `splitLatLong(value): [string, string]` (56-61).
  - `buildCsv(table): string` (73-76) with `escapeCell` (63-67).
  - `buildExcelBase64(table): string` (78-136) — XLSX sheet with band row, merges, autofilter, freeze rows, borders/fills.
  - `buildReportTable(projectId, inspectionIds?): Promise<ReportTable>` (138-143) → `buildReportTableInternal` (158-386): queries sections/fields/device defs/values/records/photos; builds device columns appended to `*_information` sections (228-242); adds Summary "Photos" column (244-251); splits inspection rows by max device count (363-383); `REPEATED_SECTION_KEYS = {general_information, categorization}` (54) repeat on every device row.
  - `getReportCounts(projectId)` (145-156).
  - `createExportFile(projectId, projectName, inspectionIds: number[]|null, format): Promise<ExportResult | null>` (434-464) — returns null if no rows; writes to `FileSystem.documentDirectory`; `buildFileName` (397-408) uses division/project/inspector + timestamp; meta from global DB via `getProjectExportMeta` (410-423, uses `getGlobalDatabase()`).
  - `shareExportFile(result)` (466-475), `openExportFile(result)` (477-489, Android via `IntentLauncher`), `exportInspections(projectId, projectName, format): Promise<boolean>` (491-495), `exportInspection(projectId, projectName, inspectionId, format)` (497-506).
- `src\utils\templateData.ts` (587 lines):
  - Types: `TemplateExportSummary`/`TemplateImportSummary` (13-19, 88-94); `TemplateExportResult { fileUri, fileName, summary }` (21-25); `TemplateExportData { version, exportedAt, templates, projectDeviceTypes }` (27-32); `TemplateExportTemplate` (34-41); `TemplateExportSection` (43-52); `TemplateExportField` (54-69); `TemplateExportDeviceType` (71-78); `TemplateExportDeviceOption` (80-86); `ParsedTemplateFile { data, summary }` (96-99).
  - `VALID_FIELD_TYPES` (7) — 13 field types; `normalizeFieldType` (9-11).
  - `exportDefaultTemplate()` (101-105), `exportTemplates(): Promise<TemplateExportResult | null>` (107-288) — dumps active templates, sections, fields+options, device types/options, project device types; version "2.0"; writes `template_YYYY-MM-DD.json`.
  - `shareTemplateFile(result)` (290-300).
  - `pickAndParseTemplate()` (324-426) — DocumentPicker JSON, validates structure + field types + options; supports v2 (`raw.templates`) and legacy v1 (`raw.template` + `raw.sections`).
  - `applyTemplateImport(data)` (428-579) — upserts templates (deactivates existing sections, re-inserts), sections, fields, options, device defs/options, project device types; deactivates orphans; returns `{success, message}`.
  - `importTemplate()` (581-586) — convenience: pick → apply.

---

## CROSS-CUTTING NOTES
- DB access from UI is routed through `getDatabase()` (project DB) and repositories. The ONLY UI-facing call to `getGlobalDatabase()` is `exportData.ts:413` (`getProjectExportMeta`), invoked from the export util (Reports/Inspection-list flows, outside the mid-inspection DB session).
- `app\inspection\new.tsx`, `GeneralInformation.tsx`, and `projects/dashboard.tsx` deliberately avoid `getProjectById()` / global DB fallback per ADR-014 (comments at `new.tsx:158-159`, `GeneralInformation.tsx:57-59`, `dashboard.tsx:58-59`).
- The inspection form lock pattern: `poleId` empty → all non-`pole_id` fields are read-only with a "Pole ID Required" alert (see `FieldRenderer`, `DeviceSection`, `PhotoSection`).
- No nested layout files exist; every route is a leaf. `+html.tsx` is web-only.
