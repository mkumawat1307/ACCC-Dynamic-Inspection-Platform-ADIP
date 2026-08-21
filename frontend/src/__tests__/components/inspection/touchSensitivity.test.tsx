import { TOUCH_TARGETS } from "@/src/utils/touchTargets";

describe("Phase 21 — Touch sensitivity", () => {
  describe("TOUCH_TARGETS constants", () => {
    it("defines hitSlop with all four insets as positive numbers", () => {
      const { hitSlop } = TOUCH_TARGETS;
      expect(hitSlop.top).toBeGreaterThan(0);
      expect(hitSlop.bottom).toBeGreaterThan(0);
      expect(hitSlop.left).toBeGreaterThan(0);
      expect(hitSlop.right).toBeGreaterThan(0);
    });

    it("defines compactHitSlop with all four insets as positive numbers", () => {
      const { compactHitSlop } = TOUCH_TARGETS;
      expect(compactHitSlop.top).toBeGreaterThan(0);
      expect(compactHitSlop.bottom).toBeGreaterThan(0);
      expect(compactHitSlop.left).toBeGreaterThan(0);
      expect(compactHitSlop.right).toBeGreaterThan(0);
    });

    it("defines dropdownHitSlop with all four insets as positive numbers", () => {
      const { dropdownHitSlop } = TOUCH_TARGETS;
      expect(dropdownHitSlop.top).toBeGreaterThan(0);
      expect(dropdownHitSlop.bottom).toBeGreaterThan(0);
      expect(dropdownHitSlop.left).toBeGreaterThan(0);
      expect(dropdownHitSlop.right).toBeGreaterThan(0);
    });

    it("defines sectionHeaderPadding as positive number", () => {
      expect(typeof TOUCH_TARGETS.sectionHeaderPadding).toBe("number");
      expect(TOUCH_TARGETS.sectionHeaderPadding).toBeGreaterThan(0);
    });

    it("dropdownHitSlop has larger vertical insets than standard hitSlop", () => {
      expect(TOUCH_TARGETS.dropdownHitSlop.top).toBeGreaterThanOrEqual(
        TOUCH_TARGETS.hitSlop.top!
      );
      expect(TOUCH_TARGETS.dropdownHitSlop.bottom).toBeGreaterThanOrEqual(
        TOUCH_TARGETS.hitSlop.bottom!
      );
    });
  });

  describe("Source code — hitSlop applied to touch targets", () => {
    const fs = require("fs");
    const path = require("path");

    function readSource(relativePath: string): string {
      return fs.readFileSync(
        path.resolve(__dirname, relativePath),
        "utf-8"
      );
    }

    it("PhotoCard label Pressable uses TOUCH_TARGETS.hitSlop", () => {
      const source = readSource(
        "../../../components/inspection/PhotoCard.tsx"
      );
      expect(source).toContain(
        'import { TOUCH_TARGETS } from "@/src/utils/touchTargets"'
      );
      expect(source).toContain("hitSlop={TOUCH_TARGETS.hitSlop}");
    });

    it("FieldRenderer locked Pressable uses TOUCH_TARGETS.hitSlop", () => {
      const source = readSource(
        "../../../components/inspection/FieldRenderer.tsx"
      );
      expect(source).toContain(
        'import { TOUCH_TARGETS } from "@/src/utils/touchTargets"'
      );
      expect(source).toContain("hitSlop={TOUCH_TARGETS.hitSlop}");
    });

    it("renderFieldInput Dropdown wrapper does NOT use hitSlop on View (ineffective)", () => {
      const source = readSource(
        "../../../components/inspection/renderFieldInput.tsx"
      );
      expect(source).not.toContain("hitSlop={TOUCH_TARGETS.dropdownHitSlop}");
    });

    it("DeviceSection checkbox Pressable uses TOUCH_TARGETS.compactHitSlop", () => {
      const source = readSource(
        "../../../components/inspection/DeviceSection.tsx"
      );
      expect(source).toContain(
        'import { TOUCH_TARGETS } from "@/src/utils/touchTargets"'
      );
      expect(source).toContain(
        "hitSlop={TOUCH_TARGETS.compactHitSlop}"
      );
    });

    it("DeviceSection Dropdown wrapper does NOT use hitSlop on View (ineffective)", () => {
      const source = readSource(
        "../../../components/inspection/DeviceSection.tsx"
      );
      expect(source).not.toContain("hitSlop={TOUCH_TARGETS.dropdownHitSlop}");
    });

    it("new.styles.ts uses TOUCH_TARGETS.sectionHeaderPadding", () => {
      const source = readSource(
        "../../../components/app/inspection/new.styles.ts"
      );
      expect(source).toContain(
        'import { TOUCH_TARGETS } from "@/src/utils/touchTargets"'
      );
      expect(source).toContain("TOUCH_TARGETS.sectionHeaderPadding");
    });
  });
});
