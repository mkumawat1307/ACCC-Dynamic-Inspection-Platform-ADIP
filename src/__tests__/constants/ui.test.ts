import { SPACING, COLORS, RADIUS } from "@/src/constants/ui";

describe("ui design tokens", () => {
  it("defines the spacing scale", () => {
    expect(SPACING).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24 });
  });

  it("defines the color palette", () => {
    expect(COLORS).toEqual({
      background: "#F5F5F5",
      surface: "#FFFFFF",
      primary: "#0B5ED7",
      textPrimary: "#333",
      textSecondary: "#666",
      textMuted: "#999",
    });
  });

  it("defines the corner radius scale", () => {
    expect(RADIUS).toEqual({ md: 12 });
  });
});
