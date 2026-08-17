import React, { useEffect, useState, useRef } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Card, Checkbox, Text, TextInput } from "react-native-paper";
import { Dropdown, IDropdownRef } from "react-native-element-dropdown";
import DeviceFieldDefinitionsRepository, {
  DeviceFieldDefinition,
} from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import { DeviceRecordsRepository, DeviceRecord } from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";
import { sanitizeNumberInput } from "@/src/utils/fieldInput";
import { useInspectionScroll } from "@/src/context/InspectionScrollContext";
import { autoScrollDropdown } from "./renderFieldInput";
import { cancelPendingOpen } from "./dropdownScrollGate";

interface Props {
  inspectionId: number;
  deviceType: string;
  count: number;
  templateId?: number;
  locked?: boolean;
}

interface DropdownItem {
  label: string;
  value: string;
}

export default function DeviceSection({ inspectionId, deviceType, count, templateId, locked = false }: Props) {
  const [fields, setFields] = useState<DeviceFieldDefinition[]>([]);
  const [records, setRecords] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [opts, setOpts] = useState<Record<string, DropdownItem[]>>({});
  const persistedIds = useRef<Map<number, number>>(new Map());
  const countRef = useRef(count);
  countRef.current = count;
  const countOpsRef = useRef(Promise.resolve());
  const dropdownRefs = useRef<Record<string, View | null>>({});
  const dropdownOpenRefs = useRef<Record<string, IDropdownRef | null>>({});
  const { scrollViewRef, scrollOffsetRef } = useInspectionScroll();

  useEffect(() => {
    (async () => {
      setLoading(true);
      persistedIds.current = new Map();
      const fieldDefs = await DeviceFieldDefinitionsRepository.getByDeviceType(deviceType, templateId);
      const visibleFieldDefs = fieldDefs.filter((f) => f.IsVisible !== 0);
      setFields(visibleFieldDefs);

      const dropdownFields = visibleFieldDefs.filter((f) => f.FieldType === "dropdown");
      const loaded: Record<string, DropdownItem[]> = {};
      for (const f of dropdownFields) {
        const dbOpts = await DeviceOptionsRepository.getDropdownData(deviceType, f.FieldName, templateId);
        loaded[f.FieldName] = dbOpts;
      }
      setOpts(loaded);

      const existing = await DeviceRecordsRepository.getByInspection(inspectionId, deviceType);
      let list = existing.length > 0 ? existing : [];

      if (list.length < count) {
        for (let i = list.length + 1; i <= count; i++) {
          const emptyData: Record<string, string | null> = {};
          fieldDefs.forEach((f) => { emptyData[f.FieldName] = null; });
          list.push({
            InspectionID: inspectionId,
            DeviceType: deviceType,
            DeviceNo: i,
            DeviceData: JSON.stringify(emptyData),
            DisplayOrder: i,
            IsActive: 1,
          });
        }
      }

      setRecords(list);
      setLoading(false);
    })();
  }, [inspectionId, deviceType, templateId]);

  useEffect(() => {
    if (loading) return;

    if (count < records.length) {
      for (const no of persistedIds.current.keys()) {
        if (no > count) persistedIds.current.delete(no);
      }
      setRecords((prev) => (prev.length > count ? prev.slice(0, count) : prev));

      countOpsRef.current = countOpsRef.current.then(async () => {
        await DeviceRecordsRepository.flushPendingDeviceSaves();
        await DeviceRecordsRepository.deactivateBeyond(inspectionId, deviceType, count);
      });

      return;
    }

    if (count > records.length) {
      const growCount = count;
      countOpsRef.current = countOpsRef.current.then(async () => {
        await DeviceRecordsRepository.flushPendingDeviceSaves();
        const restored = await DeviceRecordsRepository.restorePendingDeactivatedRecords(
          inspectionId, deviceType, growCount,
        );
        return restored;
      }).then((restored) => {
        const target = countRef.current;
        if (target < growCount && restored.length > 0) {
          DeviceRecordsRepository.deactivateBeyond(inspectionId, deviceType, target);
        }
        const kept = restored.filter((r) => r.DeviceNo <= target);
        for (const r of kept) {
          if (r.RecordID) persistedIds.current.set(r.DeviceNo, r.RecordID);
        }
        setRecords((prev) => {
          if (prev.length >= target) return prev;
          const next = [...prev];
          const emptyData: Record<string, string | null> = {};
          fields.forEach((f) => { emptyData[f.FieldName] = null; });
          const restoredByNo = new Map(kept.map((r) => [r.DeviceNo, r]));
          for (let i = next.length + 1; i <= target; i++) {
            const existing = restoredByNo.get(i);
            if (existing) {
              next.push({ ...existing, IsActive: 1 });
            } else {
              next.push({
                InspectionID: inspectionId,
                DeviceType: deviceType,
                DeviceNo: i,
                DeviceData: JSON.stringify(emptyData),
                DisplayOrder: i,
                IsActive: 1,
              });
            }
          }
          return next;
        });
      });
      return;
    }

  }, [count, loading, records.length, fields, inspectionId, deviceType]);

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

  const renderField = (field: DeviceFieldDefinition, index: number, record: DeviceRecord) => {
    const data = getData(record);
    const value = data[field.FieldName] ?? null;

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
        <Text style={styles.fieldLabel}>{field.Label}{field.IsRequired ? " *" : ""}</Text>
        <Dropdown
          ref={(node) => {
            dropdownOpenRefs.current[dropdownKey] = node;
          }}
          style={styles.dropdown}
          placeholderStyle={styles.placeholder}
          selectedTextStyle={styles.selectedText}
          data={opts[field.FieldName] ?? []}
          labelField="label"
          valueField="value"
          placeholder={field.Placeholder ?? `Select ${field.Label}`}
          value={value}
          disable={locked}
          onFocus={() =>
            autoScrollDropdown(
              { current: dropdownRefs.current[dropdownKey] ?? null },
              { current: dropdownOpenRefs.current[dropdownKey] ?? null },
              scrollViewRef,
              scrollOffsetRef.current
            )
          }
          onChange={(item) => updateField(index, field.FieldName, item.value)}
          onBlur={() => cancelPendingOpen()}
        />
      </View>
    ) : isCheckbox ? (
      <View key={field.FieldDefID} style={styles.fieldHalf}>
        <Pressable
          disabled={locked}
          onPress={() => updateField(index, field.FieldName, value === "1" ? "0" : "1")}
        >
          <View style={styles.checkboxRow}>
            <Checkbox status={value === "1" ? "checked" : "unchecked"} disabled={locked} />
            <Text style={styles.fieldLabel}>{field.Label}{field.IsRequired ? " *" : ""}</Text>
          </View>
        </Pressable>
      </View>
    ) : (
      <View key={field.FieldDefID} style={styles.fieldHalf}>
        <TextInput
          mode="outlined"
          label={field.Label + (field.IsRequired ? " *" : "")}
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

  const halfFields: DeviceFieldDefinition[][] = [];
  for (let i = 0; i < fields.length; i += 2) {
    halfFields.push(fields.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.headerTitle}>
          {deviceType} Details ({count})
        </Text>
      </View>

      {records.map((record, index) => (
        <Card key={`dev-${record.DeviceNo}`} style={styles.card}>
          <Card.Title title={getDeviceLabel(record)} titleStyle={styles.cardTitle} />
          <Card.Content>
            {halfFields.map((pair, pairIdx) => (
              <View key={pairIdx} style={styles.row}>
                {pair.map((field) => renderField(field, index, record))}
              </View>
            ))}
          </Card.Content>
        </Card>
      ))}
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
