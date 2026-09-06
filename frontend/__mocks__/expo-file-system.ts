const entries = new Map<string, { type: "file" | "dir"; content: string }>();

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
  const existing = entries.get(fileUri);
  entries.set(fileUri, {
    type: existing ? existing.type : "file",
    content: contents,
  });
}

export async function readAsStringAsync(
  fileUri: string,
  _options?: WritingOptions
): Promise<string> {
  const entry = entries.get(fileUri);
  if (entry === undefined) {
    throw new Error(`File not found: ${fileUri}`);
  }
  return entry.content;
}

export async function getInfoAsync(
  fileUri: string
): Promise<{ exists: boolean; isDirectory: boolean; size?: number }> {
  const entry = entries.get(fileUri);
  if (entry === undefined) {
    return { exists: false, isDirectory: false };
  }
  if (entry.type === "dir") {
    return { exists: true, isDirectory: true };
  }
  return { exists: true, isDirectory: false, size: entry.content.length };
}

export async function makeDirectoryAsync(
  _dirUri: string,
  _options?: { intermediates?: boolean }
): Promise<void> {
}

export async function deleteAsync(
  fileUri: string,
  _options?: { idempotent?: boolean }
): Promise<void> {
  entries.delete(fileUri);
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(fileUri + "/")) {
      entries.delete(key);
    }
  }
}

export async function getContentUriAsync(fileUri: string): Promise<string> {
  return "content://mock/" + fileUri.replace(/^file:\/\//, "");
}

export function __resetFsState() {
  entries.clear();
}
