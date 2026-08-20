//frontend\app\inspection\new.tsx
import React, {
  useEffect,
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
import { InspectionScrollProvider } from "@/src/context/InspectionScrollContext";
import { getCurrentInspectionDate } from "@/src/utils/date";
import SectionRenderer from "@/src/components/inspection/SectionRenderer";
import GeneralInformation from "@/src/components/inspection/GeneralInformation";
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
import { DeviceRecordsRepository } from "@/src/database/repositories/DeviceRecordsRepository";
import { InspectionSection } from "@/src/database/repositories/InspectionTypes";
import { validatePhotosForSave } from "@/src/components/inspection/photoUtils";

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
  const sectionRefs = useRef<Map<number, View>>(new Map());
  const expandedSectionsRef = useRef<number[]>([1]);
  const sectionScrollCoordinatorRef = useRef<SectionScrollCoordinator | null>(null);
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
    getPhotoStates,
  } = useInspection();

  const photosProcessing = usePhotosProcessing();

  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [expandedSections, setExpandedSections] = useState<number[]>([1]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<number>(1);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    expandedSectionsRef.current = expandedSections;
  }, [expandedSections]);

  useEffect(() => {
    return () => {
      cancelPendingOpen();
      sectionScrollCoordinatorRef.current?.cancel();
    };
  }, []);

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

  return {
    valid: sectionResult.valid && deviceResult.valid,
    missingFields: [...sectionResult.missingFields, ...deviceResult.missingFields],
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

  return true;
};

useEffect(() => {
  if (initDoneRef.current) return;
  initDoneRef.current = true;
  initialize();
  return () => {
    initDoneRef.current = false;
  };
}, [projectId, routeInspectionId]);

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
  await loadProject();

  const db = await getDatabase();
  const tpl = await db.getFirstAsync<{ TemplateID: number }>(
    "SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1"
  );
  if (tpl) setDefaultTemplateId(tpl.TemplateID);

  const data = await InspectionRepository.getSections();
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

  // Creating new inspection
  setPoleId("");
  const newInspectionId =
    await InspectionRepository.createInspection(
      data.ProjectID,
      data.DistrictID,
      inspectionDate
    );

  logger.info(
    "NEW INSPECTION CREATED:",
    newInspectionId
  );

  setInspectionId(newInspectionId);
}

return data;
}

const handleBack = async () => {
  const ok = await validateBeforeExit();

  if (ok) {
    router.back();
  }
};

const handleSave = async () => {
  if (!inspectionId) return;

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

              logger.info(
                "Draft inspection deleted:",
                inspectionId
              );
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

return (
  <SafeAreaView
    style={styles.safeArea}
    edges={["left", "right", "bottom"]}
  >
  <Appbar.Header>
    <Appbar.BackAction onPress={handleBack} />
    <Appbar.Content title={title} />
  </Appbar.Header>
  <InspectionScrollProvider scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} setDropdownOpen={setDropdownOpen}>
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!dropdownOpen}
      onLayout={(event) => {
        scrollViewTopRef.current = event.nativeEvent.layout.y;
        scrollViewHeightRef.current = event.nativeEvent.layout.height;
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
      <Text variant="headlineMedium" style={styles.title}>
        {title}
      </Text>

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
        title={section.SectionName}
        expanded={expandedSections.includes(section.SectionID)}
        onPress={() => handleSectionPress(section.SectionID)}
        titleStyle={styles.sectionTitle}
      >
        <Card.Content>
    {section.SectionKey === "general_information" ? (
      <GeneralInformation />
    ) : (
      <SectionRenderer
        sectionId={section.SectionID}
        inspectionId={inspectionId!}
        sectionKey={section.SectionKey}
        templateId={defaultTemplateId}
      />
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
      </ScrollView>
    </InspectionScrollProvider>
  </SafeAreaView>
);

}


