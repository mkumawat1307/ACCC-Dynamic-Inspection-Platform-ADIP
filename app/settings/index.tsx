import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Divider, List } from "react-native-paper";
import { useRouter } from "expo-router";

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Inspection Settings" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>

        <List.Section>
          <List.Subheader>Inspection Template</List.Subheader>

          <List.Item
            title="Templates"
            description="Manage inspection templates"
            left={(props) => (
              <List.Icon {...props} icon="file-document-edit" />
            )}
            right={(props) => (
              <List.Icon {...props} icon="chevron-right" />
            )}
            onPress={() => {}}
          />

          <Divider />

          <List.Item
            title="Sections"
            description="Manage inspection sections"
            left={(props) => (
              <List.Icon {...props} icon="view-list" />
            )}
            right={(props) => (
              <List.Icon {...props} icon="chevron-right" />
            )}
            onPress={() => router.push("/settings/sections")}
          />

          <Divider />

          <List.Item
            title="Fields"
            description="Manage dynamic fields"
            left={(props) => (
              <List.Icon {...props} icon="form-select" />
            )}
            right={(props) => (
              <List.Icon {...props} icon="chevron-right" />
            )}
            onPress={() => {}}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>Master Data</List.Subheader>

          <List.Item
            title="Dropdown Lists"
            description="Camera types, pole types, etc."
            left={(props) => (
              <List.Icon {...props} icon="format-list-bulleted" />
            )}
          />

          <Divider />

          <List.Item
            title="Reports"
            description="Configure report layouts"
            left={(props) => (
              <List.Icon {...props} icon="file-chart" />
            )}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>Data</List.Subheader>

          <List.Item
            title="Import"
            description="Import templates"
            left={(props) => (
              <List.Icon {...props} icon="database-import" />
            )}
          />

          <Divider />

          <List.Item
            title="Export"
            description="Backup templates"
            left={(props) => (
              <List.Icon {...props} icon="database-export" />
            )}
          />
        </List.Section>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },

  content: {
    paddingBottom: 30,
  },
});