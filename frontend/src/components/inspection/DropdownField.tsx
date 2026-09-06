import React, { useMemo } from "react";
import {
  ImageStyle,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Dropdown } from "react-native-element-dropdown";

export interface DropdownFieldOption {
  label: string;
  value: string;
}

interface DropdownClearItem {
  label: string;
  value: string;
  isClear: true;
}

interface DropdownFieldProps {
  value: string | null | undefined;
  options: DropdownFieldOption[];
  editable: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
  placeholderStyle?: StyleProp<TextStyle>;
  selectedTextStyle?: StyleProp<TextStyle>;
  itemTextStyle?: StyleProp<TextStyle>;
  iconStyle?: StyleProp<ImageStyle>;
  maxHeight?: number;
  testID?: string;
}

const CLEAR_VALUE = "__dropdown_clear__";

function DropdownField({
  value,
  options,
  editable,
  placeholder,
  onChange,
  onFocus,
  onBlur,
  style,
  placeholderStyle,
  selectedTextStyle,
  itemTextStyle,
  iconStyle,
  maxHeight = 340,
  testID,
}: DropdownFieldProps) {
  const data = useMemo(() => {
    const hasSelection = value != null && value !== "";
    if (!hasSelection || !editable) {
      return options;
    }
    return [
      ...options,
      { label: "Clear selection", value: CLEAR_VALUE, isClear: true },
    ];
  }, [options, value, editable]);

  const handleSelect = (item: DropdownFieldOption) => {
    if ((item as DropdownClearItem).isClear === true) {
      onChange("");
      return;
    }
    onChange(item.value);
  };

  const renderItem = (item: DropdownFieldOption, _selected?: boolean) => {
    if ((item as DropdownClearItem).isClear === true) {
      return (
        <View style={styles.clearRow}>
          <Text numberOfLines={1} style={styles.clearLabel}>
            {item.label}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.optionRow}>
        <Text numberOfLines={1} style={[styles.optionLabel, itemTextStyle]}>
          {item.label}
        </Text>
      </View>
    );
  };

  return (
    <Dropdown
      testID={testID}
      style={style}
      placeholderStyle={placeholderStyle}
      selectedTextStyle={selectedTextStyle}
      itemTextStyle={itemTextStyle}
      iconStyle={iconStyle}
      data={data}
      search={false}
      maxHeight={maxHeight}
      keyboardAvoiding={false}
      labelField="label"
      valueField="value"
      placeholder={placeholder}
      value={value}
      disable={!editable}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={handleSelect}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  optionRow: {
    padding: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
  },
  clearRow: {
    padding: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  clearLabel: {
    flex: 1,
    fontSize: 16,
    color: "#B00020",
  },
});

export default DropdownField;