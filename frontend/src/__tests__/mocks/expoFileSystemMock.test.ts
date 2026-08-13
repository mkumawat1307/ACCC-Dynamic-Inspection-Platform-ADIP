import {
  EncodingType,
  __resetFsState,
  documentDirectory,
  cacheDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  getInfoAsync,
  deleteAsync,
  getContentUriAsync,
} from "expo-file-system/legacy";

jest.mock("expo-file-system/legacy", () =>
  jest.requireActual("../../../__mocks__/expo-file-system")
);

describe("expo-file-system/legacy manual mock", () => {
  beforeEach(() => {
    __resetFsState();
  });

  it("exposes document and cache directories", () => {
    expect(documentDirectory).toBe("file:///mock/documents/");
    expect(cacheDirectory).toBe("file:///mock/cache/");
  });

  it("writes and reads a file, and reports info", async () => {
    const fileUri = `${documentDirectory}SQLite/accc_global.db`;

    await writeAsStringAsync(fileUri, "QUJD", { encoding: EncodingType.Base64 });

    await expect(
      readAsStringAsync(fileUri, { encoding: EncodingType.Base64 })
    ).resolves.toBe("QUJD");
    await expect(getInfoAsync(fileUri)).resolves.toEqual({
      exists: true,
      isDirectory: false,
      size: 4,
    });
  });

  it("overwrites an existing file with writeAsStringAsync", async () => {
    const fileUri = `${documentDirectory}report.csv`;

    await writeAsStringAsync(fileUri, "OLD", { encoding: EncodingType.UTF8 });
    await writeAsStringAsync(fileUri, "NEW", { encoding: EncodingType.UTF8 });

    await expect(readAsStringAsync(fileUri)).resolves.toBe("NEW");
  });

  it("rejects reads for missing files and reports missing info", async () => {
    const missing = `${documentDirectory}missing.db`;

    await expect(readAsStringAsync(missing)).rejects.toThrow("File not found");
    await expect(getInfoAsync(missing)).resolves.toEqual({
      exists: false,
      isDirectory: false,
    });
  });

  it("deletes files nested under a directory prefix", async () => {
    const dirUri = `${documentDirectory}Projects/Alpha`;
    const fileUri = `${dirUri}/inspection.db`;

    await writeAsStringAsync(fileUri, "DATA", { encoding: EncodingType.UTF8 });
    await expect(getInfoAsync(fileUri)).resolves.toMatchObject({ exists: true });

    await deleteAsync(dirUri);

    await expect(getInfoAsync(fileUri)).resolves.toMatchObject({ exists: false });
  });

  it("converts file URIs to content URIs via getContentUriAsync", async () => {
    await expect(getContentUriAsync("file:///mock/report.xlsx")).resolves.toBe(
      "content://mock//mock/report.xlsx"
    );
  });
});
