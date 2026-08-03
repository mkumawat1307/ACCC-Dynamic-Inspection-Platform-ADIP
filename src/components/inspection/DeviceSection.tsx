import React, { useEffect, useState, useRef } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Card, Text, TextInput } from "react-native-paper";
import { Dropdown } from "react-native-element-dropdown";
import DeviceFieldDefinitionsRepository, {
  DeviceFieldDefinition,
} from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import DeviceRecordsRepository, {
  DeviceRecord,
} from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";

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
  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fieldDefs = await DeviceFieldDefinitionsRepository.getByDeviceType(deviceType, templateId);
      setFields(fieldDefs);

      const dropdownFields = fieldDefs.filter((f) => f.FieldType === "dropdown");
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
    setRecords((prev) => {
      if (prev.length === count) return prev;
      if (prev.length > count) return prev.slice(0, count);
      const next = [...prev];
      const emptyData: Record<string, string | null> = {};
      fields.forEach((f) => { emptyData[f.FieldName] = null; });
      for (let i = prev.length + 1; i <= count; i++) {
        next.push({
          InspectionID: inspectionId,
          DeviceType: deviceType,
          DeviceNo: i,
          DeviceData: JSON.stringify(emptyData),
          DisplayOrder: i,
          IsActive: 1,
        });
      }
      return next;
    });
  }, [count, loading]);

  useEffect(() => {
    return () => {
      saveTimers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  function getData(record: DeviceRecord): Record<string, string | null> {
    if (!record.DeviceData) return {};
    try {
      return JSON.parse(record.DeviceData);
    } catch {
      return {};
    }
  }

  function debouncedSave(record: DeviceRecord) {
    const key = record.RecordID ?? -record.DeviceNo;
    const timer = saveTimers.current.get(key);
    if (timer) clearTimeout(timer);

    saveTimers.current.set(
      key,
      setTimeout(async () => {
        const newId = await DeviceRecordsRepository.save(record);
        if (newId && !record.RecordID) {
          setRecords((prev) =>
            prev.map((r) =>
              r.DeviceNo === record.DeviceNo && !r.RecordID
                ? { ...r, RecordID: newId }
                : r
            )
          );
        }
        saveTimers.current.delete(key);
      }, 500)
    );
  }

  function updateField(index: number, fieldName: string, value: string | null) {
    setRecords((prev) => {
      const updated = [...prev];
      const record = { ...updated[index] };
      const data = getData(record);
      data[fieldName] = value;
      record.DeviceData = JSON.stringify(data);
      updated[index] = record;
      debouncedSave(record);
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

    const input = field.FieldType === "dropdown" ? (
      <View key={field.FieldDefID} style={styles.fieldHalf}>
        <Text style={styles.fieldLabel}>{field.Label}{field.IsRequired ? " *" : ""}</Text>
        <Dropdown
          style={styles.dropdown}
          placeholderStyle={styles.placeholder}
          selectedTextStyle={styles.selectedText}
          data={opts[field.FieldName] ?? []}
          labelField="label"
          valueField="value"
          placeholder={`Select ${field.Label}`}
          value={value}
          disable={locked}
          onChange={(item) => updateField(index, field.FieldName, item.value)}
        />
      </View>
    ) : (
      <View key={field.FieldDefID} style={styles.fieldHalf}>
        <TextInput
          mode="outlined"
          label={field.Label + (field.IsRequired ? " *" : "")}
          value={value ?? ""}
          onChangeText={(text) => updateField(index, field.FieldName, text || null)}
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
        <Card key={record.RecordID ?? `new-${record.DeviceNo}`} style={styles.card}>
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
