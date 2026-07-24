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
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";

import {
  InspectionField,
} from "@/src/models/InspectionField";

import CameraSection from "./CameraSection";
import SwitchSection from "./SwitchSection";
import PhotoSection from "./PhotoSection";

interface Props {
  inspectionId: number;
  sectionId: number;
  sectionKey?: string;
}

export default function SectionRenderer({
  inspectionId,
  sectionId,
  sectionKey,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<InspectionField[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [options, setOptions] = useState<Record<number, any[]>>({});
  const [cameraCount, setCameraCount] = useState(0);
  const [switchCount, setSwitchCount] = useState(0);
  const [inspectionPoleId, setInspectionPoleId] = useState("");

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

      const poleId = await InspectionRepository.getInspectionPoleId(inspectionId);
      setInspectionPoleId(poleId);

      for (const field of sectionFields) {
        if (field.FieldKey === "camera_count") {
          const val = valueMap[field.FieldID];
          if (val) {
            setCameraCount(Number(val));
          }
        }
        if (field.FieldKey === "switch_count") {
          const val = valueMap[field.FieldID];
          if (val) {
            setSwitchCount(Number(val));
          }
        }
      }
    } catch (e) {
      console.error("Error loading section:", e);
    } finally {
      setLoading(false);
    }
  }

  const isFormLocked = !inspectionPoleId.trim();

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

    if (field.FieldKey === "camera_count") {
      setCameraCount(Number(value || "0"));
    }

    if (field.FieldKey === "switch_count") {
      setSwitchCount(Number(value || "0"));
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

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
            !(
              isFormLocked &&
              field.FieldKey !== "pole_id" &&
              field.FieldKey !== "camera_count" &&
              field.FieldKey !== "switch_count"
            )
          }
          placeholder={field.Placeholder ?? ""}
          helpText={field.HelpText ?? ""}
          value={values[field.FieldID] ?? ""}
          options={options[field.FieldID] ?? []}
          showLockedMessage={
            isFormLocked &&
            field.FieldKey !== "pole_id" &&
            field.FieldKey !== "camera_count" &&
            field.FieldKey !== "switch_count"
          }
          onChange={(value) => updateValue(field, value)}
          onCameraCountChange={setCameraCount}
          onSwitchCountChange={setSwitchCount}
        />
      ))}

      {sectionKey === "camera_information" && cameraCount > 0 && (
        <View style={styles.dynamicContainer}>
          <CameraSection
            inspectionId={inspectionId}
            count={cameraCount}
          />
        </View>
      )}

      {sectionKey === "switch_information" && switchCount > 0 && (
        <View style={styles.dynamicContainer}>
          <SwitchSection
            inspectionId={inspectionId}
            count={switchCount}
          />
        </View>
      )}

      {sectionKey === "photos" && (
        <View style={styles.dynamicContainer}>
          <PhotoSection
            inspectionId={inspectionId}
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
