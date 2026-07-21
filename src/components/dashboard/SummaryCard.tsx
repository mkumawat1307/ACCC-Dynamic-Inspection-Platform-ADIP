import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

interface Props {
  title: string;
  value: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

export default function SummaryCard({
  title,
  value,
  icon,
}: Props) {
  return (
    <Card style={styles.card} mode="contained">
      <Card.Content>

        <View style={styles.header}>
          <MaterialCommunityIcons
            name={icon}
            size={28}
            color="#0B5ED7"
          />

          <Text style={styles.title}>
            {title}
          </Text>
        </View>

        <Text style={styles.value}>
          {value}
        </Text>

      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: 6,
    borderRadius: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
  },

  title: {
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },

  value: {
    marginTop: 16,
    fontSize: 28,
    fontWeight: "700",
  },
});