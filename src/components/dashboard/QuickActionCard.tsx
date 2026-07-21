import { StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, Text } from "react-native-paper";

interface Props {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}

export default function QuickActionCard({
  title,
  icon,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.wrapper}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Card style={styles.card} mode="contained">
        <Card.Content style={styles.content}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons
              name={icon}
              size={34}
              color="#0B5ED7"
            />
          </View>

          <Text
            variant="bodyMedium"
            style={styles.title}
          >
            {title}
          </Text>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    marginHorizontal: 6,
  },

  card: {
    borderRadius: 16,
  },

  content: {
    alignItems: "center",
    justifyContent: "center",
    height: 110,
  },

  iconContainer: {
    marginBottom: 10,
  },

  title: {
    textAlign: "center",
    fontWeight: "600",
  },
});