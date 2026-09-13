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
import { InspectionLiveValues } from "@/src/database/repositories/InspectionLiveValues";
import { InspectionField } from "@/src/database/repositories/InspectionTypes";
import { getCurrentLocation } from "@/src/utils/location";
import { reverseGeocode } from "@/src/utils/geo";
import { getTodayDateString } from "@/src/utils/date";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { InspectionEditSession } from "@/src/database/repositories/InspectionEditSession";
import { cleanPoleToken, InspectionIdentity } from "./photoUtils";
import PoleRenameConfirmDialog from "./PoleRenameConfirmDialog";
import { PoleRenameService } from "@/src/database/repositories/PoleRenameService";

export type IdentityRenameDecision =
  | { type: "no-change" }
  | { type: "no-rename" }
  | { type: "proceed"; renameFiles: boolean; updateReports: boolean }
  | { type: "cancelled" }
  | { type: "duplicate"; duplicatePoleId: string };

export interface GeneralInformationHandle {
  getPoleId(): string;
  confirmIdentityRename(): Promise<IdentityRenameDecision>;
}

interface GeneralInformationProps {
  ensureDraft?: () => Promise<number | null>;
  releaseAbandonedDraft?: () => Promise<void>;
  existing?: boolean;
  onDataChanged?: () => void;
}

