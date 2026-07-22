//frontend\app\inspection\new.tsx
import React, {
  useEffect,
  useState
} from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Alert,
  BackHandler,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Text,
  List,
  Appbar,
  Button,
} from "react-native-paper";
import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { Project } from "@/src/models/Project";
import { useInspection } from "@/src/context/InspectionContext";
import { getCurrentInspectionDate } from "@/src/utils/date";
import DynamicSection from "@/src/components/inspection/DynamicSection";
import {
  InspectionRepository,
  InspectionSection,
} from "@/src/database/repositories/InspectionRepository";

export default function NewInspectionScreen() {
  const router = useRouter();
const { projectId, inspectionId: routeInspectionId } =
  useLocalSearchParams<{
    projectId: string;
    inspectionId?: string;
  }>();

const {
  setProject,
  setInspectionDate,
  setInspectionId,
  inspectionId,
} = useInspection();

const [project, setProjectState] = useState<Project | null>(null);
const [sections, setSections] = useState<InspectionSection[]>([]);
const [expandedSections, setExpandedSections] = useState<number[]>([1]);

const validateBeforeExit = async (): Promise<boolean> => {
  if (!inspectionId) return true;

  const result =
    await InspectionRepository.validateInspection(
      inspectionId
    );

  if (!result.valid) {
    Alert.alert(
      "Inspection Incomplete",
      "Please complete the following:\n\n• " +
        result.missingFields.join("\n• ")
    );
    return false;
  }

  return true;
};

useEffect(() => {
  initialize();
}, []);

useEffect(() => {
  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    () => {
      validateBeforeExit().then((ok) => {
        if (ok) {
          router.back();
        }
      });

      return true;
    }
  );

  return () => subscription.remove();
}, [inspectionId, router]);

async function initialize() {
  await loadProject();
  await loadSections();
}
async function loadProject() {
  if (!projectId) return;

  const data = await ProjectRepository.getProjectById(
    Number(projectId)
  );

  if (!data) return;

setProjectState(data);

setProject(data);

const inspectionDate = getCurrentInspectionDate();

setInspectionDate(inspectionDate);

if (routeInspectionId) {

  // Editing existing inspection
  setInspectionId(Number(routeInspectionId));

} else {

  // Creating new inspection
  const newInspectionId =
    await InspectionRepository.createInspection(
      data.ProjectID,
      data.DistrictID,
      inspectionDate
    );

  console.log(
    "NEW INSPECTION CREATED:",
    newInspectionId
  );

  setInspectionId(newInspectionId);
}
}
  async function loadSections() {
    const data = await InspectionRepository.getSections();
    setSections(data);
  }

const handleBack = async () => {
  const ok = await validateBeforeExit();

  if (ok) {
    router.back();
  }
};

const handleSave = async () => {
  if (!inspectionId) return;

  const result =
    await InspectionRepository.validateInspection(
      inspectionId
    );

  if (!result.valid) {
    Alert.alert(
      "Inspection Incomplete",
      "Please complete the following:\n\n• " +
        result.missingFields.join("\n• ")
    );
    return;
  }

  await InspectionRepository.updateInspectionStatus(
    inspectionId,
    "Incomplete"
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

              console.log(
                "Draft inspection deleted:",
                inspectionId
              );
            }

            router.back();

          } catch (error) {

            console.error(
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
    edges={["top", "bottom"]}
  >
  <Appbar.Header>
    <Appbar.BackAction onPress={handleBack} />
    <Appbar.Content title="New Inspection" />
  </Appbar.Header>
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text variant="headlineMedium" style={styles.title}>
        New Inspection
      </Text>

{sections.map((section) => (
  <Card
    key={section.SectionID}
    style={styles.card}
  >
    <List.Accordion
      title={section.SectionName}
      expanded={expandedSections.includes(section.SectionID)}
      onPress={() => {
        setExpandedSections((prev) => {
          if (prev.includes(section.SectionID)) {
            return prev.filter((id) => id !== section.SectionID);
          }

          return [...prev, section.SectionID];
        });
      }}
      titleStyle={styles.sectionTitle}
    >
      <Card.Content>

    <DynamicSection
        sectionId={section.SectionID}
        inspectionId={inspectionId!}
    />

      </Card.Content>
    </List.Accordion>
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
    style={{
      flex: 1,
      marginLeft: 8,
    }}
  >
    Save
  </Button>

</View>
    </ScrollView>
  </SafeAreaView>
);

}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  title: {
    marginBottom: 20,
    fontWeight: "700",
  },

  card: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
  },

  sectionTitle: {
    fontWeight: "700",
    color: "#1976D2",
  },
});