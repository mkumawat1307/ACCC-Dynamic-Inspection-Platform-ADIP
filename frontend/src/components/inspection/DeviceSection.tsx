import React, { useEffect, useState, useRef } from "react";
import { Alert, Keyboard, Pressable, StyleSheet, View } from "react-native";
import { Card, Checkbox, Text, TextInput } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DeviceFieldDefinitionsRepository, {
  DeviceFieldDefinition,
} from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import { DeviceRecordsRepository, DeviceRecord } from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";
import type { DeviceProgress } from "@/src/database/repositories/InspectionProgressService";
import { sanitizeNumberInput } from "@/src/utils/fieldInput";
import { useInspectionScroll } from "@/src/context/InspectionScrollContext";
import { getActiveProjectPath } from "@/src/database/db";
import { logger } from "@/src/utils/logger";
import { TOUCH_TARGETS } from "@/src/utils/touchTargets";
import { COLORS } from "@/src/constants/ui";
import DropdownField from "./DropdownField";
import { fieldLabelWithRequired } from "./renderFieldInput";

interface Props {
  inspectionId: number;
  deviceType: string;
  count: number;
  templateId?: number;
  locked?: boolean;
  existing?: boolean;
  onDataChanged?: () => void;
  deviceProgress?: DeviceProgress[];
  resetStamp?: number;
}

function deviceDbStillValid(expectedDbPath?: string | null): boolean {
  const activeDbPath = getActiveProjectPath();
  if (activeDbPath === null || activeDbPath !== expectedDbPath) {
    logger.warn("[DeviceSection] Project DB changed; skipping device record write", {
      active: activeDbPath,
      expected: expectedDbPath,
    });
    return false;
  }
  return true;
}

interface DropdownItem {
  label: string;
  value: string;
  isDefault?: number;
  IsActive?: number;
}

