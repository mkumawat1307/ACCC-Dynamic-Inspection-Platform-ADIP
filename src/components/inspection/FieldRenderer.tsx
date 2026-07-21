import React from "react";
import { StyleSheet } from "react-native";
import { TextInput } from "react-native-paper";

export interface FieldRendererProps {
  fieldName: string;
  fieldType: string;
  required?: boolean;
  value?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}

export default function FieldRenderer({
  fieldName,
  fieldType,
  required = false,
  value = "",
  editable = true,
  onChange,
}: FieldRendererProps) {
  const commonProps = {
    mode: "outlined" as const,
    label: required ? `${fieldName} *` : fieldName,
    value,
    editable,
    onChangeText: onChange,
    style: styles.input,
    outlineStyle: styles.outline,
    contentStyle: styles.content,
    dense: true,
  };

  switch (fieldType) {
    case "NUMBER":
      return (
        <TextInput
          {...commonProps}
          keyboardType="numeric"
        />
      );

    case "TEXT":
    default:
      return (
        <TextInput
          {...commonProps}
        />
      );
  }
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