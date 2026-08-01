import React, {
  useEffect,
  useState,
  useRef,
} from "react";

import {
  View,
} from "react-native";

import {
  Card,
  Text,
  TextInput,
} from "react-native-paper";

import { Dropdown } from "react-native-element-dropdown";

import { styles } from "./CameraSection.styles";

import CameraRepository from "@/src/database/repositories/CameraRepository";
import { Camera } from "@/src/models/Camera";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";

interface Props {
  inspectionId: number;
  count: number;
}

function makeEmptyCamera(inspectionId: number, no: number): Camera {
  return {
    InspectionID: inspectionId,
    CameraNo: no,
    CameraType: null,
    CameraStatus: null,
    CameraMake: null,
    CameraModel: null,
    CameraIP: null,
    CameraSerialNumber: null,
    CameraSI: null,
    SDCardCapacity: null,
    SDCardStatus: null,
  };
}

interface DropdownItem {
  label: string;
  value: string;
}

const defaultOptions: Record<string, DropdownItem[]> = {
  CameraType: [
    { label: "Bullet", value: "Bullet" },
    { label: "Box", value: "Box" },
    { label: "PTZ", value: "PTZ" },
  ],
  CameraStatus: [
    { label: "VMS", value: "VMS" },
    { label: "Local", value: "Local" },
    { label: "Non-Live", value: "Non-Live" },
    { label: "In Stock", value: "In Stock" },
    { label: "Dismantled", value: "Dismantled" },
    { label: "Not Verified", value: "Not Verified" },
  ],
  CameraMake: [
    { label: "Sparsh", value: "Sparsh" },
    { label: "Prama", value: "Prama" },
    { label: "Hikvision", value: "Hikvision" },
    { label: "CP Plus", value: "CP Plus" },
    { label: "Secura", value: "Secura" },
  ],
  CameraSI: [
    { label: "Technosys (LSY)", value: "Technosys (LSY)" },
    { label: "TCIL (LSY)", value: "TCIL (LSY)" },
    { label: "TCIL (RC)", value: "TCIL (RC)" },
    { label: "TCIL (Smart City)", value: "TCIL (Smart City)" },
    { label: "TASL (Technosys)", value: "TASL (Technosys)" },
  ],
  SDCardCapacity: [
    { label: "64 GB", value: "64 GB" },
    { label: "128 GB", value: "128 GB" },
    { label: "256 GB", value: "256 GB" },
    { label: "Not Verified", value: "Not Verified" },
  ],
  SDCardStatus: [
    { label: "Working", value: "Working" },
    { label: "Not Working", value: "Not Working" },
    { label: "Not Verified", value: "Not Verified" },
  ],
};