const GeneralInformation = forwardRef<GeneralInformationHandle, GeneralInformationProps>(({
  ensureDraft,
  releaseAbandonedDraft,
  existing = false,
  onDataChanged,
}, ref) => {
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
const [initError, setInitError] = useState<string | null>(null);
const [checkingPoleId, setCheckingPoleId] = useState(false);
const [locationResolving, setLocationResolving] = useState(false);
const [renamePrompt, setRenamePrompt] = useState<{
  oldIdentity: InspectionIdentity;
  newIdentity: InspectionIdentity;
  photoCount: number;
} | null>(null);
const poleCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
const poleIdSaveChain = useRef<Promise<unknown>>(Promise.resolve());
const poleCheckVersion = useRef(0);
const gpsFetchSeq = useRef(0);
const renamePromptResolverRef = useRef<((decision: IdentityRenameDecision) => void) | null>(null);
// The district/block/pole identity persisted for this inspection. Filenames and
// report values are keyed to these tokens; save-time renames diff against them.
const persistedIdentityRef = useRef<InspectionIdentity>({
  district: "",
  block: "",
  poleId: "",
});
// The inspectionId the current render targets. Used by init() to detect when a
// stale async load (started for an older inspectionId) resolves after the
// inspection was switched or reset, so old values can never be repopulated.
const inspectionIdRef = useRef(inspectionId);
inspectionIdRef.current = inspectionId;

useEffect(() => {
  return () => {
    // Drop any debounced field-value saves so a stale write can never land on
    // the next inspection after this one unmounts. Do NOT bump poleCheckVersion
    // here: an inspectionId change is not new user input, and bumping it would
    // orphan a mid-flight check — its version-guarded finally would skip the
    // setCheckingPoleId(false) and leave "Checking SITE ID..." visible forever.
    InspectionRepository.cancelPendingFieldValueSaves();
    if (poleCheckTimeout.current) {
      clearTimeout(poleCheckTimeout.current);
      poleCheckTimeout.current = null;
    }
  };
}, [inspectionId]);

useEffect(() => {
  init();
}, [inspectionId]);

// Invalidate any in-flight "Use Current Location" fetch on unmount so a late
// result can never repopulate a different inspection's gps/location fields.
useEffect(() => {
  return () => {
    gpsFetchSeq.current += 1;
  };
}, []);

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

    if (existing) {
      // Capture the identity persisted for this inspection so save-time renames
      // diff against it. The raw DB values (not the display-merged ones) are
      // authoritative — filenames carry the originally captured identity.
      const persistedData = inspectionId
        ? await InspectionRepository.getInspectionValues(inspectionId)
        : {};
      persistedIdentityRef.current = {
        district: persistedData.district ?? "",
        block: persistedData.block ?? "",
        poleId: savedPoleId,
      };
      // The live overlay is a module-level singleton, so a stale snapshot from
      // a previously-opened inspection can leak into this one. Clear it after
      // the form is populated — the staged edit-session values (and the DB) are
      // authoritative from here on.
      InspectionLiveValues.reset();
    }

    if (!existing && inspectionId != null) {
      persistedIdentityRef.current = {
        district: savedValues.district ?? "",
        block: savedValues.block ?? "",
        poleId: savedPoleId,
      };
    }

    if (!existing) {
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
    }

    onDataChanged?.();
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

    // Editing an existing inspection: Division and District always display the
    // CURRENT project values (an inspection follows the project it belongs to),
    // falling back to the persisted value only when the project lacks one.
    // Everything else stays on its persisted value — never auto-filled.
    if (existing) {
      switch (key) {
        case "division":
          result[key] = project?.DivisionName || savedVal || "";
          break;
        case "district":
          result[key] = project?.DistrictName || savedVal || "";
          break;
        default:
          result[key] = savedVal ?? "";
      }
      continue;
    }

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
  if (!inspectionId) return;

  const seq = ++gpsFetchSeq.current;
  setLocationResolving(true);
  try {
    const location = await getCurrentLocation();
    if (gpsFetchSeq.current !== seq) return;
    if (!location) return;

    const latitude = location.latitude.toFixed(6);
    const longitude = location.longitude.toFixed(6);
    const gpsValue = `${latitude}, ${longitude}`;

    let address = "";
    try {
      const result = await reverseGeocode(location.latitude, location.longitude);
      address = result?.formatted ?? "";
    } catch (error) {
      logger.error("Address Resolve Error:", error);
    }
    if (gpsFetchSeq.current !== seq) return;

    setValues((prev) => ({
      ...prev,
      gps: gpsValue,
      ...(address ? { location: address } : {}),
    }));

    const gpsField = fields.find(f => f.FieldKey === "gps");
    if (gpsField) {
      InspectionLiveValues.setFieldValue(gpsField.FieldID, gpsValue);
    }
    if (address) {
      const locationField = fields.find(f => f.FieldKey === "location");
      if (locationField) {
        InspectionLiveValues.setFieldValue(locationField.FieldID, address);
      }
    }
    onDataChanged?.();

    try {
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
  } finally {
    if (gpsFetchSeq.current === seq) setLocationResolving(false);
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
  text: string,
  version: number
) {
  const run = async () => {
    let effectiveId = inspectionId;
    let current = "";
    try {
      if (version !== poleCheckVersion.current) return;
      setCheckingPoleId(true);

      const trimmed = text.trim();

      // Resolve the inspection row. For a brand-new inspection this is null
      // until the draft is created lazily — AFTER the duplicate check passes.
      if (effectiveId != null) {
        current = (await InspectionRepository.getInspectionPoleId(effectiveId)) ?? "";
      }

      if (version !== poleCheckVersion.current) return;

      // Fresh duplicate check immediately before any persistence. When no
      // draft exists yet, any existing match is a genuine duplicate, so no
      // draft is created for it.
      const duplicate = trimmed.length > 0
        ? await InspectionRepository.getInspectionByPoleId(trimmed)
        : null;

      // A stale check (user edited again while this ran) must never alert,
      // revert, or persist anything.
      if (version !== poleCheckVersion.current) return;

      if (duplicate && duplicate.InspectionID !== effectiveId) {
        if (existing) {
          Alert.alert(
            "Duplicate Site ID",
            `Site ID ${trimmed} already exists in another inspection. Please enter a unique Site ID.`
          );
          revertPoleId(current);
        } else {
          Alert.alert(
            "Inspection Already Exists",
            `SITE ID ${trimmed} already exists.`,
            [
              {
                text: "Edit Existing",
                onPress: async () => {
                  // Delete the session draft (if any) so it does not linger as
                  // an orphan, then open the existing inspection.
                  if (releaseAbandonedDraft) {
                    await releaseAbandonedDraft();
                  }
                  setValues({});
                  setInspectionId(duplicate.InspectionID);

                  router.replace({
                    pathname: "/inspection/new",
                    params: {
                      projectId: contextProject!.ProjectID.toString(),
                      inspectionId: duplicate.InspectionID.toString(),
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
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => {
                  // Dismiss the duplicate alert and clear ONLY the Site ID.
                  // Cancel any pending/debounced save for the duplicate so it
                  // cannot be written back, and keep the user on this form with
                  // all other data intact. No draft is created by cancelling.
                  clearSiteId();
                },
              },
            ]
          );
        }
        return;
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

      if (version !== poleCheckVersion.current) return;

      if (cleanPoleToken(trimmed) === cleanPoleToken(current)) {
        await InspectionRepository.saveFieldValue(effectiveId, fieldId, trimmed);
        if (trimmed !== current) {
          await InspectionRepository.updateInspectionPoleId(effectiveId, trimmed);
        }
        return;
      }

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
    } finally {
      if (version === poleCheckVersion.current) {
        setCheckingPoleId(false);
      }
    }
  };

  const chained = poleIdSaveChain.current.then(run, run);
  poleIdSaveChain.current = chained;
  await chained;
}

function syncLiveField(fieldKey: string, value: string) {
  const field = fields.find((f) => f.FieldKey === fieldKey);
  if (field) {
    InspectionLiveValues.setFieldValue(field.FieldID, value);
  }
}

function revertPoleId(value: string) {
  setValues((prev) => ({ ...prev, pole_id: value }));
  setPoleId(value);
  setFormUnlocked(value.trim().length > 0);
  syncLiveField("pole_id", value);
  // Keep the edit session's staged identity in sync with the on-screen revert.
  // Without this, a previously-staged Site ID (e.g. from an earlier settled
  // save) stays staged and would be persisted on the next commit even though
  // the field now shows the persisted value.
  if (InspectionEditSession.isActive(inspectionId)) {
    const poleField = fields.find((f) => f.FieldKey === "pole_id");
    if (poleField) {
      InspectionEditSession.stageFieldValue(poleField.FieldID, value);
    }
    InspectionEditSession.stagePoleId(value);
    InspectionEditSession.stagePendingRename(null);
  }
  onDataChanged?.();
}

// Clear ONLY the Site ID (Pole ID) from form state. Used when the user
// dismisses a duplicate-Site-ID alert with Cancel. It cancels any pending
// debounced save so a stale duplicate value can never be written back, then
// empties the field while preserving every other form value. The inspection
// row and all other section data are left untouched.
function clearSiteId() {
  poleCheckVersion.current += 1;
  InspectionRepository.cancelPendingFieldValueSaves();
  if (poleCheckTimeout.current) {
    clearTimeout(poleCheckTimeout.current);
    poleCheckTimeout.current = null;
  }
  setValues((prev) => ({ ...prev, pole_id: "" }));
  setPoleId("");
  setFormUnlocked(false);
  syncLiveField("pole_id", "");
  onDataChanged?.();
}

// Abandon the current duplicate inspection and reset the whole form to a blank
// new-inspection lifecycle. Used when the user dismisses a duplicate-Site-ID
// alert with "Create New". It cancels pending timers, deletes the abandoned
// draft (if a NEW-inspection draft was persisted), clears the form values, and
// nulls inspectionId so new.tsx re-locks sections and unmounts the other
// section renderers. The result is an unpersisted new inspection (inspectionId
// = null) with a clean in-memory form.
async function handleCreateNew() {
  poleCheckVersion.current += 1;
  InspectionRepository.cancelPendingFieldValueSaves();
  if (poleCheckTimeout.current) {
    clearTimeout(poleCheckTimeout.current);
    poleCheckTimeout.current = null;
  }
  setValues({});
  setPoleId("");
  setFormUnlocked(false);
  InspectionLiveValues.reset();
  setInspectionId(null);
  onDataChanged?.();
  if (releaseAbandonedDraft) {
    try {
      await releaseAbandonedDraft();
    } catch (error) {
      logger.error("[CreateNew] abandon draft failed:", error);
    }
  }
}

function getEffectiveIdentity(): InspectionIdentity | null {
  const identity = {
    district: contextProject?.DistrictName ?? "",
    block: values.block?.trim() ?? "",
    poleId: values.pole_id?.trim() ?? "",
  };
  if (identity.district === "" && identity.block === "" && identity.poleId === "") {
    return null;
  }
  return identity;
}

// Capture the current identity (district/block/pole) into the edit session so a
// commit persists the updated values even when no file rename is needed.
function stageIdentityValues(identity: InspectionIdentity) {
  if (!InspectionEditSession.isActive(inspectionId)) return;
  for (const key of ["district", "block", "pole_id"] as const) {
    const field = fields.find((f) => f.FieldKey === key);
    if (!field) continue;
    const value =
      key === "district" ? identity.district
      : key === "block" ? identity.block
      : identity.poleId;
    InspectionEditSession.stageFieldValue(field.FieldID, value);
  }
}

// Revert the on-screen identity (and the staged copy) back to what is persisted
// for the inspection. Used when the user dismisses the save-time rename dialog.
function revertIdentityToPersisted(
  persisted: InspectionIdentity = persistedIdentityRef.current
) {
  setValues((prev) => ({
    ...prev,
    block: persisted.block,
    pole_id: persisted.poleId,
  }));
  setPoleId(persisted.poleId);
  setFormUnlocked(persisted.poleId.trim().length > 0);
  syncLiveField("pole_id", persisted.poleId);
  syncLiveField("block", persisted.block);
  if (InspectionEditSession.isActive(inspectionId)) {
    for (const key of ["district", "block", "pole_id"] as const) {
      const field = fields.find((f) => f.FieldKey === key);
      if (!field) continue;
      InspectionEditSession.stageFieldValue(
        field.FieldID,
        key === "district"
          ? (contextProject?.DistrictName ?? "")
          : key === "block"
            ? persisted.block
            : persisted.poleId
      );
    }
    InspectionEditSession.stagePoleId(persisted.poleId);
    InspectionEditSession.stagePendingRename(null);
  } else if (inspectionId != null) {
    const poleField = fields.find((f) => f.FieldKey === "pole_id");
    if (poleField) {
      void InspectionRepository.updatePoleIdDirectSave(
        inspectionId,
        poleField.FieldID,
        persisted.poleId
      );
    }
  }
  onDataChanged?.();
}

// Settle (cancel + drain) any in-flight/pending Site ID debounce so a save-time
// decision is computed against the value the user actually typed, and a stale
// timer can never fire AFTER the save has committed. Called at the start of
// checkIdentityBeforeSave.
async function settlePoleDebounce() {
  poleCheckVersion.current += 1;
  if (poleCheckTimeout.current) {
    clearTimeout(poleCheckTimeout.current);
    poleCheckTimeout.current = null;
  }
  setCheckingPoleId(false);
  await poleIdSaveChain.current;
}

// Save-time identity check. new.tsx calls this before committing an existing
// inspection. Returns the decision the caller must act on; the rename dialog is
// only shown for a true identity change WITH photos — never while typing.
async function checkIdentityBeforeSave(): Promise<IdentityRenameDecision> {
  const effectiveId = inspectionId;
  if (effectiveId == null) return { type: "no-change" };

  await settlePoleDebounce();

  const identity = getEffectiveIdentity();
  if (identity == null) return { type: "cancelled" };

  const persisted = persistedIdentityRef.current;

  const newPoleId = identity.poleId;
  if (newPoleId.length > 0) {
    const duplicate = await InspectionRepository.getInspectionByPoleId(newPoleId);
    if (duplicate && duplicate.InspectionID !== effectiveId) {
      if (!existing) {
        const poleField = fields.find((f) => f.FieldKey === "pole_id");
        if (poleField) {
          await InspectionRepository.updatePoleIdDirectSave(
            effectiveId,
            poleField.FieldID,
            persisted.poleId
          );
        }
      }
      revertPoleId(persisted.poleId);
      return { type: "duplicate", duplicatePoleId: newPoleId };
    }
  }

  const identityChanged =
    cleanPoleToken(identity.district) !== cleanPoleToken(persisted.district) ||
    cleanPoleToken(identity.block) !== cleanPoleToken(persisted.block) ||
    cleanPoleToken(identity.poleId) !== cleanPoleToken(persisted.poleId);

  if (!identityChanged) return { type: "no-change" };

  stageIdentityValues(identity);
  if (InspectionEditSession.isActive(effectiveId)) {
    InspectionEditSession.stagePoleId(identity.poleId);
  } else if (!existing && identity.poleId !== "") {
    // NEW inspection (no session): the settled typing save may have been
    // cancelled by the settle above (save pressed inside the debounce window),
    // so persist the latest Site ID here — idempotent with the typing save.
    const poleField = fields.find((f) => f.FieldKey === "pole_id");
    if (poleField) {
      await InspectionRepository.updatePoleIdDirectSave(
        effectiveId,
        poleField.FieldID,
        identity.poleId
      );
    }
  }

  const photos = await PhotoRepository.getByInspection(effectiveId);
  if (photos.length === 0) return { type: "no-rename" };

  return new Promise((resolve) => {
    renamePromptResolverRef.current = resolve;
    setRenamePrompt({
      oldIdentity: persisted,
      newIdentity: identity,
      photoCount: photos.length,
    });
  });
}

useImperativeHandle<GeneralInformationHandle, GeneralInformationHandle>(ref, () => ({
  getPoleId() {
    return values.pole_id?.trim() ?? "";
  },
  confirmIdentityRename() {
    return checkIdentityBeforeSave();
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
            // Mirror the on-screen value synchronously and refresh progress
            // immediately — the debounced database write must never gate the
            // progress header, and even a Site ID still in duplicate-check
            // (inspectionId null) counts toward progress right away.
            InspectionLiveValues.setFieldValue(field.FieldID, text);
            onDataChanged?.();

            const currentInspectionId = inspectionId;

            if (field.FieldKey === "pole_id") {
              setFormUnlocked(text.trim().length > 0);
              setPoleId(text);

              // A single settled check: every keystroke bumps the version and
              // restarts the timer, so only the FINAL value reaches the
              // duplicate check + save. Stale async results are discarded by
              // the version guard.
              poleCheckVersion.current += 1;
              const version = poleCheckVersion.current;
              if (poleCheckTimeout.current) {
                clearTimeout(poleCheckTimeout.current);
              }
              poleCheckTimeout.current = setTimeout(async () => {
                await handlePoleIdSave(
                  currentInspectionId,
                  field.FieldID,
                  text,
                  version
                );
              }, 500);
              return;
            }

            if (currentInspectionId == null) return;

            InspectionRepository.scheduleFieldValueSave(
              currentInspectionId,
              field.FieldID,
              text
            );
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
      visible={renamePrompt !== null}
      oldIdentity={renamePrompt?.oldIdentity ?? { district: "", block: "", poleId: "" }}
      newIdentity={renamePrompt?.newIdentity ?? { district: "", block: "", poleId: "" }}
      photoCount={renamePrompt?.photoCount ?? 0}
      onCancel={() => {
        setRenamePrompt(null);
        const resolve = renamePromptResolverRef.current;
        renamePromptResolverRef.current = null;
        if (resolve) resolve({ type: "cancelled" });
        revertIdentityToPersisted();
      }}
      onConfirm={async (renameFiles, updateReports) => {
        if (!renamePrompt) return;
        const { oldIdentity, newIdentity } = renamePrompt;
        setRenamePrompt(null);
        const resolve = renamePromptResolverRef.current;
        renamePromptResolverRef.current = null;
        if (InspectionEditSession.isActive(inspectionId)) {
          InspectionEditSession.stagePendingRename({
            oldPoleId: oldIdentity.poleId,
            newPoleId: newIdentity.poleId,
            renameFiles,
            updateReports,
            oldDistrict: oldIdentity.district,
            oldBlock: oldIdentity.block,
            newDistrict: newIdentity.district,
            newBlock: newIdentity.block,
          });
        } else if (inspectionId != null) {
          await PoleRenameService.renamePoleId(
            inspectionId,
            oldIdentity.poleId,
            newIdentity.poleId,
            { renameFiles, updateReports },
            {
              oldDistrict: oldIdentity.district,
              oldBlock: oldIdentity.block,
              newDistrict: newIdentity.district,
              newBlock: newIdentity.block,
            }
          );
        }
        if (resolve) resolve({ type: "proceed", renameFiles, updateReports });
        onDataChanged?.();
      }}
    />
  </View>
);
});

GeneralInformation.displayName = "GeneralInformation";

export default GeneralInformation;