const files = new Map<string, string>();

type EncodingType = "utf8" | "base64";
type WritingOptions = { encoding?: EncodingType };

export const documentDirectory = "file:///mock/documents/";
export const cacheDirectory = "file:///mock/cache/";

export const EncodingType = {
  UTF8: "utf8" as EncodingType,
  Base64: "base64" as EncodingType,
};

export async function writeAsStringAsync(
  fileUri: string,
  contents: string,
  _options?: WritingOptions
): Promise<void> {
  files.set(fileUri, contents);
}

export async function readAsStringAsync(
  fileUri: string,
  _options?: WritingOptions
): Promise<string> {
  const content = files.get(fileUri);
  if (content === undefined) {
    throw new Error(`File not found: ${fileUri}`);
  }
  return content;
}

export async function getInfoAsync(
  _fileUri: string
): Promise<{ exists: boolean; isDirectory: boolean; size?: number }> {
  return { exists: true, isDirectory: false, size: 100 };
}

export async function makeDirectoryAsync(
  _dirUri: string,
  _options?: { intermediates?: boolean }
): Promise<void> {
}

export async function deleteAsync(
  _fileUri: string,
  _options?: { idempotent?: boolean }
): Promise<void> {
}

export function __resetFsState() {
  files.clear();
}
