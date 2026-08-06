import {
  buildWatermarkRendererPage,
  buildRenderWatermarkScript,
  sanitizeWatermarkLines,
} from "@/src/utils/watermarkHtml";

describe("buildWatermarkRendererPage", () => {
  it("returns a complete HTML document", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<script>");
    expect(html).toContain("</script>");
  });

  it("registers the global entry point and ready signal", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("window.renderWatermarkFromJson=function(payload)");
    expect(html).toContain("{__ready:true}");
  });

  it("exposes renderWatermark accepting photoId, base64 and lines", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("function renderWatermark(photoId,imageBase64,lines)");
    expect(html).toContain("img.src='data:image/jpeg;base64,'+imageBase64");
    expect(html).toContain("window.ReactNativeWebView.postMessage(JSON.stringify({photoId:photoId,base64:raw,perf:");
  });

  it("uses the same watermark metrics as the preview overlay (WYSIWYG)", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("var fSize=Math.max(22,Math.round(baseSize/18));");
    expect(html).toContain("var lh=Math.round(fSize*1.15)");
    expect(html).toContain("padY=Math.round(fSize*0.35)");
    expect(html).toContain("rPad=Math.round(fSize*0.4)");
    expect(html).toContain("gapX=Math.max(16,Math.round(fSize*0.75))");
    expect(html).toContain("gapY=Math.max(20,Math.round(fSize*1.0))");
    expect(html).toContain("var rx=gapX,ry=cv.height-rh-gapY;");
    expect(html).toContain("roundRect(ctx,rx,ry,rw,rh,8)");
    expect(html).toContain("'image/jpeg',0.95");
  });

  it("includes JS-side perf timing in the postMessage payload", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("performance.now()");
    expect(html).toContain("decode:");
    expect(html).toContain("draw:");
    expect(html).toContain("encode:");
  });
});

describe("buildRenderWatermarkScript", () => {
  it("builds a script that calls window.renderWatermarkFromJson with the payload", () => {
    const script = buildRenderWatermarkScript(99, "abc123def", ["First line", "Second line"]);
    expect(script).toContain("window.renderWatermarkFromJson(");
    expect(script).toMatch(/true;$/);
    expect(script).toContain('"photoId":99');
    expect(script).toContain('"base64":"abc123def"');
    expect(script).toContain('"lines":["First line","Second line"]');
  });

  it("handles empty lines array", () => {
    const script = buildRenderWatermarkScript(1, "data", []);
    expect(script).toContain('"lines":[]');
  });

  it("sanitizes HTML tags from lines", () => {
    const script = buildRenderWatermarkScript(1, "data", ["<script>alert('xss')</script>"]);
    expect(script).toContain("scriptalert(xss)/script");
    expect(script).not.toContain("<script>");
  });

  it("sanitizes angle brackets from lines", () => {
    const script = buildRenderWatermarkScript(1, "data", ["<b>bold</b>"]);
    expect(script).toContain("bold");
    expect(script).not.toContain("<b>");
  });

  it("keeps base64 intact inside the script payload", () => {
    const script = buildRenderWatermarkScript(1, "abc123+def/==", ["Test"]);
    expect(script).toContain('"base64":"abc123+def/=="');
  });

  it("escapes U+2028/U+2029 so the embedded literal stays valid JS", () => {
    const script = buildRenderWatermarkScript(1, "data", ["a\u2028b\u2029c"]);
    expect(script).not.toContain("\u2028");
    expect(script).not.toContain("\u2029");
    expect(script).toContain("\\u2028");
    expect(script).toContain("\\u2029");
  });
});

describe("sanitizeWatermarkLines", () => {
  it("strips quotes, backticks and backslashes are escaped", () => {
    expect(sanitizeWatermarkLines([`a"b'c`])).toEqual(["abc"]);
    expect(sanitizeWatermarkLines(["a\\b"])).toEqual(["a\\\\b"]);
  });
});
