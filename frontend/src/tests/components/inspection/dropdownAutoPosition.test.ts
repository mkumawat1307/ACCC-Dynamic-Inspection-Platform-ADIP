import fs from "fs";
import path from "path";

const LIB_SOURCE = path.resolve(
  __dirname,
  "../../../../node_modules/react-native-element-dropdown/src/components/Dropdown/index.tsx"
);

const PATCH_FILE = path.resolve(
  __dirname,
  "../../../../patches/react-native-element-dropdown+2.12.4.patch"
);

describe("Dropdown onAutoPosition patch", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LIB_SOURCE, "utf-8");
  });

  it("patch file exists", () => {
    expect(fs.existsSync(PATCH_FILE)).toBe(true);
  });

  it("patch file contains the maxHeight fix", () => {
    const patch = fs.readFileSync(PATCH_FILE, "utf-8");
    expect(patch).toContain("+          return bottom < maxHeight;");
    expect(patch).toContain("-          return bottom < (search ? 150 : 100);");
  });

  it("patched source uses maxHeight instead of hardcoded threshold", () => {
    expect(source).toContain("return bottom < maxHeight;");
    expect(source).not.toMatch(/return bottom < \(search \? 150 : 100\)/);
  });

  it("onAutoPosition still handles keyboard case correctly", () => {
    expect(source).toContain("return bottom < keyboardHeight + height;");
  });

  it("maxHeight is always numeric (has destructuring default)", () => {
    expect(source).toMatch(/maxHeight\s*=\s*340/);
  });

  it("dropdown maxHeight prop is typed as optional number", () => {
    const modelPath = path.resolve(
      __dirname,
      "../../../../node_modules/react-native-element-dropdown/src/components/Dropdown/model.ts"
    );
    const model = fs.readFileSync(modelPath, "utf-8");
    expect(model).toContain("maxHeight?: number;");
  });
});
