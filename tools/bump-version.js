const fs = require('fs');

function read(path) { return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : null; }
function write(path, text) { fs.writeFileSync(path, text, 'utf8'); }

function bumpSemver(v) {
  // Accept forms like 0.1.63 (no leading v)
  const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error('Invalid version in version.txt: ' + v);
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  return `${major}.${minor}.${patch + 1}`;
}

function updateHtmlMeta(file, newV) {
  const src = read(file);
  if (!src) return;
  const out = src.replace(/(meta\s+name=\"app-version\"\s+content=\")(v?\d+\.\d+\.\d+)(\")/i, `$1v${newV}$3`);
  if (out !== src) write(file, out);
}

function updatePackageJsonVersion(newV) {
  const path = 'package.json';
  const src = read(path);
  if (!src) return;
  try {
    const pkg = JSON.parse(src);
    if (pkg.version !== newV) {
      pkg.version = newV;
      const out = JSON.stringify(pkg, null, 2) + '\n';
      write(path, out);
    }
  } catch (_) {
    // ignore JSON parse errors
  }
}

function main() {
  const verPath = 'version.txt';
  const cur = (read(verPath) || '').trim();
  if (!cur) throw new Error('version.txt is empty');
  const next = bumpSemver(cur);
  write(verPath, next + '\n');
  updateHtmlMeta('index.modern.html', next);
  updateHtmlMeta('index.html', next);
  updatePackageJsonVersion(next);
  console.log('Version bumped:', cur, '->', next);
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error(String(e && e.message || e)); process.exit(1); }
}

module.exports = {};
