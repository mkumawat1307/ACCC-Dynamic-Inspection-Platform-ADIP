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
import { getTodayDateString } from "@/src/utils/date";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { PoleRenameService } from "@/src/database/repositories/PoleRenameService";
import { cleanPoleToken, decidePoleIdChange } from "./photoUtils";
import PoleRenameConfirmDialog from "./PoleRenameConfirmDialog";

interface GeneralInformationProps {
  ensureDraft?: () => Promise<number | null>;
  releaseAbandonedDraft?: () => Promise<void>;
}

const GeneralInformation = forwardRef(({
  ensureDraft,
  releaseAbandonedDraft,
}: GeneralInformationProps, ref) => {
const {
  project: contextProject,
  inspectionDate,
  inspectionId,
  setInspectionId,
  setPoleId,
  getPhotoStates,
} = useInspection();

const [fields, setFields] = useState<InspectionField[]>([]);
const router = useRouter();
const [values, setValues] = useState<Record<string, string>>({});
const [formUnlocked, setFormUnlocked] = useState(false);
const [initError, setInitError] = useState<string | null>(null);
const [checkingPoleId, setCheckingPoleId] = useState(false);
const [locationResolving, setLocationResolving] = useState(false);
const [pendingRename, setPendingRename] = useState<{
  oldPoleId: string;
  newPoleId: string;
  photoCount: number;
} | null>(null);
const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
const poleCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
const poleIdSaveChain = useRef<Promise<unknown>>(Promise.resolve());
// The inspectionId the current render targets. Used by init() to detect when a
// stale async load (started for an older inspectionId) resolves after the
// inspection was switched or reset, so old values can never be repopulated.
const inspectionIdRef = useRef(inspectionId);
inspectionIdRef.current = inspectionId;

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
  init();
}, [inspectionId]);

async function init() {
  const targetId = inspectionId;
  try {
    setInitError(null);
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

    // If the inspection was switched or reset while this async load was in
    // flight, discard the result so a stale/blank inspection never repopulates
    // the current form with the previous inspection's values.
    if (inspectionIdRef.current !== targetId) return;

    const savedPoleId = (savedValues.pole_id ?? "").trim();
    const hasTypedPoleId = (values.pole_id ?? "").trim() !== "";

    if (savedPoleId !== "") {
      setFormUnlocked(true);
    }

    if (savedPoleId || !hasTypedPoleId) {
      setValues(savedValues);
      setPoleId(savedPoleId);
    } else {
      // The user has typed a Site ID that is not persisted yet (lazy draft
      // not saved). Keep the typed value so a re-init triggered by draft
      // creation doesn't clobber it; merge the rest of the values.
      setValues((prev) => ({ ...prev, ...savedValues, pole_id: prev.pole_id }));
    }

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
    setInitError("Failed to load inspection form. Please try again.");
  }
}

