import React, {
  useEffect,
  useState,
  useRef,
} from "react";

import {
  StyleSheet,
  View,
} from "react-native";

import {
  Card,
  Text,
  TextInput,
} from "react-native-paper";

import { Dropdown } from "react-native-element-dropdown";

import SwitchRepository from "@/src/database/repositories/SwitchRepository";
import { Switch } from "@/src/models/Switch";

interface Props {
  inspectionId: number;
  count: number;
}

function makeEmptySwitch(inspectionId: number, no: number): Switch {
  return {
    InspectionID: inspectionId,
    SwitchNo: no,
    SwitchType: null,
    SwitchStatus: null,
    SwitchMake: null,
    SwitchModel: null,
    SwitchIP: null,
    SwitchSerialNumber: null,
    SwitchSI: null,
  };
}

const switchTypeOptions = [
  { label: "4-Port", value: "4-Port" },
  { label: "8-Port", value: "8-Port" },
];

const switchStatusOptions = [
  { label: "VMS", value: "VMS" },
  { label: "Local", value: "Local" },
  { label: "Non-Live", value: "Non-Live" },
  { label: "In Stock", value: "In Stock" },
  { label: "Dismantled", value: "Dismantled" },
  { label: "Not Verified", value: "Not Verified" },
];

const switchMakeOptions = [
  { label: "D-Link", value: "D-Link" },
  { label: "Cisco", value: "Cisco" },
  { label: "Allied", value: "Allied" },
  { label: "Tejas", value: "Tejas" },
];

const switchSIOptions = [
  { label: "Technosys (LSY)", value: "Technosys (LSY)" },
  { label: "TCIL (LSY)", value: "TCIL (LSY)" },
  { label: "TCIL (RC)", value: "TCIL (RC)" },
  { label: "TCIL (Smart City)", value: "TCIL (Smart City)" },
  { label: "TASL (Technosys)", value: "TASL (Technosys)" },
];

export default function SwitchSection({
  inspectionId,
  count,
}: Props) {
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const existing = await SwitchRepository.getByInspection(inspectionId);
      let list = existing.length > 0 ? existing : [];

      if (list.length < count) {
        for (let i = list.length + 1; i <= count; i++) {
          list.push(makeEmptySwitch(inspectionId, i));
        }
      }

      setSwitches(list);
      setLoading(false);
    })();
  }, [inspectionId]);

  useEffect(() => {
    if (loading) return;

    setSwitches((prev) => {
      if (prev.length === count) return prev;

      if (prev.length > count) {
        return prev.slice(0, count);
      }

      const next = [...prev];
      for (let i = prev.length + 1; i <= count; i++) {
        next.push(makeEmptySwitch(inspectionId, i));
      }
      return next;
    });
  }, [count, loading]);

  useEffect(() => {
    return () => {
      saveTimers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  function debouncedSave(sw: Switch) {
    if (sw.SwitchID) {
      const timer = saveTimers.current.get(sw.SwitchID);
      if (timer) clearTimeout(timer);

      saveTimers.current.set(
        sw.SwitchID,
        setTimeout(async () => {
          await SwitchRepository.save({
            ...sw,
            InspectionID: inspectionId,
          });
          saveTimers.current.delete(sw.SwitchID!);
        }, 500)
      );
    } else {
      const key = sw.SwitchNo;
      const timer = saveTimers.current.get(-key);
      if (timer) clearTimeout(timer);

      saveTimers.current.set(
        -key,
        setTimeout(async () => {
          const newId = await SwitchRepository.save({
            ...sw,
            InspectionID: inspectionId,
          });
          if (newId) {
            setSwitches((prev) =>
              prev.map((s) =>
                s.SwitchNo === sw.SwitchNo && !s.SwitchID
                  ? { ...s, SwitchID: newId }
                  : s
              )
            );
          }
          saveTimers.current.delete(-key);
        }, 500)
      );
    }
  }

  function updateSwitch(
    index: number,
    field: keyof Switch,
    value: string | null
  ) {
    setSwitches((prev) => {
      const updated = [...prev];
      const sw = { ...updated[index], [field]: value };
      updated[index] = sw;
      debouncedSave(sw);
      return updated;
    });
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading switches...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.headerTitle}>
          Switch Details ({count})
        </Text>
      </View>

      {switches.map((sw, index) => (
        <Card
          key={sw.SwitchID ?? `new-${sw.SwitchNo}`}
          style={styles.card}
        >
          <Card.Title
            title={`Switch ${sw.SwitchNo}`}
            titleStyle={styles.cardTitle}
          />

          <Card.Content>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Switch Type</Text>
                <Dropdown
                  style={styles.dropdown}
                  placeholderStyle={styles.placeholder}
                  selectedTextStyle={styles.selectedText}
                  data={switchTypeOptions}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Type"
                  value={sw.SwitchType}
                  onChange={(item) =>
                    updateSwitch(index, "SwitchType", item.value)
                  }
                />
              </View>

              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Switch Status</Text>
                <Dropdown
                  style={styles.dropdown}
                  placeholderStyle={styles.placeholder}
                  selectedTextStyle={styles.selectedText}
                  data={switchStatusOptions}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Status"
                  value={sw.SwitchStatus}
                  onChange={(item) =>
                    updateSwitch(index, "SwitchStatus", item.value)
                  }
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Switch Make</Text>
                <Dropdown
                  style={styles.dropdown}
                  placeholderStyle={styles.placeholder}
                  selectedTextStyle={styles.selectedText}
                  data={switchMakeOptions}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Make"
                  value={sw.SwitchMake}
                  onChange={(item) =>
                    updateSwitch(index, "SwitchMake", item.value)
                  }
                />
              </View>

              <View style={styles.half}>
                <TextInput
                  mode="outlined"
                  label="Switch Model"
                  value={sw.SwitchModel ?? ""}
                  onChangeText={(text) =>
                    updateSwitch(index, "SwitchModel", text || null)
                  }
                  style={styles.input}
                  dense
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <TextInput
                  mode="outlined"
                  label="Switch IP"
                  value={sw.SwitchIP ?? ""}
                  onChangeText={(text) =>
                    updateSwitch(index, "SwitchIP", text || null)
                  }
                  style={styles.input}
                  dense
                />
              </View>

              <View style={styles.half}>
                <TextInput
                  mode="outlined"
                  label="Switch Serial Number"
                  value={sw.SwitchSerialNumber ?? ""}
                  onChangeText={(text) =>
                    updateSwitch(index, "SwitchSerialNumber", text || null)
                  }
                  style={styles.input}
                  dense
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Switch SI</Text>
            <Dropdown
              style={styles.dropdown}
              placeholderStyle={styles.placeholder}
              selectedTextStyle={styles.selectedText}
              data={switchSIOptions}
              labelField="label"
              valueField="value"
              placeholder="Select SI"
              value={sw.SwitchSI}
              onChange={(item) =>
                updateSwitch(index, "SwitchSI", item.value)
              }
            />
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  headerTitle: {
    fontWeight: "700",
    color: "#1976D2",
  },

  loading: {
    paddingVertical: 20,
    alignItems: "center",
  },

  card: {
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: "#F8F9FA",
  },

  cardTitle: {
    fontWeight: "700",
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#444",
    marginBottom: 4,
  },

  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },

  half: {
    flex: 1,
  },

  input: {
    marginBottom: 4,
    backgroundColor: "#FFFFFF",
  },

  dropdown: {
    height: 56,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },

  placeholder: {
    fontSize: 14,
    color: "#999999",
  },

  selectedText: {
    fontSize: 14,
    color: "#000000",
  },
});
