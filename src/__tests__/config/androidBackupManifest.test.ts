import fs from "fs";
import path from "path";

const MANIFEST = path.join(
  __dirname,
  "../../../android/app/src/main/AndroidManifest.xml"
);
const BACKUP_RULES = path.join(
  __dirname,
  "../../../android/app/src/main/res/xml/backup_rules.xml"
);
const DATA_EXTRACTION_RULES = path.join(
  __dirname,
  "../../../android/app/src/main/res/xml/data_extraction_rules.xml"
);

describe("Android backup configuration", () => {
  it("keeps Auto Backup enabled (never disabled globally)", () => {
    const xml = fs.readFileSync(MANIFEST, "utf8");
    expect(xml).toContain('android:allowBackup="true"');
  });

  it("points at explicit backup rules", () => {
    const xml = fs.readFileSync(MANIFEST, "utf8");
    expect(xml).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(xml).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
  });

  it("allows foreground backup so dataChanged() is honored promptly", () => {
    const xml = fs.readFileSync(MANIFEST, "utf8");
    expect(xml).toContain('android:backupInForeground="true"');
  });

  it("includes the file and sharedpref domains in every rule file", () => {
    const br = fs.readFileSync(BACKUP_RULES, "utf8");
    expect(br).toContain('<include domain="file" path="." />');
    expect(br).toContain('<include domain="sharedpref" path="." />');
    const dex = fs.readFileSync(DATA_EXTRACTION_RULES, "utf8");
    expect(dex).toContain('<include domain="file" path="." />');
    expect(dex).toContain('<include domain="sharedpref" path="." />');
  });
});