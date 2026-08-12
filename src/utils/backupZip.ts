import JSZip from "jszip";

export const BACKUP_DIR_NAME = "ACCC Dynamic Inspection";
export const BACKUP_FILE_NAME = "accc_backup.zip";

export function buildBackupDisplayPath(): string {
  return `Download/${BACKUP_DIR_NAME}/${BACKUP_FILE_NAME}`;
}

export async function zipBase64(
  files: Record<string, Uint8Array>
): Promise<string> {
  const zip = new JSZip();
  for (const [name, bytes] of Object.entries(files)) {
    zip.file(name, bytes);
  }
  return zip.generateAsync({ type: "base64" });
}

export async function unzipBase64(
  b64: string
): Promise<Record<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const out: Record<string, Uint8Array> = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    out[name] = await entry.async("uint8array");
  }
  return out;
}

export function isZipBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}