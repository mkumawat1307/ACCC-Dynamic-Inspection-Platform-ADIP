//frontend\app\inspection\new.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ScrollView,
  Alert,
  BackHandler,
  View,
} from "react-native";
import { styles } from "@/src/components/app/inspection/new.styles";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Text,
  List,
  Appbar,
  Button,
} from "react-native-paper";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { Project } from "@/src/models/Project";
import { useInspection } from "@/src/context/InspectionContext";
import { usePhotosProcessing } from "@/src/context/PhotoStatesContext";
import {
  InspectionScrollProvider,
  useInspectionScroll,
  keyboardBottomInset,
  FOCUS_PADDING,
} from "@/src/context/InspectionScrollContext";
import { getCurrentInspectionDate } from "@/src/utils/date";
import SectionRenderer from "@/src/components/inspection/SectionRenderer";
import GeneralInformation, { type GeneralInformationHandle } from "@/src/components/inspection/GeneralInformation";
import {
  measureSectionInWindow,
} from "@/src/components/inspection/sectionAutoScroll";
import { SectionScrollCoordinator } from "@/src/components/inspection/sectionScrollCoordinator";
import {
  handleScrollEvent,
  handleScrollBeginDrag,
  pressSection,
  ScrollOrchestrationHandlers,
} from "@/src/components/inspection/scrollOrchestration";

import { logger } from "@/src/utils/logger";
import {
  cancelPendingOpen,
  notifyScrollOffset,
  SCROLL_TOLERANCE,
} from "@/src/components/inspection/dropdownScrollGate";
import { getDatabase } from "@/src/database/db";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";
import { DeviceRecordsRepository } from "@/src/database/repositories/DeviceRecordsRepository";
import { InspectionEditSession } from "@/src/database/repositories/InspectionEditSession";
import { InspectionLiveValues } from "@/src/database/repositories/InspectionLiveValues";
import { InspectionSection } from "@/src/database/repositories/InspectionTypes";
import { validatePhotosForSave } from "@/src/components/inspection/photoUtils";
import { useProjectActivation } from "@/src/hooks/useProjectActivation";
import useInspectionProgress from "@/src/hooks/useInspectionProgress";
import InspectionSectionProgress from "@/src/components/inspection/InspectionSectionProgress";
import OverallProgressCard from "@/src/components/inspection/OverallProgressCard";
import type { InspectionSectionProgress as InspectionSectionProgressData } from "@/src/database/repositories/InspectionProgressService";

// On Android the window shrinks when the keyboard opens (adjustResize) but the
// ScrollView is NOT given any extra bottom scroll height automatically. A field
// sitting near the bottom of the content (e.g. Remarks) then cannot be scrolled
// high enough above the keyboard because the scroll hits the content's max
// offset. This wrapper adds a bottom inset that exists only while the keyboard
// is visible, giving the ScrollView the room to move the focused field fully
// above the keyboard without leaving empty space when the keyboard is closed.
function ScrollContents({ children }: { children: React.ReactNode }) {
  const { keyboardHeight } = useInspectionScroll();
  const bottomInset = keyboardBottomInset(keyboardHeight ?? 0, FOCUS_PADDING);
  return (
    <View style={bottomInset > 0 ? { paddingBottom: bottomInset } : undefined}>
      {children}
    </View>
  );
}

