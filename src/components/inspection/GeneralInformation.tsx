//frontend\src\components\inspection\GeneralInformation.tsx

import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from "react";
import { View } from "react-native";
import { Button } from "react-native-paper";

import FieldRenderer from "./FieldRenderer";
import { useInspection } from "@/src/context/InspectionContext";
import {
  InspectionRepository,
  InspectionField,
} from "@/src/database/repositories/InspectionRepository";
import { getCurrentLocation } from "@/src/utils/location";

const GeneralInformation = forwardRef((props, ref) => {
const {
  project,
  inspectionDate,
  inspectionId,
  setPoleId,
} = useInspection();

const [fields, setFields] = useState<InspectionField[]>([]);

const [values, setValues] = useState<Record<string, string>>({});
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => {
  loadFields();

  if (inspectionId) {
    loadInspectionValues();
  }
}, [inspectionId]);

useEffect(() => {
  if (!project) return;

setValues((prev) => ({
  ...prev,
  InspectionDate: prev.InspectionDate || inspectionDate,
  Division: prev.Division ?? project.DivisionName ?? "",
  District: prev.District ?? project.DistrictName ?? "",
  Block: prev.Block ?? project.Block ?? "",
}));
}, [project, inspectionDate]);

async function loadInspectionValues() {
  if (!inspectionId) return;

  try {
    const data =
      await InspectionRepository.getInspectionValues(
        inspectionId
      );

    setValues((prev) => ({
      ...prev,
      ...data,
    }));
  } catch (error) {
    console.error("Load Values Error:", error);
  }
}

async function loadFields() {

    try {
      const data = await InspectionRepository.getFieldsBySection(1);

      console.log("Fields Loaded:", data);

      setFields(data);
    } catch (error) {
      console.error("Load Fields Error:", error);
    }
  }

async function fetchCurrentLocation() {
  const location = await getCurrentLocation();

  if (!location || !inspectionId) return;

  const latitude = location.latitude.toFixed(6);
  const longitude = location.longitude.toFixed(6);

  setValues((prev) => ({
    ...prev,
    Latitude: latitude,
    Longitude: longitude,
  }));

  await InspectionRepository.saveFieldValue(
    inspectionId,
    "Latitude",
    latitude
  );

  await InspectionRepository.saveFieldValue(
    inspectionId,
    "Longitude",
    longitude
  );
}
  function isReadOnly(fieldKey: string) {
    return (
      fieldKey === "InspectionDate" ||
      fieldKey === "Division" ||
      fieldKey === "District"
    );
  }
useImperativeHandle(ref, () => ({
  getPoleId() {
    return values.PoleID?.trim() ?? "";
  },
}));
return (
  <View>
    {fields.map((field) => (
      <React.Fragment key={field.FieldID}>
        <FieldRenderer
          fieldName={field.FieldName}
          fieldType={field.FieldType}
          required={field.IsRequired === 1}
          editable={!isReadOnly(field.FieldKey)}
          value={values[field.FieldKey] ?? ""}
            onChange={(text) => {
                setValues((prev) => ({
                    ...prev,
                    [field.FieldKey]: text,
                }));

                if (field.FieldKey === "PoleID") {
                    setPoleId(text);
                }

        if (!inspectionId) return;

        if (saveTimeout.current) {
            clearTimeout(saveTimeout.current);
        }

        saveTimeout.current = setTimeout(async () => {

            await InspectionRepository.saveFieldValue(
                inspectionId,
                field.FieldKey,
                text
            );

            if (field.FieldKey === "PoleID") {
                await InspectionRepository.updateInspectionPoleId(
                    inspectionId,
                    text
                );
            }

        }, 500);
        }}
        />

        {field.FieldKey === "Longitude" && (
          <Button
            mode="contained"
            icon="crosshairs-gps"
            onPress={fetchCurrentLocation}
            style={{ marginBottom: 16 }}
          >
            Get Current Location
          </Button>
        )}
      </React.Fragment>
    ))}
  </View>
);
});

export default GeneralInformation;