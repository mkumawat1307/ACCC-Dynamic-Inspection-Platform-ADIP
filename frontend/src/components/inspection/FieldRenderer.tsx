import React, {
  useEffect,
  useState,
} from "react";

import {
  Alert,
  Pressable,
  View,
} from "react-native";

import { HelperText } from "react-native-paper";

import { FieldInput, DropdownOption } from "./renderFieldInput";

export interface FieldRendererProps {
  fieldKey?: string;
  fieldName: string;
  fieldType: string;
  required?: boolean;
  value?: string;
  editable?: boolean;
  placeholder?: string;
  helpText?: string;
  showLockedMessage?: boolean;
  options?: DropdownOption[];
  error?: string;
  onChange?: (value: string) => void;
  onCameraCountChange?: (count: number) => void;
  onSwitchCountChange?: (count: number) => void;
}

export default function FieldRenderer({
  fieldKey,
  fieldName,
  fieldType,
  required = false,
  value = "",
  editable = true,
  placeholder = "",
  helpText,
  showLockedMessage = false,
  options = [],
  error,
  onChange,
  onCameraCountChange,
  onSwitchCountChange,
}: FieldRendererProps) {
  const label = required ? `${fieldName} *` : fieldName;
  const [dropdownFocus, setDropdownFocus] = useState(false);

  useEffect(() => {
    if (fieldType === "DATE_AUTO" && editable && value === "") {
      const today = new Date();
      const formatted = today.toLocaleDateString("en-GB");
      onChange?.(formatted);
    }
  }, [fieldType, editable, value, onChange]);

  const control = (
    <>
      <FieldInput
        fieldType={fieldType}
        label={label}
        value={value}
        editable={editable}
        placeholder={placeholder}
        error={error}
        options={options}
        fieldKey={fieldKey}
        onCameraCountChange={onCameraCountChange}
        onSwitchCountChange={onSwitchCountChange}
        onChange={onChange}
        dropdownFocus={dropdownFocus}
        setDropdownFocus={setDropdownFocus}
      />
      {!!error && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
      {!!helpText && (
        <HelperText type="info">
          {helpText}
        </HelperText>
      )}
    </>
  );

  if (editable || !showLockedMessage) {
    return control;
  }

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
        {control}
      </View>
    </Pressable>
  );
}