import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, Button, Chip } from "react-native-paper";

interface PhotoSectionHeaderProps {
  photoCount: number;
  hasMinPhotos: boolean;
  allComplete: boolean;
  capturing: boolean;
  onCapture: () => void;
}

export default function PhotoSectionHeader({
  photoCount,
  hasMinPhotos,
  allComplete,
  capturing,
  onCapture,
}: PhotoSectionHeaderProps) {
  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="titleMedium" style={styles.headerTitle}>
            Photos ({photoCount})
          </Text>
          {!hasMinPhotos && (
            <Chip
              icon="alert-circle"
              style={styles.warningChip}
              textStyle={styles.warningChipText}
              compact
            >
              Min 1 required
            </Chip>
          )}
          {hasMinPhotos && !allComplete && (
            <Chip
              icon="progress-check"
              style={styles.processingChip}
              textStyle={styles.processingChipText}
              compact
            >
              Watermarking...
            </Chip>
          )}
          {allComplete && (
            <Chip
              icon="check-circle"
              style={styles.successChip}
              textStyle={styles.successChipText}
              compact
            >
              OK
            </Chip>
          )}
        </View>

        <Button
          mode="contained"
          icon="camera"
          loading={capturing}
          disabled={capturing}
          onPress={onCapture}
        >
          {capturing ? "Capturing..." : "Capture"}
        </Button>
      </View>

      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          Each photo is automatically watermarked with
          ID, location, GPS, date and time.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontWeight: "700",
    color: "#1976D2",
  },
  warningChip: {
    backgroundColor: "#FFF3E0",
  },
  warningChipText: {
    color: "#E65100",
    fontSize: 11,
  },
  processingChip: {
    backgroundColor: "#E3F2FD",
  },
  processingChipText: {
    color: "#1565C0",
    fontSize: 11,
  },
  successChip: {
    backgroundColor: "#E8F5E9",
  },
  successChipText: {
    color: "#2E7D32",
    fontSize: 11,
  },
  infoBanner: {
    backgroundColor: "#E3F2FD",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 12,
    color: "#1565C0",
    lineHeight: 16,
  },
});
