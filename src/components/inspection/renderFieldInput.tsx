import React from "react";
import { StyleSheet, View } from "react-native";
import { Checkbox, Switch, Text, TextInput } from "react-native-paper";
import { Dropdown } from "react-native-element-dropdown";

export interface DropdownOption {
  label: string;
  value: string;
}

export function renderInput(params: {
  fieldType: string;
  label: string;
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
}) {
  const {
    fieldType, label, value, editable, placeholder, error, options, fieldKey,
    onCameraCountChange, onSwitchCountChange, onChange,
    dropdownFocus, setDropdownFocus,
  } = params;

  const isCameraCount = fieldKey === "camera_count";
  const isSwitchCount = fieldKey === "switch_count";

  function updateNumber(text: string) {
    const onlyNumbers = text.replace(/[^0-9]/g, "");
    onChange?.(onlyNumbers);
    const count = Number(onlyNumbers || "0");
    if (isCameraCount) onCameraCountChange?.(count);
    if (isSwitchCount) onSwitchCountChange?.(count);
  }

  switch (fieldType.toUpperCase()) {

    case "TEXT":

      return (

        <TextInput
          mode="outlined"
          label={label}
          value={value}
          editable={editable}
          placeholder={placeholder}
          error={!!error}
          onChangeText={onChange}
          style={styles.input}
          outlineStyle={styles.outline}
          contentStyle={styles.content}
          dense
        />

      );

    case "NUMBER":

      return (

        <TextInput
          mode="outlined"
          label={label}
          value={value}
          editable={editable}
          placeholder={placeholder}
          keyboardType="numeric"
          error={!!error}
          onChangeText={updateNumber}
          style={styles.input}
          outlineStyle={styles.outline}
          contentStyle={styles.content}
          dense
        />

      );

    case "MULTILINE":

      return (

        <TextInput
          mode="outlined"
          label={label}
          value={value}
          editable={editable}
          placeholder={placeholder}
          multiline
          numberOfLines={4}
          error={!!error}
          onChangeText={onChange}
          style={styles.input}
          outlineStyle={styles.outline}
        />

      );

    case "DATE_AUTO":

      return (

        <TextInput
          mode="outlined"
          label={label}
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
          dense
        />

      );

    case "DATE":

      return (

        <TextInput
          mode="outlined"
          label={label}
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
          dense
        />

      );

    case "TIME":

      return (

        <TextInput
          mode="outlined"
          label={label}
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
          dense
        />

      );
            case "DROPDOWN":

    case "PROJECT_DROPDOWN":

      return (

        <View>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Dropdown
            style={[
              styles.dropdown,
              dropdownFocus && styles.dropdownFocus,
              !editable && styles.dropdownDisabled,
            ]}
            placeholderStyle={styles.placeholderStyle}
            selectedTextStyle={styles.selectedTextStyle}
            inputSearchStyle={styles.searchInputStyle}
            iconStyle={styles.iconStyle}
            data={options}
            search
            maxHeight={350}
            labelField="label"
            valueField="value"
            placeholder={
              placeholder || "Select"
            }
            searchPlaceholder="Search..."
            value={value}
            disable={!editable}
            onFocus={() =>
              setDropdownFocus(true)
            }
            onBlur={() =>
              setDropdownFocus(false)
            }
            onChange={(item) => {

              setDropdownFocus(false);

              onChange?.(
                item.value
              );

            }}
          />
        </View>

      );

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
          label={label}
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
            label={label}
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

        <TextInput
          mode="outlined"
          label={label}
          value={value}
          editable={editable}
          placeholder={placeholder}
          error={!!error}
          onChangeText={onChange}
          style={styles.input}
          outlineStyle={styles.outline}
          contentStyle={styles.content}
          dense
        />

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

});
