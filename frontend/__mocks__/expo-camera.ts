import React from "react";
import { View } from "react-native";

type CameraViewHandle = {
  takePictureAsync: (options?: { quality?: number; skipProcessing?: boolean }) => Promise<{
    uri: string;
    width: number;
    height: number;
  }>;
  getAvailablePictureSizesAsync: () => Promise<string[]>;
};

export const CameraView = React.forwardRef<CameraViewHandle, any>(
  (_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn(async () => ({
        uri: "file:///mock/camera/capture.jpg",
        width: 1080,
        height: 1920,
      })),
      getAvailablePictureSizesAsync: jest.fn(async () => [
        "4000x3000",
        "1920x1080",
        "1280x720",
        "640x480",
      ]),
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
