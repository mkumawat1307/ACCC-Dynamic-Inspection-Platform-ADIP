//frontend\src\components\inspection\GeneralInformation.tsx

import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from "react";
import { View, Alert } from "react-native";
import {
  Button,
  ActivityIndicator,
  Text,
} from "react-native-paper";
import { useRouter } from "expo-router";
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
  setInspectionId,
  setPoleId,
} = useInspection();

const [fields, setFields] = useState<InspectionField[]>([]);
const router = useRouter();
const [values, setValues] = useState<Record<string, string>>({});
const [formUnlocked, setFormUnlocked] = useState(false);
const [checkingPoleId, setCheckingPoleId] = useState(false);
const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
const poleCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {

  async function init() {

    const loadedFields =
      await loadFields();

    if (inspectionId) {
      await loadInspectionValues(
        loadedFields
      );
    }

  }

  init();

}, [inspectionId]);

useEffect(() => {
return () => {

  if (saveTimeout.current) {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = null;
  }

  if (poleCheckTimeout.current) {
    clearTimeout(poleCheckTimeout.current);
    poleCheckTimeout.current = null;
  }

};
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

async function loadInspectionValues(
  loadedFields: InspectionField[]
) {
  if (!inspectionId) return;

  try {
    const data =
      await InspectionRepository.getInspectionValues(
        inspectionId
      );
    if ((data.PoleID ?? "").trim() !== "") {
      setFormUnlocked(true);
    }

    const emptyValues: Record<string, string> = {};

    loadedFields.forEach(field => {
      emptyValues[field.FieldKey] = "";
    });

    setValues({
      ...emptyValues,

      // Keep automatic values
      InspectionDate: inspectionDate,
      Division: project?.DivisionName ?? "",
      District: project?.DistrictName ?? "",
      Block: project?.Block ?? "",

      // Load saved inspection values
      ...data,
    });

  } catch (error) {
    console.error("Load Values Error:", error);
  }
}

async function loadFields() {

  try {

    const data =
      await InspectionRepository.getFieldsBySection(1);

    console.log("Fields Loaded:", data);

    setFields(data);

    return data;

  } catch (error) {

    console.error("Load Fields Error:", error);

    return [];

  }
}

async function fetchCurrentLocation() {
  console.log("================================");
console.log("GPS BUTTON PRESSED");
console.log("Inspection ID:", inspectionId);
console.log("================================");
  const location = await getCurrentLocation();

  if (!location || !inspectionId) return;
  console.log("GPS InspectionID:", inspectionId);
  const latitude = location.latitude.toFixed(6);
  const longitude = location.longitude.toFixed(6);

  // Update UI
  setValues((prev) => ({
    ...prev,
    Latitude: latitude,
    Longitude: longitude,
  }));

  try {
    // Save immediately
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
  } catch (error) {
    console.error("GPS Save Error:", error);
  }
}
function isReadOnly(fieldKey: string) {
  return (
    fieldKey === "InspectionDate" ||
    fieldKey === "Division" ||
    fieldKey === "District" ||
    fieldKey === "Latitude" ||
    fieldKey === "Longitude"
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
          editable={
            field.FieldKey === "PoleID"
              ? true
              : isReadOnly(field.FieldKey)
                ? false
                : formUnlocked
          }
          showLockedMessage={
            !formUnlocked &&
            !isReadOnly(field.FieldKey) &&
            field.FieldKey !== "PoleID"
          }
          value={values[field.FieldKey] ?? ""}
            onChange={async (text) => {
                setValues((prev) => ({
                    ...prev,
                    [field.FieldKey]: text,
                }));

if (field.FieldKey === "PoleID") {

  setFormUnlocked(text.trim().length > 0);
  setPoleId(text);

  if (poleCheckTimeout.current) {
    clearTimeout(poleCheckTimeout.current);
  }

  if (text.trim().length > 0) {

    poleCheckTimeout.current = setTimeout(async () => {

      try {

        setCheckingPoleId(true);

        const existing =
          await InspectionRepository.getInspectionByPoleId(
            text.trim()
          );

        setCheckingPoleId(false);

        if (
          existing &&
          existing.InspectionID !== inspectionId
        ) {

          Alert.alert(
            "Inspection Already Exists",
            `Pole ID ${text} already exists.`,
            [
              {
                text: "Edit Existing",
                onPress: async () => {

                  if (saveTimeout.current) {
                    clearTimeout(saveTimeout.current);
                    saveTimeout.current = null;
                  }

                  setValues({});

                  setInspectionId(existing.InspectionID);

                  router.replace({
                    pathname: "/inspection/new",
                    params: {
                      projectId: project!.ProjectID.toString(),
                      inspectionId:
                        existing.InspectionID.toString(),
                    },
                  });

                },
              },
              {
                text: "Create New",
              },
              {
                text: "Cancel",
                style: "cancel",
              },
            ]
          );

        }

      }
      catch (error) {

        setCheckingPoleId(false);

        console.error(error);

      }

    }, 300);

  }

}

        if (!inspectionId) return;

        if (saveTimeout.current) {
          clearTimeout(saveTimeout.current);
        }

        const currentInspectionId = inspectionId;

        saveTimeout.current = setTimeout(async () => {

          // Don't save if inspection no longer exists
          if (!currentInspectionId) {
            return;
          }

          console.log(
            "Saving:",
            currentInspectionId,
            field.FieldKey,
            text
          );

          await InspectionRepository.saveFieldValue(
            currentInspectionId,
            field.FieldKey,
            text
          );

          console.log("Saved:", field.FieldKey);

          if (field.FieldKey === "PoleID") {
            await InspectionRepository.updateInspectionPoleId(
              currentInspectionId,
              text
            );
          }

        }, 500);
        }}
        />
{field.FieldKey === "PoleID" && checkingPoleId && (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginTop: -10,
      marginBottom: 16,
      paddingLeft: 8,
    }}
  >
    <ActivityIndicator size="small" />

    <Text
      style={{
        marginLeft: 8,
        fontSize: 13,
      }}
    >
      Checking Pole ID...
    </Text>
  </View>
)}
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