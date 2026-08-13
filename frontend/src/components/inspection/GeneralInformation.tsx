import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from "react";
import { logger } from "@/src/utils/logger";
import { View, Alert } from "react-native";
import {
  Button,
  ActivityIndicator,
  Text,
} from "react-native-paper";
import { useRouter } from "expo-router";
import FieldRenderer from "./FieldRenderer";
import { useInspection } from "@/src/context/InspectionContext";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { InspectionField } from "@/src/database/repositories/InspectionTypes";
import { getCurrentLocation } from "@/src/utils/location";
import { reverseGeocode } from "@/src/utils/geo";

const GeneralInformation = forwardRef((_props, ref) => {
const {
  project: contextProject,
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
const [locationResolving, setLocationResolving] = useState(false);
const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
const poleCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  if (!inspectionId) return;
  init();
}, [inspectionId]);

async function init() {
  try {
    let projectData = contextProject;

    // If contextProject hasn't propagated yet, wait briefly for React to flush
    if (!projectData && inspectionId) {
      // Do NOT call getProjectById() here — it calls getGlobalDatabase() which
      // closes the project DB and reopens the global DB, corrupting the Android
      // native handle. Instead, rely on context propagation from new.tsx.
      for (let attempt = 0; attempt < 5 && !projectData; attempt++) {
        await new Promise((r) => setTimeout(r, 50));
        projectData = contextProject;
      }
    }

    let templateId = (projectData as any)?.TemplateID;
    if (!templateId) {
      const db = await (await import("@/src/database/db")).getDatabase();
      const defaultTemplate = await db.getFirstAsync<{ TemplateID: number }>(
        `SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
      );
      templateId = defaultTemplate?.TemplateID;
    }

    const loadedFields = await loadFields(templateId);
    const savedValues = await loadInspectionValues(loadedFields, projectData);
    setValues(savedValues);

    if ((savedValues.pole_id ?? "").trim() !== "") {
      setFormUnlocked(true);
    }
    setPoleId(savedValues.pole_id ?? "");

    for (const field of loadedFields) {
      const key = field.FieldKey;
      const val = savedValues[key];

      if (!inspectionId) continue;

      if (key === "date" && val) {
        await InspectionRepository.saveFieldValue(inspectionId, field.FieldID, val);
      } else if (key === "division" && val) {
        await InspectionRepository.saveFieldValue(inspectionId, field.FieldID, val);
      } else if (key === "district" && val) {
        await InspectionRepository.saveFieldValue(inspectionId, field.FieldID, val);
      } else if (key === "block" && val) {
        await InspectionRepository.saveFieldValue(inspectionId, field.FieldID, val);
      } else if (key === "inspector_name" && val) {
        await InspectionRepository.saveFieldValue(inspectionId, field.FieldID, val);
      }
    }
  } catch (error) {
    logger.error("Init Error:", error);
  }
}

async function loadInspectionValues(
  loadedFields: InspectionField[],
  project: typeof contextProject
): Promise<Record<string, string>> {
  if (!inspectionId) return {};

  const data = await InspectionRepository.getInspectionValues(inspectionId);

  const result: Record<string, string> = {};

  for (const field of loadedFields) {
    const key = field.FieldKey;
    const savedVal = data[key];

    if (savedVal) {
      result[key] = savedVal;
    } else {
        switch (key) {
        case "date":
          result[key] = inspectionDate || "";
          break;
        case "division":
          result[key] = project?.DivisionName || "";
          break;
        case "district":
          result[key] = project?.DistrictName || "";
          break;
        case "block":
          result[key] = project?.Block || "";
          break;
        case "inspector_name":
          result[key] = project?.InspectorName || "";
          break;
        default:
          result[key] = "";
      }
    }
  }

  return result;
}

async function loadFields(templateId?: number) {
  try {
    const data = await InspectionRepository.getFieldsByKey("general_information", templateId);
    setFields(data);
    return data;
  } catch (error) {
    logger.error("Load Fields Error:", error);
    return [];
  }
}

async function fetchCurrentLocation() {
  const location = await getCurrentLocation();

  if (!location || !inspectionId) return;

  const latitude = location.latitude.toFixed(6);
  const longitude = location.longitude.toFixed(6);
  const gpsValue = `${latitude}, ${longitude}`;

  logger.info(`[GPS] lat=${latitude}`);
  logger.info(`[GPS] lng=${longitude}`);
  logger.info("[GPS] reverseGeocodeReuse=true");

  setLocationResolving(true);
  let address = "";
  try {
    const result = await reverseGeocode(location.latitude, location.longitude);
    address = (result?.formatted ?? "").replace(/\n/g, ", ");
  } finally {
    setLocationResolving(false);
  }

  logger.info(`[GPS] addressFilled=${address.length > 0}`);

  setValues((prev) => ({
    ...prev,
    gps: gpsValue,
    ...(address ? { location: address } : {}),
  }));

  try {
    const gpsField = fields.find(f => f.FieldKey === "gps");
    if (gpsField) {
      await InspectionRepository.saveFieldValue(
        inspectionId,
        gpsField.FieldID,
        gpsValue
      );
    }
    if (address) {
      const locationField = fields.find(f => f.FieldKey === "location");
      if (locationField) {
        await InspectionRepository.saveFieldValue(
          inspectionId,
          locationField.FieldID,
          address
        );
      }
    }
  } catch (error) {
    logger.error("GPS Save Error:", error);
  }
}

function isReadOnly(fieldKey: string) {
  return fieldKey === "gps";
}

useImperativeHandle(ref, () => ({
  getPoleId() {
    return values.pole_id?.trim() ?? "";
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
            field.FieldKey === "pole_id"
              ? true
              : isReadOnly(field.FieldKey)
                ? false
                : formUnlocked
          }
          showLockedMessage={
            !formUnlocked &&
            !isReadOnly(field.FieldKey) &&
            field.FieldKey !== "pole_id"
          }
          value={values[field.FieldKey] ?? ""}
          options={
            field.FieldKey === "division" && contextProject?.DivisionName
              ? [{ label: contextProject.DivisionName, value: contextProject.DivisionName }]
              : field.FieldKey === "district" && contextProject?.DistrictName
                ? [{ label: contextProject.DistrictName, value: contextProject.DistrictName }]
                : []
          }
          onChange={async (text) => {
            setValues((prev) => ({
              ...prev,
              [field.FieldKey]: text,
            }));

            if (field.FieldKey === "pole_id") {
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
                        `SITE ID ${text} already exists.`,
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
                                  projectId: contextProject!.ProjectID.toString(),
                                  inspectionId:
                                    existing.InspectionID.toString(),
                                },
                              });
                            },
                          },
                          { text: "Create New" },
                          { text: "Cancel", style: "cancel" },
                        ]
                      );
                    }
                  } catch (error) {
                    setCheckingPoleId(false);
                    logger.error(error);
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
              if (!currentInspectionId) return;

              await InspectionRepository.saveFieldValue(
                currentInspectionId,
                field.FieldID,
                text
              );

              if (field.FieldKey === "pole_id") {
                await InspectionRepository.updateInspectionPoleId(
                  currentInspectionId,
                  text
                );
              }
            }, 500);
          }}
        />
        {field.FieldKey === "pole_id" && checkingPoleId && (
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
            <Text style={{ marginLeft: 8, fontSize: 13 }}>
              Checking SITE ID...
            </Text>
          </View>
        )}
        {field.FieldKey === "gps" && (
          <View>
            <Button
              mode="contained"
              icon="crosshairs-gps"
              onPress={fetchCurrentLocation}
              style={{ marginBottom: locationResolving ? 4 : 16 }}
            >
              Get Current Location
            </Button>
            {locationResolving && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 16,
                  paddingLeft: 8,
                }}
              >
                <ActivityIndicator size="small" />
                <Text style={{ marginLeft: 8, fontSize: 13 }}>
                  Resolving Address...
                </Text>
              </View>
            )}
          </View>
        )}
      </React.Fragment>
    ))}
  </View>
);
});

GeneralInformation.displayName = "GeneralInformation";

export default GeneralInformation;

