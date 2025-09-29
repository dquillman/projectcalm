const fs = require('fs');

function clean(inputPath, outputPath) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { out.push(''); continue; }
    const total = trimmed.length;
    const junkCount = (trimmed.match(/[\?\uFFFD]/g) || []).length;
    const ratio = junkCount / total;
    if (ratio > 0.5) {
      // Drop heavily corrupted lines
      out.push('');
      continue;
    }
    // Remove stray replacement chars
    line = line.replace(/[\uFFFD]/g, '');
    // Compress repeated ? surrounded by non-code context
    if (/^[\?]+$/.test(trimmed)) { out.push(''); continue; }
    // Remove leading/trailing ? noise
    line = line.replace(/^[\?\s]+/, '').replace(/[\?\s]+$/, '');
    // Collapse isolated ? between spaces
    line = line.replace(/\s\?\s/g, ' ');
    out.push(line);
  }
  fs.writeFileSync(outputPath, out.join('\n'), 'utf8');
}

if (require.main === module) {
  const src = process.argv[2];
  const dst = process.argv[3] || src.replace(/\.tsx?$/, '.clean.tsx');
  if (!src) {
    console.error('Usage: node tools/clean-snapshot.js <input> [output]');
    process.exit(1);
  }
  clean(src, dst);
}

module.exports = { clean };

