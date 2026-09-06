import { NativeModules, Platform } from "react-native";
import { requestAndroidBackup } from "@/src/utils/androidBackup";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("requestAndroidBackup", () => {
  it("is a no-op on non-Android platforms", () => {
    expect(() => requestAndroidBackup()).not.toThrow();
  });

  it("calls the native module on Android", () => {
    const requestBackup = jest.fn();
    (NativeModules as any).AndroidBackup = { requestBackup };
    jest.replaceProperty(Platform, "OS", "android");
    requestAndroidBackup();
    expect(requestBackup).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the native module is missing", () => {
    delete (NativeModules as any).AndroidBackup;
    jest.replaceProperty(Platform, "OS", "android");
    expect(() => requestAndroidBackup()).not.toThrow();
  });

  it("swallows native throws", () => {
    (NativeModules as any).AndroidBackup = {
      requestBackup: jest.fn(() => {
        throw new Error("boom");
      }),
    };
    jest.replaceProperty(Platform, "OS", "android");
    expect(() => requestAndroidBackup()).not.toThrow();
  });
});