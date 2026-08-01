import React, {
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";

import FieldRenderer from "./FieldRenderer";

import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";
import InspectionValueRepository from "@/src/database/repositories/InspectionValueRepository";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";

import {
  InspectionField,
} from "@/src/models/InspectionField";

import { useInspection } from "@/src/context/InspectionContext";
import PhotoSection from "./PhotoSection";
import DeviceSection from "./DeviceSection";

import { logger } from "@/src/utils/logger";

interface Props {
  inspectionId: number;
  sectionId: number;
  sectionKey?: string;
  templateId?: number;
}

export default function SectionRenderer({
  inspectionId,
  sectionId,
  sectionKey,
  templateId,
}: Props) {
  const { poleId: contextPoleId } = useInspection();
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<InspectionField[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [options, setOptions] = useState<Record<number, any[]>>({});
  const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({});
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [poleIdLoaded, setPoleIdLoaded] = useState(false);

  useEffect(() => {
    loadSection();
  }, [sectionId, inspectionId]);

  async function loadSection() {
    try {
      setLoading(true);

      const sectionFields =
        await InspectionFieldRepository.getFieldsBySection(sectionId);

      const valueMap: Record<number, string> = {};
      const optionMap: Record<number, any[]> = {};

      for (const field of sectionFields) {
        const saved =
          await InspectionValueRepository.getValue(
            inspectionId,
            field.FieldID
          );

        valueMap[field.FieldID] =
          saved?.FieldValue ?? field.DefaultValue ?? "";

        const type = field.FieldType.toUpperCase();
        if (type === "DROPDOWN" || type === "PROJECT_DROPDOWN") {
          const raw =
            await InspectionFieldRepository.getFieldOptions(field.FieldID);
          optionMap[field.FieldID] = raw.map((o) => ({
            label: o.OptionLabel,
            value: o.OptionValue,
          }));
        }
      }

      setFields(sectionFields);
      setValues(valueMap);
      setOptions(optionMap);
      setPoleIdLoaded(true);

      // Load all device types from DeviceFieldDefinitions
      const types = await DeviceFieldDefinitionsRepository.getDeviceTypes(templateId);
      setDeviceTypes(types);

      // Detect device count fields dynamically
      const counts: Record<string, number> = {};
      for (const field of sectionFields) {
        const key = field.FieldKey;
        // Match pattern: {type}_count (e.g., camera_count, switch_count, nvr_count)
        const match = key.match(/^(.+)_count$/);
        if (match) {
          const deviceType = types.find(
            (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_count" === key
          );
          if (deviceType) {
            const val = valueMap[field.FieldID];
            counts[deviceType] = Number(val || "0");
          }
        }
      }
      setDeviceCounts(counts);
    } catch (e) {
      logger.error("Error loading section:", e);
    } finally {
      setLoading(false);
    }
  }

  const isFormLocked = !contextPoleId.trim();

  async function updateValue(
    field: InspectionField,
    value: string
  ) {
    setValues((prev) => ({
      ...prev,
      [field.FieldID]: value,
    }));

    await InspectionValueRepository.saveValue(
      inspectionId,
      field.FieldID,
      value
    );

    // Update device counts dynamically
    const match = field.FieldKey.match(/^(.+)_count$/);
    if (match) {
      const deviceType = deviceTypes.find(
        (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_count" === field.FieldKey
      );
      if (deviceType) {
        setDeviceCounts((prev) => ({
          ...prev,
          [deviceType]: Number(value || "0"),
        }));
      }
    }
  }

  if (loading || !poleIdLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const sectionKeyLower = (sectionKey ?? "").toLowerCase();
  // Get the device type that matches this section
  const currentDeviceType = deviceTypes.find(
    (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_information" === sectionKeyLower
  );

  return (
    <View>
        {fields.map((field) => (
          <FieldRenderer
            key={field.FieldID}
            fieldId={field.FieldID}
            fieldKey={field.FieldKey}
            fieldName={field.FieldName}
            fieldType={field.FieldType}
            required={field.IsRequired === 1}
            editable={
              field.IsActive === 1 &&
              (!isFormLocked || field.FieldKey === "pole_id")
            }
            placeholder={field.Placeholder ?? ""}
            helpText={field.HelpText ?? ""}
            value={values[field.FieldID] ?? ""}
            options={options[field.FieldID] ?? []}
            showLockedMessage={
              isFormLocked &&
              field.FieldKey !== "pole_id"
            }
            onChange={(value) => updateValue(field, value)}
          />
        ))}

      {/* Render DeviceSection for the matching device type */}
      {currentDeviceType && (deviceCounts[currentDeviceType] ?? 0) > 0 && (
        <View style={styles.dynamicContainer}>
          <DeviceSection
            inspectionId={inspectionId}
            deviceType={currentDeviceType}
            count={deviceCounts[currentDeviceType]}
            templateId={templateId}
            locked={isFormLocked}
          />
        </View>
      )}

      {sectionKey === "photos" && (
        <View style={styles.dynamicContainer}>
          <PhotoSection
            inspectionId={inspectionId}
            locked={isFormLocked}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 30,
    justifyContent: "center",
    alignItems: "center",
  },

  dynamicContainer: {
    marginTop: 20,
  },
});