export default function CameraSection({
  inspectionId,
  count,
}: Props) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [opts, setOpts] = useState<Record<string, DropdownItem[]>>(defaultOptions);
  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fields = ["CameraType", "CameraStatus", "CameraMake", "CameraSI", "SDCardCapacity", "SDCardStatus"];
      const loaded: Record<string, DropdownItem[]> = {};
      for (const f of fields) {
        const dbOpts = await DeviceOptionsRepository.getDropdownData("Camera", f);
        loaded[f] = dbOpts.length > 0 ? dbOpts : defaultOptions[f] ?? [];
      }
      setOpts(loaded);
      const existing = await CameraRepository.getByInspection(inspectionId);
      let list = existing.length > 0 ? existing : [];

      if (list.length < count) {
        for (let i = list.length + 1; i <= count; i++) {
          list.push(makeEmptyCamera(inspectionId, i));
        }
      }

      setCameras(list);
      setLoading(false);
    })();
  }, [inspectionId]);

  useEffect(() => {
    if (loading) return;

    setCameras((prev) => {
      if (prev.length === count) return prev;

      if (prev.length > count) {
        return prev.slice(0, count);
      }

      const next = [...prev];
      for (let i = prev.length + 1; i <= count; i++) {
        next.push(makeEmptyCamera(inspectionId, i));
      }
      return next;
    });
  }, [count, loading]);

  useEffect(() => {
    return () => {
      saveTimers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  function debouncedSave(camera: Camera) {
    if (camera.CameraID) {
      const timer = saveTimers.current.get(camera.CameraID);
      if (timer) clearTimeout(timer);

      saveTimers.current.set(
        camera.CameraID,
        setTimeout(async () => {
          await CameraRepository.save({
            ...camera,
            InspectionID: inspectionId,
          });
          saveTimers.current.delete(camera.CameraID!);
        }, 500)
      );
    } else {
      const key = camera.CameraNo;
      const timer = saveTimers.current.get(-key);
      if (timer) clearTimeout(timer);

      saveTimers.current.set(
        -key,
        setTimeout(async () => {
          const newId = await CameraRepository.save({
            ...camera,
            InspectionID: inspectionId,
          });
          if (newId) {
            setCameras((prev) =>
              prev.map((c) =>
                c.CameraNo === camera.CameraNo && !c.CameraID
                  ? { ...c, CameraID: newId }
                  : c
              )
            );
          }
          saveTimers.current.delete(-key);
        }, 500)
      );
    }
  }

  function updateCamera(
    index: number,
    field: keyof Camera,
    value: string | null
  ) {
    setCameras((prev) => {
      const updated = [...prev];
      const camera = { ...updated[index], [field]: value };
      updated[index] = camera;
      debouncedSave(camera);
      return updated;
    });
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading cameras...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.headerTitle}>
          Camera Details ({count})
        </Text>
      </View>

      {cameras.map((camera, index) => (
        <Card
          key={camera.CameraID ?? `new-${camera.CameraNo}`}
          style={styles.card}
        >
          <Card.Title
            title={`Camera ${camera.CameraNo}`}
            titleStyle={styles.cardTitle}
          />

          <Card.Content>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Camera Type *</Text>
                <Dropdown
                  style={styles.dropdown}
                  placeholderStyle={styles.placeholder}
                  selectedTextStyle={styles.selectedText}
                  data={opts.CameraType}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Type"
                  value={camera.CameraType}
                  onChange={(item) =>
                    updateCamera(index, "CameraType", item.value)
                  }
                />
              </View>

              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Camera Status *</Text>
                <Dropdown
                  style={styles.dropdown}
                  placeholderStyle={styles.placeholder}
                  selectedTextStyle={styles.selectedText}
                  data={opts.CameraStatus}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Status"
                  value={camera.CameraStatus}
                  onChange={(item) =>
                    updateCamera(index, "CameraStatus", item.value)
                  }
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Camera Make</Text>
                <Dropdown
                  style={styles.dropdown}
                  placeholderStyle={styles.placeholder}
                  selectedTextStyle={styles.selectedText}
                  data={opts.CameraMake}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Make"
                  value={camera.CameraMake}
                  onChange={(item) =>
                    updateCamera(index, "CameraMake", item.value)
                  }
                />
              </View>

              <View style={styles.half}>
                <TextInput
                  mode="outlined"
                  label="Camera Model"
                  value={camera.CameraModel ?? ""}
                  onChangeText={(text) =>
                    updateCamera(index, "CameraModel", text || null)
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
                  label="Camera IP"
                  value={camera.CameraIP ?? ""}
                  onChangeText={(text) =>
                    updateCamera(index, "CameraIP", text || null)
                  }
                  style={styles.input}
                  dense
                />
              </View>

              <View style={styles.half}>
                <TextInput
                  mode="outlined"
                  label="Camera Serial Number"
                  value={camera.CameraSerialNumber ?? ""}
                  onChangeText={(text) =>
                    updateCamera(index, "CameraSerialNumber", text || null)
                  }
                  style={styles.input}
                  dense
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Camera SI</Text>
                <Dropdown
                  style={styles.dropdown}
                  placeholderStyle={styles.placeholder}
                  selectedTextStyle={styles.selectedText}
                  data={opts.CameraSI}
                  labelField="label"
                  valueField="value"
                  placeholder="Select SI"
                  value={camera.CameraSI}
                  onChange={(item) =>
                    updateCamera(index, "CameraSI", item.value)
                  }
                />
              </View>

              <View style={styles.half}>
                <Text style={styles.fieldLabel}>SD Card Capacity</Text>
                <Dropdown
                  style={styles.dropdown}
                  placeholderStyle={styles.placeholder}
                  selectedTextStyle={styles.selectedText}
                  data={opts.SDCardCapacity}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Capacity"
                  value={camera.SDCardCapacity}
                  onChange={(item) =>
                    updateCamera(index, "SDCardCapacity", item.value)
                  }
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>SD Card Status</Text>
            <Dropdown
              style={styles.dropdown}
              placeholderStyle={styles.placeholder}
              selectedTextStyle={styles.selectedText}
              data={opts.SDCardStatus}
              labelField="label"
              valueField="value"
              placeholder="Select SD Card Status"
              value={camera.SDCardStatus}
              onChange={(item) =>
                updateCamera(index, "SDCardStatus", item.value)
              }
            />
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}


