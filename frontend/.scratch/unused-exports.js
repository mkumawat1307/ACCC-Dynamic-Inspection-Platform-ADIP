const fs = require('fs');
const path = require('path');

const root = 'D:\\AI\\Projects\\ACCC inspection\\frontend';
const skipDirs = new Set(['node_modules', '.expo', '.metro-cache', 'dist', 'coverage', 'docs', '.git', '.scratch', '__tests__']);
const files = [];
function walk(d) {
  let entries;
  try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!skipDirs.has(e.name)) walk(p); }
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'app'));

const content = new Map();
for (const f of files) content.set(f, fs.readFileSync(f, 'utf8'));

// All non-test content combined (prod usage)
const prodFiles = files.filter(f => !f.includes('__tests__'));
const prodAll = prodFiles.map(f => content.get(f)).join('\n');

const exportRe = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;

for (const f of prodFiles) {
  const src = content.get(f);
  const rel = path.relative(root, f).replace(/\\/g, '/');
  const exports = [];
  let m;
  while ((m = exportRe.exec(src)) !== null) exports.push(m[1]);
  // also `export { A, B }` style
  const namedRe = /export\s*\{([^}]+)\}/g;
  while ((m = namedRe.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) exports.push(name);
    }
  }
  const seen = new Set();
  for (const name of exports) {
    if (seen.has(name)) continue;
    seen.add(name);
    // count occurrences of the identifier across prod files, excluding this file
    let count = 0;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    for (const [other, c] of content) {
      if (other === f || other.includes('__tests__')) continue;
      count += (c.match(re) || []).length;
    }
    if (count === 0) {
      console.log(`UNUSED-EXPORT ${rel} :: ${name}`);
    }
  }
}