export default function NewInspectionScreen({
  title = "New Inspection",
}: {
  title?: string;
}) {
  const router = useRouter();
  const initDoneRef = useRef(false);
  const backInFlightRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const scrollViewTopRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const scrollContentHeightRef = useRef(0);
  const sectionRefs = useRef<Map<number, View>>(new Map());
  const expandedSectionsRef = useRef<number[]>([1]);
  const sectionScrollCoordinatorRef = useRef<SectionScrollCoordinator | null>(null);
  const createdDraftIdRef = useRef<number | null>(null);
  const creatingDraftRef = useRef<Promise<number | null> | null>(null);
  const inspectionIdRef = useRef<number | null>(null);
  const hydratedInspectionIdRef = useRef<number | null>(null);
  if (!sectionScrollCoordinatorRef.current) {
    sectionScrollCoordinatorRef.current = new SectionScrollCoordinator({
      isExpanded: (sectionId) => expandedSectionsRef.current.includes(sectionId),
      measureSection: (sectionId, generation, onMeasured) => {
        const ref = sectionRefs.current.get(sectionId);
        if (!ref || !scrollViewRef.current) {
          return;
        }
        measureSectionInWindow(
          ref,
          scrollViewRef,
          scrollViewTopRef.current,
          scrollViewHeightRef.current,
          scrollOffsetRef.current,
          undefined,
          onMeasured
        );
      },
      scrollToSection: (sectionId, target) => {
        scrollViewRef.current?.scrollTo({ x: 0, y: target, animated: true });
      },
    });
  }
  const scrollOrchestrationRef = useRef<ScrollOrchestrationHandlers | null>(null);
  const generalInfoRef = useRef<GeneralInformationHandle>(null);
  if (!scrollOrchestrationRef.current) {
    scrollOrchestrationRef.current = {
      coordinator: sectionScrollCoordinatorRef.current,
      cancelPendingOpen,
      notifyScrollOffset,
      tolerance: SCROLL_TOLERANCE,
    };
  }
  const { projectId, inspectionId: routeInspectionId, projectData: projectDataJson } =
  useLocalSearchParams<{
    projectId: string;
    inspectionId?: string;
    projectData?: string;
  }>();

  const {
    project: contextProject,
    setProject,
    setInspectionDate,
    setInspectionId,
    inspectionId,
    setPoleId,
    poleId,
    getPhotoStates,
  } = useInspection();
  inspectionIdRef.current = inspectionId;

  const resolvedProject = useMemo<Project | null>(() => {
    if (projectDataJson) {
      try {
        const parsed = JSON.parse(projectDataJson);
        if (
          parsed &&
          typeof parsed.ProjectID === "number" &&
          typeof parsed.ProjectName === "string"
        ) {
          return parsed as Project;
        }
      } catch {
      }
    }
    if (
      contextProject &&
      contextProject.ProjectID === Number(projectId)
    ) {
      return contextProject;
    }
    return null;
  }, [projectDataJson, contextProject, projectId]);

  const { ready, error: activationError } = useProjectActivation(resolvedProject);

  const photosProcessing = usePhotosProcessing();

  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [expandedSections, setExpandedSections] = useState<number[]>([1]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<number>(1);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const bumpProgress = useCallback(() => {
    setProgressRefreshKey((key) => key + 1);
  }, []);
  const inspectionProgress = useInspectionProgress(
    inspectionId,
    defaultTemplateId,
    progressRefreshKey
  );

  const progressByKey = useMemo(() => {
    const map = new Map<string, InspectionSectionProgressData>();
    for (const entry of inspectionProgress?.sections ?? []) {
      map.set(entry.key, entry);
    }
    return map;
  }, [inspectionProgress?.sections]);

  useEffect(() => {
    expandedSectionsRef.current = expandedSections;
  }, [expandedSections]);

  // Apply configured "Default Selection" field values as soon as an inspection
  // id exists (new draft created, or existing inspection loaded), independent
  // of whether any section has been expanded. Only fields with an enabled
  // Default Selection receive a value; existing saved values always win. Runs
  // once per inspection id (idempotent). See InspectionFieldRepository.
  useEffect(() => {
    // Only apply the configured defaults for the inspection THIS screen owns.
    // During the load window the context inspectionId can still hold the
    // previously-opened inspection; applying defaults to it (existing=false)
    // would leak the template's default selections into an unrelated record.
    const ownedInspectionId = routeInspectionId
      ? Number(routeInspectionId)
      : createdDraftIdRef.current;
    if (inspectionId == null || inspectionId !== ownedInspectionId) return;
    if (hydratedInspectionIdRef.current === inspectionId) return;
    hydratedInspectionIdRef.current = inspectionId;
    InspectionFieldRepository.applyDefaultSelections(
      inspectionId,
      Boolean(routeInspectionId)
    ).catch(
      (error) => {
        logger.error(
          "[new.tsx] applyDefaultSelections failed:",
          error
        );
      }
    );
  }, [inspectionId]);

  useEffect(() => {
    return () => {
      cancelPendingOpen();
      sectionScrollCoordinatorRef.current?.cancel();
      InspectionLiveValues.reset();
    };
  }, []);

  // Editing an EXISTING inspection creates an isolated edit session: every
  // field/device/Pole ID change is staged in memory and only persisted on an
  // explicit Save (commit). Back/Cancel (and unmount) discards the staged
  // edits, leaving the database untouched. NEW inspections have no session and
  // keep their current autosave behaviour.
  useEffect(() => {
    const isExisting = Boolean(routeInspectionId);
    // Bind the edit session only to the inspection this screen is actually
    // editing — never to a stale context inspectionId during the load window.
    if (
      isExisting &&
      inspectionId != null &&
      inspectionId === Number(routeInspectionId)
    ) {
      InspectionEditSession.activate(inspectionId);
    } else {
      InspectionEditSession.discard();
    }
    return () => {
      InspectionEditSession.discard();
    };
  }, [inspectionId, routeInspectionId]);

  function handleSectionPress(sectionId: number) {
    const coordinator = sectionScrollCoordinatorRef.current;
    pressSection(coordinator, cancelPendingOpen, sectionId);
    const isExpanding = !expandedSectionsRef.current.includes(sectionId);
    const next = isExpanding
      ? [...expandedSectionsRef.current, sectionId]
      : expandedSectionsRef.current.filter((id) => id !== sectionId);
    expandedSectionsRef.current = next;
    setExpandedSections(next);
  }

const validateSectionsAndDevices = async (): Promise<{
  valid: boolean;
  missingFields: string[];
}> => {
  if (!inspectionId) return { valid: true, missingFields: [] };

  // 1. Flush pending device saves (cancel timers, write latest rows) -- no timer wait
  await DeviceRecordsRepository.flushPendingDeviceSaves();

  // 2. Validate sections, then devices against the flushed rows
  const sectionResult =
    await InspectionRepository.validateInspection(inspectionId);
  const deviceResult =
    await InspectionRepository.validateDeviceMandatory(inspectionId);
  const deviceTypeResult =
    await InspectionRepository.validateDeviceTypeMandatory(inspectionId);

  return {
    valid: sectionResult.valid && deviceResult.valid && deviceTypeResult.valid,
    missingFields: [...sectionResult.missingFields, ...deviceResult.missingFields, ...deviceTypeResult.missingFields],
  };
};

const validateBeforeExit = async (): Promise<boolean> => {
  if (!inspectionId) return true;

  const result = await validateSectionsAndDevices();

  if (!result.valid) {
    Alert.alert(
      "Inspection Incomplete",
      "Please complete the following:\n\n• " +
        result.missingFields.join("\n• ")
    );
    return false;
  }

  const photos =
    await PhotoRepository.getByInspection(
      inspectionId
    );

  if (photos.length < 1) {
    Alert.alert(
      "Inspection Incomplete",
      "Minimum 1 photo is required.\n\nPlease capture at least one photo in the Photos section."
    );
    return false;
  }

  // Check for duplicate Pole ID
  const currentPoleId = poleId?.trim();
  if (currentPoleId) {
    const existing = await InspectionRepository.getInspectionByPoleId(currentPoleId);
    if (existing && existing.InspectionID !== inspectionId) {
      Alert.alert(
        "Duplicate Site ID",
        `Site ID ${currentPoleId} already exists in another inspection. Please enter a unique Site ID.`
      );
      return false;
    }
  }

  return true;
};

useEffect(() => {
  if (initDoneRef.current) return;
  if (!ready) return;
  initDoneRef.current = true;
  initialize();
  return () => {
    initDoneRef.current = false;
  };
}, [projectId, routeInspectionId, ready]);

useEffect(() => {
  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    () => {
      if (backInFlightRef.current) return true;
      backInFlightRef.current = true;
      validateBeforeExit()
        .then((ok) => {
          if (ok) {
            router.back();
          }
        })
        .finally(() => {
          backInFlightRef.current = false;
        });

      return true;
    }
  );

  return () => subscription.remove();
}, [inspectionId, router]);

async function initialize() {
  // The live overlay is a module-level singleton; start this screen with a
  // clean slate so progress can never be computed from a previous inspection.
  InspectionLiveValues.reset();
  await loadProject();

  const db = await getDatabase();
  const tpl = await db.getFirstAsync<{ TemplateID: number }>(
    "SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1"
  );
  if (tpl) setDefaultTemplateId(tpl.TemplateID);

  const data = await InspectionRepository.getSections(
    undefined,
    routeInspectionId ? Number(routeInspectionId) : undefined
  );
  if (data.length > 0) {
    setSections(data);
  }
}

async function loadProject(): Promise<Project | null> {
  if (!projectId) return null;

  let data: Project | null = null;

  // 1. Use projectData passed via navigation params (most reliable -- no DB call needed)
  if (projectDataJson) {
    try {
      const parsed = JSON.parse(projectDataJson);
      if (parsed && typeof parsed.ProjectID === "number" && typeof parsed.ProjectName === "string") {
        data = parsed as Project;
      }
    } catch {
      // fall through
    }
  }

  // 2. Use context (may not have propagated yet due to React batching)
  if (!data && contextProject && contextProject.ProjectID === Number(projectId)) {
    data = contextProject;
  }

  // 3. NEVER call getProjectById() -- it calls getGlobalDatabase() which corrupts
  //    the native handle on Android when the project DB is active.

  if (!data) {
    logger.error("[new.tsx] No project data available -- check navigation params");
    return null;
  }

setProject(data);

const inspectionDate = getCurrentInspectionDate();

setInspectionDate(inspectionDate);

if (routeInspectionId) {

  // Editing existing inspection
  setInspectionId(Number(routeInspectionId));

} else {

  // Creating new inspection — do NOT create a Draft row yet.
  // Lazy draft creation happens only once the entered Site ID passes
  // duplicate validation (see createDraftInspection). Until then
  // inspectionId stays null so no orphan draft is left behind if the
  // user backs out or jumps to an existing inspection.
  setPoleId("");
  setInspectionId(null);
  createdDraftIdRef.current = null;
}

return data;
}

const createDraftInspection = async (): Promise<number | null> => {
  // Editing an existing inspection — its row already exists.
  if (routeInspectionId) return Number(routeInspectionId);

  // Reuse an already-created session draft.
  if (createdDraftIdRef.current != null) return createdDraftIdRef.current;

  // Guard against concurrent creation (debounced saves can overlap).
  if (creatingDraftRef.current) return creatingDraftRef.current;

  const create = (async () => {
    const data = projectDataJson
      ? (JSON.parse(projectDataJson) as Project)
      : contextProject;
    if (!data) {
      logger.error("[new.tsx] createDraftInspection — no project data");
      return null;
    }
    const newId = await InspectionRepository.createInspection(
      data.ProjectID,
      data.DistrictID,
      getCurrentInspectionDate()
    );
    createdDraftIdRef.current = newId;
    setInspectionId(newId);
    return newId;
  })();

  creatingDraftRef.current = create;
  try {
    return (await create) ?? createdDraftIdRef.current;
  } finally {
    creatingDraftRef.current = null;
  }
};

const releaseAbandonedDraft = async (): Promise<void> => {
  // Editing an existing inspection — never delete the existing row.
  if (routeInspectionId) return;

  const draftId = createdDraftIdRef.current;
  createdDraftIdRef.current = null;
  if (draftId == null) return;

  try {
    await InspectionRepository.deleteInspection(draftId);
  } catch (error) {
    logger.error("[new.tsx] releaseAbandonedDraft — delete failed:", error);
  }
};

const handleBack = async () => {
  const ok = await validateBeforeExit();

  if (ok) {
    router.back();
  }
};

const handleSave = async () => {
  if (!inspectionId) return;

  const isExisting = Boolean(routeInspectionId);

  const result = await validateSectionsAndDevices();

  if (!result.valid) {
    Alert.alert(
      "Inspection Incomplete",
      "Please complete the following:\n\n• " +
        result.missingFields.join("\n• ")
    );
    return;
  }

  const photos =
    await PhotoRepository.getByInspection(
      inspectionId
    );

  const photoValidation = validatePhotosForSave(photos, getPhotoStates());

  if (!photoValidation.canSave) {
    const message = getPhotoBlockMessage(photoValidation.reason);
    Alert.alert("Inspection Incomplete", message);
    return;
  }

  // Persist all staged edits (field values, Pole ID, device records) for an
  // existing inspection. This is the explicit Save boundary — nothing is
  // written to the database until this point, and only a fully valid Save
  // deactivates the edit session.
  const decision = await generalInfoRef.current?.confirmIdentityRename();
  if (decision?.type === "duplicate") {
    Alert.alert(
      "Duplicate Site ID",
      `Site ID ${decision.duplicatePoleId} already exists in another inspection. Please enter a unique Site ID.`
    );
    return;
  }
  if (decision?.type === "cancelled") {
    return;
  }

  if (isExisting) {
    const committed = await InspectionEditSession.commit();
    if (!committed) {
      Alert.alert(
        "Duplicate Site ID",
        "Site ID already exists in another inspection. Please enter a unique Site ID."
      );
      return;
    }
  }

  await InspectionRepository.updateInspectionStatus(
    inspectionId,
    "Completed"
  );

  Alert.alert(
    "Success",
    "Inspection saved successfully.",
    [
      {
        text: "OK",
        onPress: () => router.back(),
      },
    ]
  );
};

function getPhotoBlockMessage(reason: string | null): string {
  switch (reason) {
    case "processing":
    case "pending":
    case "unprocessed":
      return "Photos are still being processed.\n\nPlease wait for watermarking to complete before saving.";
    case "failed":
      return "One or more photos failed to process.\n\nPlease retry or remove the failed photos before saving.";
    default:
      return "Minimum 1 photo is required.\n\nPlease capture at least one photo in the Photos section.";
  }
}

const handleCancel = () => {

  Alert.alert(
    "Cancel Inspection",
    "Are you sure you want to cancel this inspection?",
    [
      {
        text: "No",
        style: "cancel",
      },
      {
        text: "Yes",
        style: "destructive",
        onPress: async () => {

          try {

            // Only delete if this is a NEW inspection
            if (!routeInspectionId && inspectionId) {

              await InspectionRepository.deleteInspection(
                inspectionId
              );
              createdDraftIdRef.current = null;
            }

            router.back();

          } catch (error) {

            logger.error(
              "Cancel Error:",
              error
            );

            Alert.alert(
              "Error",
              "Unable to cancel inspection."
            );

          }

        },
      },
    ]
  );

};

if (activationError) {
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["left", "right", "bottom"]}
    >
      <Appbar.Header>
        <Appbar.BackAction onPress={handleBack} />
        <Appbar.Content title={title} />
      </Appbar.Header>
      <Text variant="bodyMedium" style={{ textAlign: "center", marginTop: 40, color: "#666" }}>
        Project not found.
      </Text>
    </SafeAreaView>
  );
}

