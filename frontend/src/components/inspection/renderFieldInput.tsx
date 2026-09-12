import React, { useRef } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { Checkbox, Switch, Text, TextInput } from "react-native-paper";
import { sanitizeNumberInput } from "../../utils/fieldInput";
import { useInspectionScroll } from "@/src/context/InspectionScrollContext";
import { COLORS } from "@/src/constants/ui";
import DropdownField from "./DropdownField";

export function fieldLabelWithRequired(
  label: string,
  required: boolean
): string | React.ReactElement {
  if (!required) return label;
  return (
    <>
      {label}{" "}
      <Text style={styles.requiredStar}>*</Text>
    </>
  );
}

export interface DropdownOption {
  label: string;
  value: string;
}

export interface FieldInputProps {
  fieldType: string;
  label: string;
  required?: boolean;
  value: string;
  editable: boolean;
  placeholder: string;
  error?: string;
  options: DropdownOption[];
  fieldKey?: string;
  onCameraCountChange?: (count: number) => void;
  onSwitchCountChange?: (count: number) => void;
  onChange?: (value: string) => void;
  dropdownFocus: boolean;
  setDropdownFocus: (focused: boolean) => void;
}

export const FieldInput: React.FC<FieldInputProps> = ({
  fieldType, label, required = false, value, editable, placeholder, error, options, fieldKey,
  onCameraCountChange, onSwitchCountChange, onChange,
  dropdownFocus, setDropdownFocus,
}) => {
  const displayLabel = fieldLabelWithRequired(label, required);
  const isCameraCount = fieldKey === "camera_count";
  const isSwitchCount = fieldKey === "switch_count";
  const dropdownViewRef = useRef<View>(null);
  const textInputRef = useRef<View>(null);
  const { setDropdownOpen, scrollFocusedFieldIntoView } = useInspectionScroll();

  const handleTextInputFocus = () => {
    // Keep the focused input visible above the soft keyboard. On Android the
    // window shrinks (adjustResize) without re-scrolling the form, so the
    // input must be measured and moved into the visible keyboard-adjusted
    // window area explicitly.
    if (typeof scrollFocusedFieldIntoView === "function") {
      scrollFocusedFieldIntoView(textInputRef);
    }
  };

  const handleDropdownFocus = () => {
    Keyboard.dismiss();
    setDropdownFocus(true);
    setDropdownOpen(true);
    if (typeof scrollFocusedFieldIntoView === "function") {
      scrollFocusedFieldIntoView(dropdownViewRef);
    }
  };

  function updateNumber(text: string) {
    const isCount = isCameraCount || isSwitchCount;
    const clean = sanitizeNumberInput(text, { integerOnly: isCount });
    onChange?.(clean);
    const count = Number(clean || "0");
    if (isCameraCount) onCameraCountChange?.(count);
    if (isSwitchCount) onSwitchCountChange?.(count);
  }

  switch (fieldType.toUpperCase()) {

    case "TEXT":
      return (
        <View ref={textInputRef}>
          <TextInput
            mode="outlined"
            label={displayLabel}
            value={value}
            editable={editable}
            placeholder={placeholder}
            error={!!error}
            onChangeText={onChange}
            style={styles.input}
            outlineStyle={styles.outline}
            contentStyle={styles.content}
            onFocus={handleTextInputFocus}
            dense
          />
        </View>
      );

    case "NUMBER":
      return (
        <View ref={textInputRef}>
          <TextInput
            mode="outlined"
            label={displayLabel}
            value={value}
            editable={editable}
            placeholder={placeholder}
            keyboardType="decimal-pad"
            error={!!error}
            onChangeText={updateNumber}
            style={styles.input}
            outlineStyle={styles.outline}
            contentStyle={styles.content}
            onFocus={handleTextInputFocus}
            dense
          />
        </View>
      );

    case "MULTILINE":
      return (
        <View ref={textInputRef}>
          <TextInput
            mode="outlined"
            label={displayLabel}
            value={value}
            editable={editable}
            placeholder={placeholder}
            multiline
            numberOfLines={4}
            error={!!error}
            onChangeText={onChange}
            style={styles.input}
            outlineStyle={styles.outline}
            onFocus={handleTextInputFocus}
          />
        </View>
      );

    case "DATE_AUTO":
      return (
        <View ref={textInputRef}>
          <TextInput
            mode="outlined"
            label={displayLabel}
            value={value}
            editable={editable}
            placeholder="DD-MM-YYYY"
            error={!!error}
            right={
              <TextInput.Icon
                icon="calendar-check"
              />
            }
            onChangeText={onChange}
            style={styles.input}
            outlineStyle={styles.outline}
            contentStyle={styles.content}
            onFocus={handleTextInputFocus}
            dense
          />
        </View>
      );

    case "DATE":
      return (
        <View ref={textInputRef}>
          <TextInput
            mode="outlined"
            label={displayLabel}
            value={value}
            editable={editable}
            placeholder="DD-MM-YYYY"
            error={!!error}
            right={
              <TextInput.Icon
                icon="calendar"
              />
            }
            onChangeText={onChange}
            style={styles.input}
            outlineStyle={styles.outline}
            contentStyle={styles.content}
            onFocus={handleTextInputFocus}
            dense
          />
        </View>
      );

    case "TIME":
      return (
        <View ref={textInputRef}>
          <TextInput
            mode="outlined"
            label={displayLabel}
            value={value}
            editable={editable}
            placeholder="HH:MM"
            error={!!error}
            right={
              <TextInput.Icon
                icon="clock-outline"
              />
            }
            onChangeText={onChange}
            style={styles.input}
            outlineStyle={styles.outline}
            contentStyle={styles.content}
            onFocus={handleTextInputFocus}
            dense
          />
        </View>
      );

    case "DROPDOWN":
    case "PROJECT_DROPDOWN": {
      return (
        <View ref={dropdownViewRef}>
          <Text style={styles.fieldLabel}>{displayLabel}</Text>
          <DropdownField
            value={value}
            options={options}
            editable={editable}
            placeholder={placeholder || "Select"}
            maxHeight={350}
            style={[
              styles.dropdown,
              dropdownFocus && styles.dropdownFocus,
              !editable && styles.dropdownDisabled,
            ]}
            placeholderStyle={styles.placeholderStyle}
            selectedTextStyle={styles.selectedTextStyle}
            iconStyle={styles.iconStyle}
            onFocus={handleDropdownFocus}
            onBlur={() => {
              setDropdownFocus(false);
              setDropdownOpen(false);
            }}
            onChange={(dropdownValue) => {
              setDropdownFocus(false);
              setDropdownOpen(false);
              onChange?.(dropdownValue);
            }}
          />
        </View>
      );
    }

    case "SWITCH":
      return (
        <View style={styles.switchContainer}>
          <Switch
            value={value === "1"}
            disabled={!editable}
            onValueChange={(checked) =>
              onChange?.(
                checked
                  ? "1"
                  : "0"
              )
            }
          />
        </View>
      );

    case "CHECKBOX":
      return (
        <Checkbox.Item
          label={displayLabel as string}
          disabled={!editable}
          status={
            value === "1"
              ? "checked"
              : "unchecked"
          }
          onPress={() =>
            onChange?.(
              value === "1"
                ? "0"
                : "1"
            )
          }
        />
      );

    case "GPS":
      return (
        <View>
          <TextInput
            mode="outlined"
            label={displayLabel}
            value={value}
            editable={false}
            left={
              <TextInput.Icon
                icon="crosshairs-gps"
              />
            }
            placeholder="Capture GPS Location"
            style={styles.input}
            outlineStyle={styles.outline}
            contentStyle={styles.content}
            dense
          />
        </View>
      );

    default:
      return (
        <View ref={textInputRef}>
          <TextInput
            mode="outlined"
            label={displayLabel}
            value={value}
            editable={editable}
            placeholder={placeholder}
            error={!!error}
            onChangeText={onChange}
            style={styles.input}
            outlineStyle={styles.outline}
            contentStyle={styles.content}
            onFocus={handleTextInputFocus}
            dense
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#444",
    marginBottom: 4,
  },
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
  switchContainer: {
    alignItems: "flex-start",
    marginBottom: 12,
    paddingVertical: 8,
  },
  dropdown: {
    height: 56,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  dropdownFocus: {
    borderColor: "#1976D2",
  },
  dropdownDisabled: {
    backgroundColor: "#F5F5F5",
    opacity: 0.8,
  },
  placeholderStyle: {
    fontSize: 15,
    color: "#999999",
  },
  selectedTextStyle: {
    fontSize: 15,
    color: "#000000",
  },
  searchInputStyle: {
    fontSize: 15,
    borderRadius: 8,
  },
  iconStyle: {
    width: 22,
    height: 22,
  },
  requiredStar: {
    color: COLORS.error,
    fontWeight: "700",
    fontSize: 18,
  },
});