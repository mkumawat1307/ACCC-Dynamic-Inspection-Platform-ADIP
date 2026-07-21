//frontend\app\inspection\new.tsx
import React, {
  useEffect,
  useState,
  useCallback,
} from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Alert, BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Text, List } from "react-native-paper";
import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { Project } from "@/src/models/Project";
import { useInspection } from "@/src/context/InspectionContext";
import { getCurrentInspectionDate } from "@/src/utils/date";

import {
  InspectionRepository,
  InspectionSection,
} from "@/src/database/repositories/InspectionRepository";
import GeneralInformation from "@/src/components/inspection/GeneralInformation";

export default function NewInspectionScreen() {
  const { projectId } = useLocalSearchParams<{
  projectId: string;
}>();

const {
  setProject,
  setInspectionDate,
  setInspectionId,
  poleId,
} = useInspection();

const [project, setProjectState] = useState<Project | null>(null);
const [sections, setSections] = useState<InspectionSection[]>([]);
const [expandedSections, setExpandedSections] = useState<number[]>([1]);

useEffect(() => {
  initialize();
}, []);
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

const inspectionId =
  await InspectionRepository.createInspection(
    data.ProjectID,
    data.DistrictID,
    inspectionDate
  );

setInspectionId(inspectionId);
}
  async function loadSections() {
    const data = await InspectionRepository.getSections();
    setSections(data);
  }
useEffect(() => {
  const backAction = () => {
    if (!poleId.trim()) {
      Alert.alert(
        "Pole ID Required",
        "Please enter Pole ID before leaving this inspection."
      );
      return true;
    }

    return false;
  };

  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    backAction
  );

  return () => subscription.remove();
}, [poleId]);

return (
  <SafeAreaView
    style={styles.safeArea}
    edges={["top", "bottom"]}
  >
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

        {section.SectionName === "General Information" && (
          <GeneralInformation />
        )}

      </Card.Content>
    </List.Accordion>
  </Card>
))}
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