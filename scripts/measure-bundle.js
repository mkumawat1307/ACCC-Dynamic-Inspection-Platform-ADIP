const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", ".bundle-measure");

console.log("=== Bundle Size Measurement ===");
console.log(`Output: ${OUTPUT_DIR}\n`);

if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true });
}

const START = Date.now();

try {
  const result = execSync(
    `npx expo export --platform web --output-dir "${OUTPUT_DIR}"`,
    { cwd: path.join(__dirname, ".."), stdio: "pipe", encoding: "utf8", timeout: 120000 }
  );
  console.log("Export successful in", ((Date.now() - START) / 1000).toFixed(1) + "s\n");

  const bundleDir = path.join(OUTPUT_DIR, "_expo", "static", "js", "web");
  if (fs.existsSync(bundleDir)) {
    const files = fs.readdirSync(bundleDir).filter(f => f.endsWith(".js"));
    let totalSize = 0;
    for (const file of files) {
      const filePath = path.join(bundleDir, file);
      const size = fs.statSync(filePath).size;
      totalSize += size;
      console.log(`  ${(size / 1024).toFixed(1)} KB  ${file}`);
    }
    console.log(`\n  Total JS bundle: ${(totalSize / 1024).toFixed(1)} KB`);
  }

  const assetDirs = [
    path.join(OUTPUT_DIR, "_expo", "static", "js", "web"),
    path.join(OUTPUT_DIR, "_expo", "static", "media"),
  ];
  for (const dir of assetDirs) {
    if (fs.existsSync(dir)) {
      const assets = fs.readdirSync(dir).filter(f => !f.endsWith(".js"));
      if (assets.length > 0) {
        let assetSize = 0;
        for (const asset of assets) {
          const fp = path.join(dir, asset);
          const s = fs.statSync(fp).size;
          assetSize += s;
        }
        console.log(`  ${(assetSize / 1024).toFixed(1)} KB  ${path.basename(dir)} assets (${assets.length} files)`);
      }
    }
  }

  const htmlPath = path.join(OUTPUT_DIR, "index.html");
  if (fs.existsSync(htmlPath)) {
    const htmlSize = fs.statSync(htmlPath).size;
    console.log(`  ${(htmlSize / 1024).toFixed(1)} KB  index.html`);
  }

  console.log("\n=== Done ===");
} catch (e) {
  console.error("Export failed:", e.message);
  process.exit(1);
} finally {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
}
