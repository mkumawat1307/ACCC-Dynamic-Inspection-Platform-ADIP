import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text, Button } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Project } from "@/src/models/Project";

interface Props {
  project: Project;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export default function ProjectCard({
  project,
  onOpen,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
}: Props) {
  return (
    <Card style={styles.card}>
      <Card.Content>

        <View style={styles.header}>
          <MaterialCommunityIcons
            name="folder"
            size={28}
            color="#1976D2"
          />

          <Text variant="titleMedium" style={styles.title}>
            {project.ProjectName}
          </Text>
        </View>

        <Text style={styles.text}>
          District : {project.DistrictName}
        </Text>

        {project.Block ? (
          <Text style={styles.text}>
            Block : {project.Block}
          </Text>
        ) : null}

        {project.Client ? (
          <Text style={styles.text}>
            Client : {project.Client}
          </Text>
        ) : null}

        <Text style={styles.created}>
          Created :{" "}
          {new Date(project.CreatedAt).toLocaleDateString()}
        </Text>

      </Card.Content>

      <Card.Actions style={styles.actions}>
        <Button onPress={onOpen}>Open</Button>

        <Button onPress={onEdit}>Edit</Button>

        <Button onPress={onDuplicate}>Duplicate</Button>

        <Button onPress={onExport}>Export</Button>

        <Button textColor="red" onPress={onDelete}>
          Delete
        </Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  title: {
    marginLeft: 10,
    fontWeight: "bold",
  },

  text: {
    marginBottom: 4,
  },

  created: {
    marginTop: 10,
    color: "#666",
  },

  actions: {
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
});