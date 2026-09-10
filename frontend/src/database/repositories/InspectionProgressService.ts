//frontend\src\database\repositories\InspectionProgressService.ts
//
// Read-only inspection progress calculation.
//
// The progress summary on the inspection screen is derived from the inspection's
// own data (template config + saved values + active device records). This
// service NEVER writes to the database and never applies defaults — it only
// reads through the repositories.
//
// The overall progress is the sum of five groups (weighted by units, never an
// average of percentages):
//   - General Information: every active+visible field of the
//     general_information section, excluding the fields the app fills itself
//     or that only contextualize the inspection (date, division, district).
//     The exclusion is applied to every section.
//   - Default Sections: every active+visible field of every factory
//     (IsDefault=1) non-device section (Pole Structure, Junction Box, ...).
//   - Default Device Type: factory device types (IsDefault=1 device sections),
//     aggregated across every configured device: device count × the number of
//     progress-relevant fields per device.
//   - Custom Device Types: user-created device types (IsDefault=0 device
//     sections), same field-based aggregation.
//   - Custom Sections: user-created sections (IsDefault=0, non-device).
//
// Progress covers every progress-relevant field, not just mandatory ones:
// mandatory status drives validation, while progress reflects the full set of
// inspection results. Photos contribute zero units (there is no meaningful
// denominator).
//
// A value is "meaningful" when it is not empty per isFieldValueEmpty. A device
// record is complete only when ALL its active+visible fields carry meaningful
// values; a record with no active+visible fields never counts as complete.
//
// Device totals come from the configured count field (`{type}_count`) times
// the number of progress-relevant fields per device, never from the number of
// stored records. A device type with count 1 and 9 empty fields therefore
// contributes 0/9 — real inspection results the inspector still has to fill.
// The parent device section is complete only when every relevant field across
// every configured device is complete.

import { InspectionRepository, isFieldValueEmpty } from "./InspectionRepository";
import { InspectionEditSessionState } from "./InspectionEditSessionState";
import { InspectionLiveValues } from "./InspectionLiveValues";
import { DeviceRecordsRepository, DeviceRecord } from "./DeviceRecordsRepository";
import DeviceFieldDefinitionsRepository, {
  DeviceFieldDefinition,
} from "./DeviceFieldDefinitionsRepository";
import { InspectionSection, InspectionField } from "./InspectionTypes";

export type ProgressGroupKey =
  | "general_information"
  | "default_sections"
  | "default_devices"
  | "custom_devices"
  | "custom_sections";

export interface ProgressGroup {
  key: ProgressGroupKey;
  label: string;
  completed: number;
  total: number;
  remaining: number;
  percentage: number;
}

// Per-device (inside a device section) field-based progress: how many
// active+visible DeviceFieldDefinitions of that device carry a meaningful
// value. This is a UI breakdown only — the overall totals consume the parent
// aggregated device-field totals, never the per-device counts, so device
// fields are never double-counted.
export interface DeviceProgress {
  deviceNo: number;
  completed: number;
  total: number;
  remaining: number;
  percentage: number;
}

// Per-section progress for the section-header UI. One entry per actual section
// (keyed by SectionKey) except photos and sections with nothing to complete
// (total === 0 sections are omitted — the header shows chevron-only). Device
// sections use the same key as their `{type}_information` section so the header
// can look itself up, and carry a per-device breakdown for the collapsible
// device cards.
export interface InspectionSectionProgress {
  key: string;
  label: string;
  completed: number;
  total: number;
  remaining: number;
  percentage: number;
  devices?: DeviceProgress[];
}

export interface InspectionProgress {
  completed: number;
  total: number;
  remaining: number;
  percentage: number;
  groups: ProgressGroup[];
  sections: InspectionSectionProgress[];
}

const GROUP_KEYS: ProgressGroupKey[] = [
  "general_information",
  "default_sections",
  "default_devices",
  "custom_devices",
  "custom_sections",
];

const GROUP_LABELS: Record<ProgressGroupKey, string> = {
  general_information: "General Information",
  default_sections: "Default Sections",
  default_devices: "Default Device Type",
  custom_devices: "Custom Device Types",
  custom_sections: "Custom Sections",
};

// Fields the app fills itself or that only contextualize the inspection.
// None of these represent a progress-relevant inspection result, so they are
// excluded from every section's denominator — date, division and district are
// filled automatically. pole_id (the Site ID) identifies the pole being
// inspected and DOES count toward progress.
const EXCLUDED_FIELD_KEYS = new Set([
  "date",
  "division",
  "district",
]);

const GENERAL_INFO_SECTION_KEY = "general_information";
const PHOTOS_SECTION_KEY = "photos";
const COUNT_FIELD_SUFFIX = "_count";
const DEVICE_SECTION_SUFFIX = "_information";

