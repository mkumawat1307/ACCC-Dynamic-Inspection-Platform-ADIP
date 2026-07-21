//frontend\app\reports\index.tsx
import { View } from "react-native";
import { Text } from "react-native-paper";

export default function ReportsScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text variant="headlineMedium">
        Reports
      </Text>
    </View>
  );
}