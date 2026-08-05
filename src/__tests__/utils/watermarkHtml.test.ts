import { buildWatermarkPage } from "@/src/utils/watermarkHtml";

describe("buildWatermarkPage", () => {
  it("returns a complete HTML document", () => {
    const html = buildWatermarkPage("base64data", ["Line 1", "Line 2"], 42);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<script>");
    expect(html).toContain("</script>");
  });

  it("embeds the base64 image data", () => {
    const html = buildWatermarkPage("abc123def", ["Test"], 1);
    expect(html).toContain("data:image/jpeg;base64,abc123def");
  });

  it("embeds the photoId in the message", () => {
    const html = buildWatermarkPage("data", ["Test"], 99);
    expect(html).toContain("photoId:99");
  });

  it("serializes lines as a JSON array", () => {
    const html = buildWatermarkPage("data", ["First line", "Second line"], 1);
    expect(html).toContain('["First line","Second line"]');
  });

  it("sanitizes HTML tags from lines", () => {
    const html = buildWatermarkPage("data", ["<script>alert('xss')</script>"], 1);
    expect(html).toContain("scriptalert(xss)/script");
    expect(html).not.toContain('["<script>');
  });

  it("sanitizes angle brackets from lines", () => {
    const html = buildWatermarkPage("data", ["<b>bold</b>"], 1);
    expect(html).toContain('bold');
    expect(html).not.toContain("<b>");
  });

  it("handles empty lines array", () => {
    const html = buildWatermarkPage("data", [], 1);
    expect(html).toContain("[]");
  });

  it("handles single line", () => {
    const html = buildWatermarkPage("data", ["Only one"], 1);
    expect(html).toContain('["Only one"]');
  });

  it("uses the same watermark metrics as the preview overlay (WYSIWYG)", () => {
    const html = buildWatermarkPage("data", ["Line 1"], 1);
    expect(html).toContain("var fSize=Math.max(22,Math.round(baseSize/18));");
    expect(html).toContain("var lh=Math.round(fSize*1.15)");
    expect(html).toContain("padY=Math.round(fSize*0.35)");
    expect(html).toContain("rPad=Math.round(fSize*0.4)");
    expect(html).toContain("gapX=Math.max(16,Math.round(fSize*0.75))");
    expect(html).toContain("gapY=Math.max(20,Math.round(fSize*1.0))");
    expect(html).toContain("var rx=gapX,ry=cv.height-rh-gapY;");
    expect(html).toContain("roundRect(ctx,rx,ry,rw,rh,8)");
  });
});
