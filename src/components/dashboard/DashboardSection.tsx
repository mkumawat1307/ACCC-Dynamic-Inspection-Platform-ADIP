import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

interface Props {
  title: string;
}

export default function DashboardSection({ title }: Props) {
  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 12,
  },

  title: {
    fontWeight: "700",
  },
});