function slugifyDeviceType(deviceType: string): string {
  return deviceType.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function deviceDataOf(
  record: DeviceRecord | null | undefined
): Record<string, string | null> {
  if (!record) return {};
  try {
    const parsed =
      typeof record.DeviceData === "string"
        ? JSON.parse(record.DeviceData)
        : record.DeviceData;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function percentage(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export class InspectionProgressService {
  static async getInspectionProgress(
    inspectionId: number | null,
    templateId?: number
  ): Promise<InspectionProgress> {
    const sections = await InspectionRepository.getSections(
      templateId,
      inspectionId ?? undefined
    );
    const activeSections = sections.filter((section) => section.IsActive === 1);

    const deviceTypes =
      await DeviceFieldDefinitionsRepository.getDeviceTypes(templateId);

    // A section is a device section when its key matches the convention used
    // by SectionRenderer (device type slug + "_information").
    const deviceTypeBySectionKey = new Map<string, string>();
    for (const deviceType of deviceTypes) {
      const sectionKey = `${slugifyDeviceType(deviceType)}${DEVICE_SECTION_SUFFIX}`;
      if (
        activeSections.some((section) => section.SectionKey === sectionKey)
      ) {
        deviceTypeBySectionKey.set(sectionKey, deviceType);
      }
    }

    const fieldsBySection = new Map<number, InspectionField[]>();
    for (const section of activeSections) {
      fieldsBySection.set(
        section.SectionID,
        await InspectionRepository.getFieldsBySection(section.SectionID)
      );
    }

    const values =
      inspectionId == null
        ? {}
        : await InspectionRepository.getInspectionValues(inspectionId);

    const sessionActive =
      inspectionId != null && InspectionEditSessionState.isActive(inspectionId);
    const stagedValues = sessionActive
      ? InspectionEditSessionState.getStagedFieldValues()
      : undefined;
    const stagedDeviceRecords = sessionActive
      ? InspectionEditSessionState.getStagedDeviceRecords()
      : undefined;

    // Editing an existing inspection: staged values are authoritative.
    // The live overlay (values currently on screen) outranks everything —
    // it reflects what the inspector sees before any debounced save lands.
    const liveValues = InspectionLiveValues.getLiveFieldValues();
    const effectiveFieldValue = (field: InspectionField): string => {
      const live = liveValues?.get(field.FieldID);
      if (live !== undefined) return live;
      const staged = stagedValues?.get(field.FieldID);
      if (staged !== undefined) return staged;
      return values[field.FieldKey] ?? "";
    };

    const dbRecords =
      inspectionId == null
        ? []
        : await DeviceRecordsRepository.getByInspectionAll(inspectionId);
    const recordsByType = new Map<string, Map<number, DeviceRecord>>();
    for (const record of dbRecords) {
      let byNo = recordsByType.get(record.DeviceType);
      if (!byNo) {
        byNo = new Map();
        recordsByType.set(record.DeviceType, byNo);
      }
      byNo.set(record.DeviceNo, record);
    }
    if (stagedDeviceRecords) {
      for (const record of stagedDeviceRecords) {
        let byNo = recordsByType.get(record.DeviceType);
        if (!byNo) {
          byNo = new Map();
          recordsByType.set(record.DeviceType, byNo);
        }
        byNo.set(record.DeviceNo, record);
      }
    }
    for (const record of DeviceRecordsRepository.getPendingDeviceRecords()) {
      let byNo = recordsByType.get(record.DeviceType);
      if (!byNo) {
        byNo = new Map();
        recordsByType.set(record.DeviceType, byNo);
      }
      byNo.set(record.DeviceNo, record);
    }

    const visibleDefsByDeviceType = new Map<string, DeviceFieldDefinition[]>();
    for (const deviceType of deviceTypes) {
      const defs = (
        await DeviceFieldDefinitionsRepository.getByDeviceType(
          deviceType,
          templateId
        )
      ).filter((def) => def.IsActive !== 0 && def.IsVisible !== 0);
      visibleDefsByDeviceType.set(deviceType, defs);
    }

    const unitsByGroup = new Map<ProgressGroupKey, { completed: number; total: number }>();
    const isDefault = (section: InspectionSection): boolean =>
      section.IsDefault === 1;

    const sectionEntries: InspectionSectionProgress[] = [];

    for (const section of activeSections) {
      const sectionKey = section.SectionKey ?? "";
      if (sectionKey === PHOTOS_SECTION_KEY) continue;

      const deviceType = deviceTypeBySectionKey.get(sectionKey);
      if (deviceType) {
        const deviceUnits = this.computeDeviceUnits(
          deviceType,
          section,
          fieldsBySection.get(section.SectionID) ?? [],
          effectiveFieldValue,
          values,
          recordsByType.get(deviceType),
          visibleDefsByDeviceType.get(deviceType) ?? []
        );
        this.addUnits(
          unitsByGroup,
          isDefault(section) ? "default_devices" : "custom_devices",
          deviceUnits.completed,
          deviceUnits.total
        );
        if (deviceUnits.total > 0) {
          sectionEntries.push(
            this.toSectionProgress(
              sectionKey,
              deviceType,
              deviceUnits.completed,
              deviceUnits.total,
              deviceUnits.devices
            )
          );
        }
        continue;
      }

      const groupKey =
        sectionKey === GENERAL_INFO_SECTION_KEY
          ? "general_information"
          : isDefault(section)
            ? "default_sections"
            : "custom_sections";

      const progressFields = (
        fieldsBySection.get(section.SectionID) ?? []
      ).filter((field) => !EXCLUDED_FIELD_KEYS.has(field.FieldKey));
      const completed = progressFields.filter(
        (field) => !isFieldValueEmpty(field.FieldType, effectiveFieldValue(field))
      ).length;
      this.addUnits(unitsByGroup, groupKey, completed, progressFields.length);
      if (progressFields.length > 0) {
        sectionEntries.push(
          this.toSectionProgress(
            sectionKey,
            section.SectionName,
            completed,
            progressFields.length
          )
        );
      }
    }

    const groups: ProgressGroup[] = GROUP_KEYS.map((key) => {
      const units = unitsByGroup.get(key) ?? { completed: 0, total: 0 };
      return {
        key,
        label: GROUP_LABELS[key],
        completed: units.completed,
        total: units.total,
        remaining: Math.max(0, units.total - units.completed),
        percentage: percentage(units.completed, units.total),
      };
    });

    const totalUnits = groups.reduce((sum, group) => sum + group.total, 0);
    const completedUnits = groups.reduce(
      (sum, group) => sum + group.completed,
      0
    );

    return {
      completed: completedUnits,
      total: totalUnits,
      remaining: Math.max(0, totalUnits - completedUnits),
      percentage: percentage(completedUnits, totalUnits),
      groups,
      sections: sectionEntries,
    };
  }

  private static toSectionProgress(
    key: string,
    label: string,
    completed: number,
    total: number,
    devices?: DeviceProgress[]
  ): InspectionSectionProgress {
    return {
      key,
      label,
      completed,
      total,
      remaining: Math.max(0, total - completed),
      percentage: percentage(completed, total),
      devices,
    };
  }

  private static addUnits(
    unitsByGroup: Map<ProgressGroupKey, { completed: number; total: number }>,
    key: ProgressGroupKey,
    completed: number,
    total: number
  ): void {
    const units = unitsByGroup.get(key) ?? { completed: 0, total: 0 };
    units.completed += completed;
    units.total += total;
    unitsByGroup.set(key, units);
  }

  private static computeDeviceUnits(
    deviceType: string,
    section: InspectionSection,
    sectionFields: InspectionField[],
    effectiveFieldValue: (field: InspectionField) => string,
    values: Record<string, string>,
    recordsByNo: Map<number, DeviceRecord> | undefined,
    visibleDefs: DeviceFieldDefinition[]
  ): { completed: number; total: number; devices: DeviceProgress[] } {
    const countFieldKey = `${slugifyDeviceType(deviceType)}${COUNT_FIELD_SUFFIX}`;
    const countField = sectionFields.find(
      (field) => field.FieldKey === countFieldKey
    );
    const countValue = countField
      ? effectiveFieldValue(countField)
      : (values[countFieldKey] ?? "");
    const deviceCount = Math.max(0, Number(countValue) || 0);
    if (deviceCount <= 0) return { completed: 0, total: 0, devices: [] };

    const fieldsPerDevice = visibleDefs.length;
    if (fieldsPerDevice <= 0) return { completed: 0, total: 0, devices: [] };

    const total = deviceCount * fieldsPerDevice;
    const byNo = recordsByNo ?? new Map<number, DeviceRecord>();
    let fieldCompleted = 0;
    const devices: DeviceProgress[] = [];

    for (let no = 1; no <= deviceCount; no++) {
      const data = deviceDataOf(byNo.get(no));
      const completed = visibleDefs.filter(
        (def) => !isFieldValueEmpty(def.FieldType, data[def.FieldName] ?? "")
      ).length;
      fieldCompleted += completed;
      devices.push({
        deviceNo: no,
        completed,
        total: fieldsPerDevice,
        remaining: Math.max(0, fieldsPerDevice - completed),
        percentage: percentage(completed, fieldsPerDevice),
      });
    }

    return { completed: Math.min(fieldCompleted, total), total, devices };
  }
}