async function loadInspectionValues(
  loadedFields: InspectionField[],
  project: typeof contextProject
): Promise<Record<string, string>> {
  const data = inspectionId
    ? await InspectionRepository.getInspectionValues(inspectionId)
    : {};

  const result: Record<string, string> = {};

  for (const field of loadedFields) {
    const key = field.FieldKey;
    const savedVal = data[key];

    if (savedVal) {
      result[key] = savedVal;
    } else {
        switch (key) {
        case "date":
          result[key] = inspectionDate || getTodayDateString();
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

  setLocationResolving(true);
  let address = "";
  try {
    const result = await reverseGeocode(location.latitude, location.longitude);
    address = result?.formatted ?? "";
  } finally {
    setLocationResolving(false);
  }

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

function isLockedField(fieldKey: string) {
  return (
    fieldKey === "date" ||
    fieldKey === "division" ||
    fieldKey === "district"
  );
}

function isReadOnly(fieldKey: string) {
  return fieldKey === "gps";
}

async function handlePoleIdSave(
  inspectionId: number | null,
  fieldId: number,
  text: string
) {
  const run = async () => {
    const trimmed = text.trim();

    // Resolve the inspection row. For a brand-new inspection this is null
    // until the draft is created lazily — AFTER the duplicate check passes.
    let effectiveId = inspectionId;
    const current = effectiveId != null
      ? await InspectionRepository.getInspectionPoleId(effectiveId)
      : "";

    // Fresh duplicate check immediately before any persistence. When no
    // draft exists yet, any existing match is a genuine duplicate, so no
    // draft is created for it.
    if (trimmed.length > 0) {
      const existing = await InspectionRepository.getInspectionByPoleId(trimmed);
      if (existing && existing.InspectionID !== effectiveId) {
        Alert.alert(
          "Duplicate Site ID",
          `Site ID ${trimmed} already exists in another inspection. Please enter a unique Site ID.`
        );
        revertPoleId(current);
        return;
      }
    }

    // Lazy draft creation — only after the duplicate check passes, so a
    // duplicate Site ID never leaves an orphan draft behind.
    if (effectiveId == null) {
      effectiveId = ensureDraft ? await ensureDraft() : null;
      if (effectiveId == null) {
        revertPoleId(current);
        return;
      }
    }

    if (cleanPoleToken(trimmed) === cleanPoleToken(current)) {
      await InspectionRepository.saveFieldValue(effectiveId, fieldId, trimmed);
      if (trimmed !== current) {
        await InspectionRepository.updateInspectionPoleId(effectiveId, trimmed);
      }
      return;
    }

    const photos = await PhotoRepository.getByInspection(effectiveId);
    const decision = decidePoleIdChange(photos, getPhotoStates());

    if (decision.type === "blocked") {
      Alert.alert(
        "Rename Blocked",
        "Wait for all photos to finish processing before changing the Site ID."
      );
      revertPoleId(current);
      return;
    }

    if (decision.type === "direct-save") {
      try {
        await InspectionRepository.updatePoleIdDirectSave(
          effectiveId,
          fieldId,
          trimmed
        );
      } catch (error) {
        logger.error("[PoleRename] directSaveFailed:", error);
        Alert.alert(
          "Save Failed",
          "Could not update the Site ID. Please try again."
        );
        revertPoleId(current);
      }
      return;
    }

    setPendingRename({
      oldPoleId: current,
      newPoleId: trimmed,
      photoCount: decision.photoCount,
    });
  };

  const chained = poleIdSaveChain.current.then(run, run);
  poleIdSaveChain.current = chained;
  await chained;
}

function revertPoleId(value: string) {
  setValues((prev) => ({ ...prev, pole_id: value }));
  setPoleId(value);
  setFormUnlocked(value.trim().length > 0);
}

// Clear ONLY the Site ID (Pole ID) from form state. Used when the user
// dismisses a duplicate-Site-ID alert with Cancel. It cancels any pending
// debounced save so a stale duplicate value can never be written back, then
// empties the field while preserving every other form value. The inspection
// row and all other section data are left untouched.
function clearSiteId() {
  if (saveTimeout.current) {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = null;
  }
  if (poleCheckTimeout.current) {
    clearTimeout(poleCheckTimeout.current);
    poleCheckTimeout.current = null;
  }
  setValues((prev) => ({ ...prev, pole_id: "" }));
  setPoleId("");
  setFormUnlocked(false);
}

// Abandon the current duplicate inspection and reset the whole form to a blank
// new-inspection lifecycle. Used when the user dismisses a duplicate-Site-ID
// alert with "Create New". It cancels pending timers, deletes the abandoned
// draft (if a NEW-inspection draft was persisted), clears the form values, and
// nulls inspectionId so new.tsx re-locks sections and unmounts the other
// section renderers. The result is an unpersisted new inspection (inspectionId
// = null) with a clean in-memory form.
async function handleCreateNew() {
  if (saveTimeout.current) {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = null;
  }
  if (poleCheckTimeout.current) {
    clearTimeout(poleCheckTimeout.current);
    poleCheckTimeout.current = null;
  }
  setValues({});
  setPoleId("");
  setFormUnlocked(false);
  setInspectionId(null);
  if (releaseAbandonedDraft) {
    try {
      await releaseAbandonedDraft();
    } catch (error) {
      logger.error("[CreateNew] abandon draft failed:", error);
    }
  }
}

useImperativeHandle(ref, () => ({
  getPoleId() {
    return values.pole_id?.trim() ?? "";
  },
}));

return (
  <View>
    {initError && (
      <View style={{ padding: 16, alignItems: "center" }}>
        <Text style={{ color: "#d32f2f", textAlign: "center", marginBottom: 12 }}>
          {initError}
        </Text>
        <Button mode="outlined" onPress={() => init()}>
          Retry
        </Button>
      </View>
    )}
    {fields.map((field) => (
      <React.Fragment key={field.FieldID}>
        <FieldRenderer
          fieldName={field.FieldName}
          fieldType={field.FieldType}
          required={field.IsRequired === 1}
          editable={
            field.FieldKey === "pole_id"
              ? true
              : isLockedField(field.FieldKey) || isReadOnly(field.FieldKey)
                ? false
                : formUnlocked
          }
          showLockedMessage={
            !formUnlocked &&
            !isLockedField(field.FieldKey) &&
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
                      // Cancel pending save to prevent race condition
                      if (saveTimeout.current) {
                        clearTimeout(saveTimeout.current);
                        saveTimeout.current = null;
                      }
                      Alert.alert(
                        "Inspection Already Exists",
                        `SITE ID ${text} already exists.`,
                        [
                          {
                            text: "Edit Existing",
                            onPress: async () => {
                              // Delete the session draft (if any) so it does
                              // not linger as an orphan, then open the
                              // existing inspection.
                              if (releaseAbandonedDraft) {
                                await releaseAbandonedDraft();
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
                          {
                            text: "Create New",
                            onPress: () => {
                              handleCreateNew();
                            },
                          },
                          { text: "Cancel", style: "cancel",
                            onPress: () => {
                              // Dismiss the duplicate alert and clear ONLY the
                              // Site ID. Cancel any pending/debounced save for
                              // the duplicate so it cannot be written back, and
                              // keep the user on this form with all other data
                              // intact. No draft is created by cancelling.
                              clearSiteId();
                            },
                          },
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

            if (!inspectionId && field.FieldKey !== "pole_id") return;

            if (saveTimeout.current) {
              clearTimeout(saveTimeout.current);
            }

            const currentInspectionId = inspectionId;

            saveTimeout.current = setTimeout(async () => {
              if (!currentInspectionId && field.FieldKey !== "pole_id") return;

              if (field.FieldKey === "pole_id") {
                await handlePoleIdSave(
                  currentInspectionId,
                  field.FieldID,
                  text
                );
                return;
              }

              if (currentInspectionId == null) return;

              await InspectionRepository.saveFieldValue(
                currentInspectionId,
                field.FieldID,
                text
              );
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
    <PoleRenameConfirmDialog
      visible={pendingRename !== null}
      oldPoleId={pendingRename?.oldPoleId ?? ""}
      newPoleId={pendingRename?.newPoleId ?? ""}
      photoCount={pendingRename?.photoCount ?? 0}
      onCancel={() => {
        if (pendingRename) {
          revertPoleId(pendingRename.oldPoleId);
        }
        setPendingRename(null);
      }}
      onConfirm={async (renameFiles, updateReports) => {
        if (!pendingRename || !inspectionId) return;
        const { oldPoleId, newPoleId } = pendingRename;
        setPendingRename(null);
        try {
          const result = await PoleRenameService.renamePoleId(
            inspectionId,
            oldPoleId,
            newPoleId,
            { renameFiles, updateReports }
          );
          if (result.duplicate) {
            Alert.alert(
              "Duplicate Site ID",
              `Site ID ${result.duplicatePoleId} already exists in another inspection. Please enter a unique Site ID.`
            );
            revertPoleId(oldPoleId);
            return;
          }
        } catch (error) {
          logger.error("[PoleRename] rename error:", error);
          Alert.alert(
            "Rename Failed",
            "Could not rename the Site ID. Original files and records were kept."
          );
          revertPoleId(oldPoleId);
        }
      }}
    />
  </View>
);
});

GeneralInformation.displayName = "GeneralInformation";

export default GeneralInformation;

