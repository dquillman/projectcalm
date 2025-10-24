const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

async function rimraf(p) {
  if (!(await exists(p))) return;
  const stat = await fsp.lstat(p);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    const entries = await fsp.readdir(p);
    await Promise.all(entries.map(e => rimraf(path.join(p, e))));
    await fsp.rmdir(p);
  } else {
    await fsp.unlink(p);
  }
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function copyDir(src, dest) {
  if (!(await exists(src))) return;
  await ensureDir(dest);
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(d));
      await fsp.copyFile(s, d);
    }
  }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const outMobile = path.join(root, 'mobile', 'www');
  const outWWW = path.join(root, 'www');
  const includeFiles = ['index.html', 'version.txt'];
  const includeDirs = ['vendor', 'dist'];

  await rimraf(outMobile);
  await rimraf(outWWW);
  await ensureDir(outMobile);
  await ensureDir(outWWW);

  for (const f of includeFiles) {
    const src = path.join(root, f);
    if (await exists(src)) {
      await fsp.copyFile(src, path.join(outMobile, f));
      await fsp.copyFile(src, path.join(outWWW, f));
    }
  }

  for (const dir of includeDirs) {
    const src = path.join(root, dir);
    await copyDir(src, path.join(outMobile, dir));
    await copyDir(src, path.join(outWWW, dir));
  }

  // Basic sanity check with verbose logging
  console.log('Verifying build output...');

  const indexMobile = path.join(outMobile, 'index.html');
  const appMobile = path.join(outMobile, 'dist', 'app.js');
  const indexWWW = path.join(outWWW, 'index.html');
  const appWWW = path.join(outWWW, 'dist', 'app.js');

  if (!(await exists(indexMobile))) {
    throw new Error('❌ mobile/www/index.html missing');
  }
  console.log('✓ mobile/www/index.html exists');

  if (!(await exists(appMobile))) {
    throw new Error('❌ mobile/www/dist/app.js missing — build may have failed');
  }
  console.log('✓ mobile/www/dist/app.js exists');

  if (!(await exists(indexWWW))) {
    throw new Error('❌ www/index.html missing');
  }
  console.log('✓ www/index.html exists');

  if (!(await exists(appWWW))) {
    throw new Error('❌ www/dist/app.js missing');
  }
  console.log('✓ www/dist/app.js exists');

  console.log('✅ Prepared mobile web assets at', outMobile, 'and', outWWW);
}

main().catch((e) => { console.error(e); process.exit(1); });
