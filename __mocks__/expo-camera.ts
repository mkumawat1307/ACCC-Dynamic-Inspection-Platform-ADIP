import React from "react";
import { View } from "react-native";

type CameraViewHandle = {
  takePictureAsync: (options?: { quality?: number; skipProcessing?: boolean }) => Promise<{
    uri: string;
    width: number;
    height: number;
  }>;
};

export const CameraView = React.forwardRef<CameraViewHandle, any>(
  (_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn(async () => ({
        uri: "file:///mock/camera/capture.jpg",
        width: 1080,
        height: 1920,
      })),
    }));
    return React.createElement(View);
  }
);
CameraView.displayName = "CameraView";

export function useCameraPermissions(): [
  { granted: boolean; canAskAgain: boolean } | null,
  () => Promise<{ status: string; granted: boolean }>
] {
  const requestPermission = jest.fn(async () => ({ status: "granted", granted: true }));
  return [{ granted: true, canAskAgain: true }, requestPermission];
}
