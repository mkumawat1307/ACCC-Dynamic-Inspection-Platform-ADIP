import {
  BACKUP_DIR_NAME,
  BACKUP_FILE_NAME,
  buildBackupDisplayPath,
  zipBase64,
  unzipBase64,
  isZipBytes,
} from "@/src/utils/backupZip";

describe("backupZip", () => {
  it("builds the canonical user-facing backup path", () => {
    expect(buildBackupDisplayPath()).toBe(
      "Download/ACCC Dynamic Inspection/accc_backup.zip"
    );
    expect(BACKUP_FILE_NAME).toBe("accc_backup.zip");
    expect(BACKUP_DIR_NAME).toBe("ACCC Dynamic Inspection");
  });

  it("round-trips entries through a real zip", async () => {
    const b64 = await zipBase64({
      "SQLite/accc_global.db": new Uint8Array([1, 2, 3, 4]),
      "Projects/Alpha/inspection.db": new Uint8Array([9, 8, 7]),
    });
    const out = await unzipBase64(b64);
    expect(Array.from(out["SQLite/accc_global.db"])).toEqual([1, 2, 3, 4]);
    expect(Array.from(out["Projects/Alpha/inspection.db"])).toEqual([9, 8, 7]);
  });

  it("zipBase64 output is a valid zip (magic PK\\x03\\x04)", async () => {
    const b64 = await zipBase64({ "a.db": new Uint8Array([0]) });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(isZipBytes(bytes)).toBe(true);
  });

  it("detects the zip magic PK\\x03\\x04", () => {
    expect(isZipBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBe(true);
    expect(isZipBytes(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(isZipBytes(new Uint8Array([]))).toBe(false);
  });
});