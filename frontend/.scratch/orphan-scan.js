const fs = require('fs');
const path = require('path');

const root = 'D:\\AI\\Projects\\ACCC inspection\\frontend';
const skipDirs = new Set(['node_modules', '.expo', '.metro-cache', 'dist', 'coverage', '__tests__', 'docs', '.git', '.scratch']);
const files = [];

function walk(d) {
  let entries;
  try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!skipDirs.has(e.name)) walk(p);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      files.push(p);
    }
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'app'));
walk(path.join(root, '__mocks__'));
walk(path.join(root, 'scripts'));

const content = new Map();
for (const f of files) {
  try { content.set(f, fs.readFileSync(f, 'utf8')); } catch { content.set(f, ''); }
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const allContent = [...content.values()].join('\n');

console.log('=== FILES WITH ZERO IMPORT/CONSUMER REFERENCES ===');
for (const f of files) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  const base = path.basename(f, path.extname(f));
  const isTest = /\.(test|spec)\./.test(rel) || rel.includes('__tests__');
  const consumers = [];
  for (const [other, c] of content) {
    if (other === f) continue;
    if (new RegExp(`\\b${esc(base)}\\b`).test(c)) consumers.push(other);
  }
  if (!isTest && consumers.length === 0) {
    console.log(`NO-REF ${rel}`);
  } else if (!isTest) {
    const srcConsumers = consumers.filter(c => !c.includes('__tests__'));
    if (srcConsumers.length === 0) {
      console.log(`TEST-ONLY ${rel}`);
    }
  }
}

console.log('\n=== ROUTES DEFINED IN app/ ===');
const routePatterns = [];
for (const f of files) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  if (rel.startsWith('app/')) {
    const route = '/' + rel.replace(/^app\//, '').replace(/\.(ts|tsx)$/, '').replace(/\/index$/, '') || '/';
    routePatterns.push({ route, file: rel });
  }
}
for (const rp of routePatterns) {
  const base = rp.route.replace(/\/$/, '');
  const refCount = (allContent.match(new RegExp(`['"]${esc(base)}['"]`), 'g') || []).length;
  console.log(`${rp.route} -> ${rp.file} (string refs: ${refCount})`);
}

console.log('\n=== ASSET REFERENCES ===');
const assets = [];
try {
  const walkAssets = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkAssets(p);
      else assets.push({ path: p, rel: path.relative(root, p).replace(/\\/g, '/') });
    }
  };
  walkAssets(path.join(root, 'assets'));
} catch {}
const appJson = fs.existsSync(path.join(root, 'app.json')) ? fs.readFileSync(path.join(root, 'app.json'), 'utf8') : '';
for (const a of assets) {
  const base = path.basename(a.rel);
  const hits = (allContent.match(new RegExp(esc(base), 'g')) || []).length;
  const hitsJson = (appJson.match(new RegExp(esc(base), 'g')) || []).length;
  console.log(`${a.rel} (in code: ${hits}, in app.json: ${hitsJson})`);
}

console.log('\n=== DEPENDENCY USAGE (deps with zero import references) ===');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const configText = [];
for (const cfg of ['app.json', 'eas.json', 'metro.config.js', 'eslint.config.js', 'jest.config.js', 'jest.setup.ts', 'tsconfig.json']) {
  const p = path.join(root, cfg);
  if (fs.existsSync(p)) configText.push(fs.readFileSync(p, 'utf8'));
}
const configAll = configText.join('\n');
const allCode = allContent + '\n' + configAll + '\n' + appJson;
for (const [name, ver] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  const hits = (allCode.match(new RegExp(`['"]${esc(name)}['"]|from ['"]${esc(name)}`, 'g')) || []).length;
  if (hits === 0) {
    console.log(`UNUSED-DEP ${name}@${ver}`);
  }
}
