const fs = require('fs');
const path = require('path');

const root = 'D:\\AI\\Projects\\ACCC inspection\\frontend';
const skipDirs = new Set(['node_modules', '.expo', '.metro-cache', 'dist', 'coverage', 'docs', '.git', '.scratch']);
const allFiles = [];

function walk(d) {
  let entries;
  try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!skipDirs.has(e.name)) walk(p);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      allFiles.push(p);
    }
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'app'));

const contentMap = new Map();
for (const f of allFiles) {
  try { contentMap.set(f, fs.readFileSync(f, 'utf8')); } catch { contentMap.set(f, ''); }
}

// Build index: normalized absolute path -> file, and handle extensionless/index resolution
const fileSet = new Set(allFiles);

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null; // bare or non-aliased
  let target;
  if (spec.startsWith('@/')) {
    target = path.join(root, spec.slice(2));
  } else {
    target = path.resolve(path.dirname(fromFile), spec);
  }
  // try exact, .ts, .tsx, .js, /index
  const candidates = [target, target + '.ts', target + '.tsx', target + '.js', path.join(target, 'index.ts'), path.join(target, 'index.tsx')];
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

const importers = new Map(); // file -> Set of files that import it
for (const f of allFiles) {
  const src = contentMap.get(f);
  const re = /(?:import\s+[^'"]*?from\s*|require\s*\(\s*|import\s*\()\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const resolved = resolveImport(f, m[1]);
    if (resolved && resolved !== f) {
      if (!importers.has(resolved)) importers.set(resolved, new Set());
      importers.get(resolved).add(f);
    }
  }
}

console.log('=== TRUE ORPHANS (no importer anywhere incl. tests) ===');
for (const f of allFiles) {
  if (f.includes('__tests__')) continue;
  const rel = path.relative(root, f).replace(/\\/g, '/');
  if (!importers.has(f) || importers.get(f).size === 0) {
    console.log(`ORPHAN ${rel}`);
  }
}

console.log('\n=== IMPORTED ONLY BY TESTS ===');
for (const f of allFiles) {
  if (f.includes('__tests__')) continue;
  const imp = importers.get(f);
  if (imp && imp.size > 0) {
    const nonTest = [...imp].filter(i => !i.includes('__tests__'));
    if (nonTest.length === 0) {
      console.log(`TEST-ONLY ${path.relative(root, f).replace(/\\/g, '/')} <- tests`);
    }
  }
}

console.log('\n=== BARREL/INDEX FILES & DatabaseService consumption ===');
for (const f of allFiles) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  if (rel.endsWith('index.ts') || rel.includes('DatabaseService')) {
    const imp = importers.get(f);
    console.log(`${rel} imported by ${imp ? [...imp].map(i => path.relative(root, i).replace(/\\/g, '/')).join(', ') : 'NOTHING'}`);
  }
}