return (
  <SafeAreaView
    style={styles.safeArea}
    edges={["left", "right", "bottom"]}
  >
  <Appbar.Header>
    <Appbar.BackAction onPress={handleBack} />
    <Appbar.Content title={title} />
  </Appbar.Header>
  <InspectionScrollProvider
    scrollViewRef={scrollViewRef}
    scrollOffsetRef={scrollOffsetRef}
    scrollViewTopRef={scrollViewTopRef}
    scrollViewHeightRef={scrollViewHeightRef}
    scrollContentHeightRef={scrollContentHeightRef}
    setDropdownOpen={setDropdownOpen}
  >
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets
      scrollEnabled={!dropdownOpen}
      onLayout={(event) => {
        scrollViewTopRef.current = event.nativeEvent.layout.y;
        scrollViewHeightRef.current = event.nativeEvent.layout.height;
      }}
      onContentSizeChange={(width, height) => {
        scrollContentHeightRef.current = height;
      }}
      onScroll={(event) => {
        const offset = event.nativeEvent.contentOffset.y;
        scrollOffsetRef.current = offset;
        const orchestration = scrollOrchestrationRef.current;
        if (orchestration) {
          handleScrollEvent(orchestration, offset);
        }
      }}
      onScrollBeginDrag={(event) => {
        const orchestration = scrollOrchestrationRef.current;
        if (orchestration) {
          handleScrollBeginDrag(orchestration, event.nativeEvent.contentOffset.y);
        }
      }}
      scrollEventThrottle={16}
    >
      <ScrollContents>
      <Text variant="headlineMedium" style={styles.title}>
        {title}
      </Text>

{inspectionProgress != null && (
  <OverallProgressCard progress={inspectionProgress} />
)}

{sections.map((section) => (
  <Card
    key={section.SectionID}
    style={styles.card}
  >
    <View
      ref={(ref) => { if (ref) sectionRefs.current.set(section.SectionID, ref); }}
      onLayout={(event) => {
        const coordinator = sectionScrollCoordinatorRef.current;
        coordinator?.notifyLayout(section.SectionID);
      }}
    >
      <List.Accordion
        title={section.IsActive === 0 ? `Deleted ${section.SectionName}` : section.SectionName}
        titleNumberOfLines={2}
        expanded={expandedSections.includes(section.SectionID)}
        onPress={() => handleSectionPress(section.SectionID)}
        titleStyle={styles.sectionTitle}
        style={styles.accordionHeader}
        right={({ isExpanded }) => (
          <InspectionSectionProgress
            progress={progressByKey.get(section.SectionKey ?? "")}
            expanded={isExpanded}
          />
        )}
      >
        <Card.Content>
    {section.SectionKey === "general_information" ? (
      <GeneralInformation
        ref={generalInfoRef}
        ensureDraft={createDraftInspection}
        releaseAbandonedDraft={releaseAbandonedDraft}
        existing={Boolean(routeInspectionId)}
        onDataChanged={bumpProgress}
      />
    ) : inspectionId ? (
      <SectionRenderer
        sectionId={section.SectionID}
        inspectionId={inspectionId}
        sectionKey={section.SectionKey}
        templateId={defaultTemplateId}
        existing={Boolean(routeInspectionId)}
        onDataChanged={bumpProgress}
        progress={progressByKey.get(section.SectionKey ?? "") ?? null}
      />
    ) : (
      <Text variant="bodyMedium" style={styles.lockedNotice}>
        Enter a unique Site ID above to enable this section.
      </Text>
    )}
        </Card.Content>
      </List.Accordion>
    </View>
  </Card>
))}

<View
  style={{
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 30,
  }}
>

  <Button
    mode="outlined"
    icon="close"
    onPress={handleCancel}
    style={{
      flex: 1,
      marginRight: 8,
    }}
  >
    Cancel
  </Button>

  <Button
    mode="contained"
    icon="content-save"
    onPress={handleSave}
    disabled={photosProcessing}
    style={{
      flex: 1,
      marginLeft: 8,
    }}
  >
    {photosProcessing ? "Processing Photos..." : "Save"}
  </Button>

</View>
      </ScrollContents>
      </ScrollView>
    </InspectionScrollProvider>
  </SafeAreaView>
);

}


