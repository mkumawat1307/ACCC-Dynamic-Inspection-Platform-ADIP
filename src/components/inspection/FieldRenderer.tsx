import React from "react";
import {
  StyleSheet,
  Alert,
  Pressable,
  View,
} from "react-native";
import { TextInput } from "react-native-paper";

export interface FieldRendererProps {
  fieldName: string;
  fieldType: string;
  required?: boolean;
  value?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  showLockedMessage?: boolean;
}

export default function FieldRenderer({
  fieldName,
  fieldType,
  required = false,
  value = "",
  editable = true,
  showLockedMessage = false,
  onChange,
}: FieldRendererProps) {

  const input = (
    <TextInput
      mode="outlined"
      label={required ? `${fieldName} *` : fieldName}
      value={value}
      editable={editable}
      onChangeText={onChange}
      style={styles.input}
      outlineStyle={styles.outline}
      contentStyle={styles.content}
      dense
      keyboardType={
        fieldType === "NUMBER"
          ? "numeric"
          : "default"
      }
    />
  );

  // Editable field
if (editable || !showLockedMessage) {
  return input;
}

  // Locked field
  return (
    <Pressable
      onPress={() =>
        Alert.alert(
          "Pole ID Required",
          "Please enter Pole ID first before filling the inspection details."
        )
      }
    >
      <View pointerEvents="none">
        {input}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },

  outline: {
    borderRadius: 10,
  },

  content: {
    paddingVertical: 8,
  },
});