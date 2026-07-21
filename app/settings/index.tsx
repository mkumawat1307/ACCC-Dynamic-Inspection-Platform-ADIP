//frontend\app\settings\index.tsx
import { View } from "react-native";
import { Text } from "react-native-paper";

export default function SettingsScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text variant="headlineMedium">
        Settings
      </Text>
    </View>
  );
}