export default function DeviceSection({ inspectionId, deviceType, count, templateId, locked = false, existing = false, onDataChanged, deviceProgress, resetStamp = 0 }: Props) {
  const [fields, setFields] = useState<DeviceFieldDefinition[]>([]);
  const [deletedDefs, setDeletedDefs] = useState<DeviceFieldDefinition[]>([]);
  const [records, setRecords] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [opts, setOpts] = useState<Record<string, DropdownItem[]>>({});
  const [collapsedNos, setCollapsedNos] = useState<number[]>([]);
  const persistedIds = useRef<Map<number, number>>(new Map());
  const countRef = useRef(count);
  countRef.current = count;
  const prevCountRef = useRef(count);
  const countEditedRef = useRef(false);
  const countOpsRef = useRef(Promise.resolve());
  const everSeenNos = useRef<Set<number>>(new Set());
  const fullyResetRef = useRef(false);
  const dropdownRefs = useRef<Record<string, View | null>>({});
  const textInputRefs = useRef<Record<string, View | null>>({});
  const { setDropdownOpen, scrollFocusedFieldIntoView } = useInspectionScroll();

  useEffect(() => {
    (async () => {
      const expectedDbPath = getActiveProjectPath();
      setLoading(true);
      persistedIds.current = new Map();
      const fieldDefs = await DeviceFieldDefinitionsRepository.getByDeviceType(deviceType, templateId, existing);
      const visibleFieldDefs = fieldDefs.filter((f) => f.IsActive !== 0 && f.IsVisible !== 0);
      setFields(visibleFieldDefs);
      setDeletedDefs(fieldDefs.filter((f) => f.IsActive === 0));

      const existingRecords = await DeviceRecordsRepository.getByInspection(inspectionId, deviceType);
      let list = existingRecords.length > 0 ? existingRecords : [];
      if (resetStamp === 0) {
        for (const rec of list) everSeenNos.current.add(rec.DeviceNo);
      }

      const savedValuesByField = new Map<string, Set<string>>();
      for (const rec of list) {
        let data: Record<string, string | null> = {};
        try {
          data = typeof rec.DeviceData === "string" ? JSON.parse(rec.DeviceData) : (rec.DeviceData || {});
        } catch {
          data = {};
        }
        for (const f of visibleFieldDefs) {
          if (f.FieldType !== "dropdown") continue;
          const v = data[f.FieldName];
          if (v == null || v === "") continue;
          let set = savedValuesByField.get(f.FieldName);
          if (!set) {
            set = new Set();
            savedValuesByField.set(f.FieldName, set);
          }
          set.add(v);
        }
      }

      const dropdownFields = visibleFieldDefs.filter((f) => f.FieldType === "dropdown");
      const deletedDropdownFields = fieldDefs.filter((f) => f.IsActive === 0 && f.FieldType === "dropdown");
      const loaded: Record<string, DropdownItem[]> = {};
      for (const f of dropdownFields) {
        let dbOpts = existing
          ? await DeviceOptionsRepository.getDropdownData(deviceType, f.FieldName, templateId, true)
          : await DeviceOptionsRepository.getDropdownData(deviceType, f.FieldName, templateId);
        if (existing) {
          dbOpts = dbOpts.filter((o) => o.IsActive !== 0 || savedValuesByField.get(f.FieldName)?.has(o.value));
        }
        loaded[f.FieldName] = dbOpts;
      }
      for (const f of deletedDropdownFields) {
        const dbOpts = await DeviceOptionsRepository.getDropdownData(deviceType, f.FieldName, templateId, true);
        loaded[f.FieldName] = dbOpts;
      }
      setOpts(loaded);

      // Editing an existing inspection: a dropdown that has no saved value
      // renders empty. The current IsDefault option is never shown, staged, or
      // written when opening an existing inspection, so the database stays
      // untouched until the user explicitly edits a value.

      if (!existing && list.length < count) {
        if (!deviceDbStillValid(expectedDbPath)) return;
        for (let i = list.length + 1; i <= count; i++) {
          const emptyData: Record<string, string | null> = {};
          fieldDefs.forEach((f) => {
            if (f.FieldType === "dropdown") {
              const fieldOpts = loaded[f.FieldName];
              const defaultOpt = fieldOpts?.find((o) => o.isDefault === 1);
              emptyData[f.FieldName] = defaultOpt?.value ?? null;
            } else {
              emptyData[f.FieldName] = null;
            }
          });
          const newRec: DeviceRecord = {
            InspectionID: inspectionId,
            DeviceType: deviceType,
            DeviceNo: i,
            DeviceData: JSON.stringify(emptyData),
            DisplayOrder: i,
            IsActive: 1,
          };
          const newId = await DeviceRecordsRepository.save(newRec);
          newRec.RecordID = newId;
          persistedIds.current.set(i, newId);
          list.push(newRec);
        }
      }

      setRecords(list);
      setLoading(false);
    })();
  }, [inspectionId, deviceType, templateId, existing]);

  function toggleDevice(deviceNo: number): void {
    setCollapsedNos((prev) =>
      prev.includes(deviceNo)
        ? prev.filter((no) => no !== deviceNo)
        : [...prev, deviceNo]
    );
  }

  useEffect(() => {
    if (loading) return;

    if (records.length > 0 && count === 0) {
      // Full teardown: when the count is edited to 0, every device instance is
      // removed. Clear the ever-seen marker so the next grow creates a brand
      // new set (device 1 expanded, the rest collapsed) instead of re-using
      // stale expansion state from the previous instance set.
      everSeenNos.current = new Set();
      fullyResetRef.current = true;
      setCollapsedNos([]);
    }

    if (count !== prevCountRef.current) {
      countEditedRef.current = true;
    }
    prevCountRef.current = count;

    // Editing an existing inspection: opening it must not write device records.
    // Until the user actually changes the count, reconcile only the rendered
    // list; database reconciliation (create/deactivate/restore) happens on an
    // explicit edit, which is staged by the edit session.
    if (existing && !countEditedRef.current) {
      setRecords((prev) => (prev.length > count ? prev.slice(0, count) : prev));
      return;
    }

    if (count < records.length) {
      for (const no of persistedIds.current.keys()) {
        if (no > count) persistedIds.current.delete(no);
      }
      setRecords((prev) => (prev.length > count ? prev.slice(0, count) : prev));

      countOpsRef.current = countOpsRef.current.then(async () => {
        const expectedDbPath = getActiveProjectPath();
        if (!deviceDbStillValid(expectedDbPath)) return;
        await DeviceRecordsRepository.flushPendingDeviceSaves();
        if (!deviceDbStillValid(expectedDbPath)) return;
        await DeviceRecordsRepository.deactivateBeyond(inspectionId, deviceType, count);
      }).then(() => {
        onDataChanged?.();
      });

      return;
    }

    if (count > records.length) {
      const growCount = count;
      const wasFullReset = fullyResetRef.current;
      fullyResetRef.current = false;
      countOpsRef.current = countOpsRef.current.then(async () => {
        const expectedDbPath = getActiveProjectPath();
        if (!deviceDbStillValid(expectedDbPath)) return undefined;
        await DeviceRecordsRepository.flushPendingDeviceSaves();
        if (!deviceDbStillValid(expectedDbPath)) return undefined;
        const restored = await DeviceRecordsRepository.restorePendingDeactivatedRecords(
          inspectionId, deviceType, growCount,
        );
        if (!wasFullReset) {
          for (const r of restored) everSeenNos.current.add(r.DeviceNo);
        }
        return restored;
      }).then(async (restored) => {
        const expectedDbPath = getActiveProjectPath();
        if (!deviceDbStillValid(expectedDbPath) || !restored) return;
        const target = countRef.current;
        if (target < growCount && restored.length > 0) {
          if (!deviceDbStillValid(expectedDbPath)) return;
          await DeviceRecordsRepository.deactivateBeyond(inspectionId, deviceType, target);
        }
        const kept = restored.filter((r) => r.DeviceNo <= target);
        for (const r of kept) {
          if (r.RecordID) persistedIds.current.set(r.DeviceNo, r.RecordID);
        }

        const activeRecords = await DeviceRecordsRepository.getByInspection(inspectionId, deviceType);
        if (!deviceDbStillValid(expectedDbPath)) return;
        const activeNos = new Set(activeRecords.map((r) => r.DeviceNo));
        for (const r of activeRecords) {
          if (r.RecordID) persistedIds.current.set(r.DeviceNo, r.RecordID);
          if (!wasFullReset) everSeenNos.current.add(r.DeviceNo);
        }

        const emptyData: Record<string, string | null> = {};
        fields.forEach((f) => {
          if (f.FieldType === "dropdown") {
            const fieldOpts = opts[f.FieldName];
            const defaultOpt = fieldOpts?.find((o) => o.isDefault === 1);
            emptyData[f.FieldName] = defaultOpt?.value ?? null;
          } else {
            emptyData[f.FieldName] = null;
          }
        });

        const persistedByNo = new Map<number, DeviceRecord>();
        for (let i = 1; i <= target; i++) {
          if (!activeNos.has(i)) {
            const newRec: DeviceRecord = {
              InspectionID: inspectionId,
              DeviceType: deviceType,
              DeviceNo: i,
              DeviceData: JSON.stringify(emptyData),
              DisplayOrder: i,
              IsActive: 1,
            };
            if (!deviceDbStillValid(expectedDbPath)) return;
            const newId = await DeviceRecordsRepository.save(newRec);
            newRec.RecordID = newId;
            persistedIds.current.set(i, newId);
            persistedByNo.set(i, newRec);
          }
        }

        const restoredByNo = new Map(kept.map((r) => [r.DeviceNo, r]));
        setRecords((prev) => {
          if (prev.length >= target) return prev;
          const next = [...prev];
          for (let i = next.length + 1; i <= target; i++) {
            const existing = restoredByNo.get(i) ?? persistedByNo.get(i);
            if (existing) {
              next.push({ ...existing, IsActive: 1 });
            }
          }
          return next;
        });
      }).then(() => {
        onDataChanged?.();
      });
      return;
    }

  }, [count, loading, records.length, fields, inspectionId, deviceType, existing, onDataChanged]);

  // Newly created device instances default to collapsed so only the first
  // device stays open. A device number is treated as new only the first time
  // it is seen; restored/deactivated devices and existing loaded records keep
  // their current expansion state through count edits.
  useEffect(() => {
    const currentNos = records.map((r) => r.DeviceNo);
    const newNos = currentNos.filter((no) => !everSeenNos.current.has(no));
    for (const no of newNos) everSeenNos.current.add(no);
    if (newNos.length === 0) return;

    setCollapsedNos((prev) => {
      const collapsed = new Set(prev);
      let changed = false;
      for (const no of newNos) {
        if (no !== 1 && !collapsed.has(no)) {
          collapsed.add(no);
          changed = true;
        }
      }
      return changed ? [...collapsed] : prev;
    });
  }, [records]);

  useEffect(() => {
    return () => {
      DeviceRecordsRepository.cancelPendingSaves(deviceType);
    };
  }, [deviceType]);

  function getData(record: DeviceRecord): Record<string, string | null> {
    if (!record.DeviceData) return {};
    try {
      return JSON.parse(record.DeviceData);
    } catch {
      return {};
    }
  }

  function updateField(index: number, fieldName: string, value: string): void {
    setRecords((prev) => {
      const updated = [...prev];
      const current = updated[index];
      const record = {
        ...current,
        RecordID: current.RecordID ?? persistedIds.current.get(current.DeviceNo),
      };
      const data = getData(record);
      data[fieldName] = value;
      record.DeviceData = JSON.stringify(data);
      updated[index] = record;
      DeviceRecordsRepository.scheduleDeviceRecordSave(record, 500, (newId) => {
        persistedIds.current.set(record.DeviceNo, newId);
        setRecords((state) => {
          const next = [...state];
          const target = next[index];
          if (!target) return state;
          next[index] = { ...target, RecordID: newId };
          return next;
        });
      });
      onDataChanged?.();
      return updated;
    });
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading {deviceType.toLowerCase()}s...</Text>
      </View>
    );
  }

  const getDeviceLabel = (record: DeviceRecord) => {
    return `${deviceType} ${record.DeviceNo}`;
  };

  const hasHistoricalValue = (field: DeviceFieldDefinition, record: DeviceRecord): boolean => {
    const v = getData(record)[field.FieldName];
    return v != null && v !== "";
  };

  const renderField = (field: DeviceFieldDefinition, index: number, record: DeviceRecord) => {
    const data = getData(record);
    const value = data[field.FieldName] ?? null;
    const fieldLabel = field.IsActive === 0 ? `Deleted ${field.Label}` : field.Label;

    const isNumber = field.FieldType === "number";
    const isCheckbox = field.FieldType === "checkbox";
    const isMultiline = field.FieldType === "multiline";
    const dropdownKey = `dev-${record.DeviceNo}-${field.FieldDefID}`;
    const input = field.FieldType === "dropdown" ? (
      <View
        key={field.FieldDefID}
        style={styles.fieldHalf}
        ref={(node) => {
          dropdownRefs.current[dropdownKey] = node;
        }}
      >
        <Text style={styles.fieldLabel}>{fieldLabelWithRequired(fieldLabel, field.IsRequired === 1)}</Text>
        <DropdownField
          value={value}
          options={opts[field.FieldName] ?? []}
          editable={!locked}
          placeholder={field.Placeholder ?? `Select ${field.Label}`}
          style={styles.dropdown}
          placeholderStyle={styles.placeholder}
          selectedTextStyle={styles.selectedText}
          onFocus={() => {
            Keyboard.dismiss();
            setDropdownOpen(true);
            const container = dropdownRefs.current[dropdownKey];
            if (typeof scrollFocusedFieldIntoView === "function" && container) {
              scrollFocusedFieldIntoView({ current: container });
            }
          }}
          onChange={(dropdownValue) => {
            setDropdownOpen(false);
            updateField(index, field.FieldName, dropdownValue);
          }}
          onBlur={() => { setDropdownOpen(false); }}
        />
      </View>
    ) : isCheckbox ? (
      <View key={field.FieldDefID} style={styles.fieldHalf}>
        <Pressable
          disabled={locked}
          onPress={() => updateField(index, field.FieldName, value === "1" ? "0" : "1")}
          hitSlop={TOUCH_TARGETS.compactHitSlop}
        >
          <View style={styles.checkboxRow}>
            <Checkbox status={value === "1" ? "checked" : "unchecked"} disabled={locked} />
            <Text style={styles.fieldLabel}>{fieldLabelWithRequired(fieldLabel, field.IsRequired === 1)}</Text>
          </View>
        </Pressable>
      </View>
    ) : (
      <View
        key={field.FieldDefID}
        style={styles.fieldHalf}
        ref={(node) => {
          textInputRefs.current[dropdownKey] = node;
        }}
      >
        <TextInput
          mode="outlined"
          label={fieldLabelWithRequired(fieldLabel, field.IsRequired === 1) as string}
          value={value ?? ""}
          placeholder={field.Placeholder ?? undefined}
          keyboardType={isNumber ? "decimal-pad" : undefined}
          multiline={isMultiline}
          numberOfLines={isMultiline ? 3 : undefined}
          onChangeText={(text) =>
            updateField(
              index,
              field.FieldName,
              isNumber ? sanitizeNumberInput(text) || "" : text || ""
            )
          }
          style={styles.input}
          dense
          editable={!locked}
          onFocus={() => {
            const container = textInputRefs.current[dropdownKey];
            if (typeof scrollFocusedFieldIntoView === "function" && container) {
              scrollFocusedFieldIntoView({ current: container });
            }
          }}
        />
      </View>
    );

    if (!locked) return input;

    return (
      <Pressable
        key={field.FieldDefID}
        onPress={() =>
          Alert.alert(
            "Pole ID Required",
            "Please enter Pole ID first before filling the inspection details."
          )
        }
      >
        <View pointerEvents="none">{input}</View>
      </Pressable>
    );
  };

  const halfFieldsFor = (record: DeviceRecord): DeviceFieldDefinition[][] => {
    const recordFields = existing
      ? [...fields, ...deletedDefs.filter((d) => hasHistoricalValue(d, record))]
          .sort((a, b) => a.DisplayOrder - b.DisplayOrder)
      : fields;
    const pairs: DeviceFieldDefinition[][] = [];
    for (let i = 0; i < recordFields.length; i += 2) {
      pairs.push(recordFields.slice(i, i + 2));
    }
    return pairs;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.headerTitle}>
          {deviceType} Details ({count})
        </Text>
      </View>

      {records.map((record, index) => {
        const expanded = !collapsedNos.includes(record.DeviceNo);
        const devProgress = deviceProgress?.find((d) => d.deviceNo === record.DeviceNo);
        const showProgress = !!devProgress && devProgress.total > 0;
        const complete = showProgress && devProgress.remaining === 0;
        return (
          <Card key={`dev-${record.DeviceNo}`} style={styles.card}>
            <Pressable
              testID={`dev-toggle-${record.DeviceNo}`}
              accessibilityRole="button"
              accessibilityLabel={`${deviceType} ${record.DeviceNo}`}
              onPress={() => toggleDevice(record.DeviceNo)}
              hitSlop={TOUCH_TARGETS.compactHitSlop}
              style={styles.deviceHeader}
            >
              <Text style={styles.cardTitle}>{getDeviceLabel(record)}</Text>
              <View style={styles.deviceHeaderRight}>
                {showProgress && (
                  <View style={styles.progressBlock}>
                    <Text style={styles.deviceProgressText} numberOfLines={1}>
                      {devProgress.completed} / {devProgress.total} completed
                    </Text>
                    <Text style={styles.deviceRemainingText} numberOfLines={1}>
                      {devProgress.remaining} remaining
                    </Text>
                  </View>
                )}
                {complete && (
                  <View style={styles.iconSlot}>
                    <MaterialCommunityIcons
                      name="check"
                      size={20}
                      color={COLORS.summaryToday}
                    />
                  </View>
                )}
                <View style={styles.iconSlot}>
                  <MaterialCommunityIcons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={COLORS.textMuted}
                  />
                </View>
              </View>
            </Pressable>
            {expanded && (
              <Card.Content>
                {halfFieldsFor(record).map((pair, pairIdx) => (
                  <View key={pairIdx} style={styles.row}>
                    {pair.map((field) => renderField(field, index, record))}
                  </View>
                ))}
              </Card.Content>
            )}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  headerTitle: { fontWeight: "700", color: "#1976D2" },
  loading: { paddingVertical: 20, alignItems: "center" },
  card: { marginBottom: 12, borderRadius: 10, backgroundColor: "#F8F9FA" },
  cardTitle: { fontWeight: "700" },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  deviceHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBlock: {
    alignItems: "flex-start",
  },
  deviceProgressText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  deviceRemainingText: {
    fontSize: 11,
    color: "#999",
    marginTop: 1,
  },
  iconSlot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: { fontSize: 13, fontWeight: "500", color: "#444", marginBottom: 4 },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  fieldHalf: { flex: 1 },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    paddingHorizontal: 8,
    marginBottom: 8,
    minHeight: 56,
  },
  input: { marginBottom: 4, backgroundColor: "#FFFFFF" },
  dropdown: {
    height: 56,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  placeholder: { fontSize: 14, color: "#999999" },
  selectedText: { fontSize: 14, color: "#000000" },
});
