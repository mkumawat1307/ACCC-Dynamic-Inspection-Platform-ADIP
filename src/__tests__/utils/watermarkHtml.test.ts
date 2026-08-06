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

  it("registers the global entry point and ready signal with the instance id", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("window.renderWatermarkFromJson=function(payload)");
    expect(html).toContain("{__ready:true,instance:diagInstance,created:diagCreatedAt}");
  });

  it("tags each renderer instance with a unique id and creation timestamp", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("var diagInstance=Math.random().toString(36).slice(2,10);");
    expect(html).toContain("var diagCreatedAt=Date.now();");
    expect(html).toContain("instance:diagInstance");
    expect(html).toContain("created:diagCreatedAt");
  });

  it("announces renderer teardown on pagehide and beforeunload", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("addEventListener('pagehide'");
    expect(html).toContain("addEventListener('beforeunload'");
    expect(html).toContain("__unload:true,instance:diagInstance,created:diagCreatedAt,uptime:");
  });

  it("creates the 2D context with willReadFrequently to force a CPU-backed canvas", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("cv.getContext('2d',{willReadFrequently:true})");
    expect(html).not.toContain("var ctx=cv.getContext('2d');");
  });

  it("exposes renderWatermark accepting photoId, base64, lines and style", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("function renderWatermark(photoId,imageBase64,lines,style)");
    expect(html).toContain("img.src='data:image/jpeg;base64,'+imageBase64");
    expect(html).toContain("window.ReactNativeWebView.postMessage(JSON.stringify({photoId:photoId,base64:raw,perf:");
  });

  it("uses the same configurable watermark metrics as the preview overlay (WYSIWYG)", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("var fSize=Math.max(22,Math.round(baseSize/18*style.fontScale));");
    expect(html).toContain("var lh=Math.round(fSize*1.15)");
    expect(html).toContain("padY=Math.round(fSize*0.35)");
    expect(html).toContain("rPad=Math.round(fSize*0.4)");
    expect(html).toContain("gapX=Math.max(16,Math.round(fSize*0.75))");
    expect(html).toContain("gapY=Math.max(20,Math.round(fSize*1.0))");
    expect(html).toContain("var corner=Math.max(4,Math.round(fSize*0.2));");
    expect(html).toContain("ctx.font='bold '+fSize+'px sans-serif';");
    expect(html).toContain("roundRect(ctx,rx,ry,rw,rh,corner)");
    expect(html).toContain("if(style.position==='bottomRight'){rx=cv.width-rw-gapX;}else{rx=gapX;}");
    expect(html).toContain("'image/jpeg',0.95");
  });

  it("applies the style-driven background opacity and text color", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("ctx.fillStyle='rgba(0,0,0,'+style.bgOpacity+')';");
    expect(html).toContain("ctx.fillStyle=style.textColor;");
  });

  it("renders a box shadow before the box fill and resets it after", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("ctx.shadowColor='rgba(0,0,0,0.35)';");
    expect(html).toContain("ctx.shadowBlur=8;");
    expect(html).toContain("ctx.shadowOffsetY=2;");
    expect(html).toContain("ctx.shadowBlur=0;");
    expect(html).toContain("ctx.shadowOffsetX=0;");
    expect(html).toContain("ctx.shadowOffsetY=0;");
  });

  it("includes JS-side perf timing in the postMessage payload", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("performance.now()");
    expect(html).toContain("decode:");
    expect(html).toContain("draw:");
    expect(html).toContain("encode:");
  });

  it("instruments canvas.toBlob and FileReader separately in a diag payload", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("var tBlobStart=performance.now();");
    expect(html).toContain("var tBlobCb=performance.now();");
    expect(html).toContain("var tFrStart=performance.now();");
    expect(html).toContain("var tFrEnd=performance.now();");
    expect(html).toContain("toBlobMs:");
    expect(html).toContain("frMs:");
    expect(html).toContain("blobSize:blob.size");
    expect(html).toContain("b64Len:raw.length");
    expect(html).toContain("quality:0.95");
  });

  it("tracks the outstanding watermark job count in the renderer", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("var diagJobs=0;");
    expect(html).toContain("diagJobs++;");
    expect(html).toContain("diagJobs--;");
    expect(html).toContain("jobs:diagJobs");
  });

  it("reports canvas reset state, prior image residency and heap when available", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("var imgWasResident=img.complete&&img.naturalWidth>0;");
    expect(html).toContain("var cvPrevW=cv.width,cvPrevH=cv.height;");
    expect(html).toContain("canvasReset:(cvPrevW!==cv.width||cvPrevH!==cv.height)");
    expect(html).toContain("imgWasResident:imgWasResident");
    expect(html).toContain("performance.memory");
    expect(html).toContain("heapUsed");
  });

  it("tracks captures, renderer uptime, heap deltas and GC activity for stall cadence", () => {
    const html = buildWatermarkRendererPage();
    expect(html).toContain("var diagCaptures=0;");
    expect(html).toContain("diagCaptures++;");
    expect(html).toContain("capture:diagCaptures");
    expect(html).toContain("uptimeMs:");
    expect(html).toContain("toBlobAtMs:");
    expect(html).toContain("cbAtMs:");
    expect(html).toContain("heapBefore:heapBefore");
    expect(html).toContain("heapAfter:");
    expect(html).toContain("gcEvents:");
    expect(html).toContain("PerformanceObserver");
    expect(html).toContain("entryTypes:['gc']");
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

  it("includes the style config in the payload when provided", () => {
    const script = buildRenderWatermarkScript(1, "data", ["x"], {
      fontScale: 1.25,
      position: "bottomRight",
      bgOpacity: 0.8,
      textColor: "#FFEB3B",
    });
    expect(script).toContain('"style":{"fontScale":1.25,"position":"bottomRight","bgOpacity":0.8,"textColor":"#FFEB3B"}');
  });

  it("omits the style key when not provided", () => {
    const script = buildRenderWatermarkScript(1, "data", ["x"]);
    expect(script).not.toContain('"style"');
  });
});

describe("sanitizeWatermarkLines", () => {
  it("strips quotes, backticks and backslashes are escaped", () => {
    expect(sanitizeWatermarkLines([`a"b'c`])).toEqual(["abc"]);
    expect(sanitizeWatermarkLines(["a\\b"])).toEqual(["a\\\\b"]);
  });
});
