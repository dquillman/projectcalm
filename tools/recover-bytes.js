const fs = require('fs');
const path = require('path');

function recoverBytes(inPath, outPath) {
  const buf = fs.readFileSync(inPath);
  // Many bytes appear as: 0x3F '?' before each actual byte. Keep odd indices.
  const out = Buffer.alloc(Math.floor(buf.length / 2));
  let j = 0;
  for (let i = 1; i < buf.length; i += 2) {
    out[j++] = buf[i];
  }
  const text = out.toString('utf8');
  fs.writeFileSync(outPath, text, 'utf8');
}

if (require.main === module) {
  const src = process.argv[2];
  const dst = process.argv[3] || path.resolve(process.cwd(), 'previous_ui.tsx');
  if (!src) {
    console.error('Usage: node tools/recover-bytes.js <input-file> [output-file]');
    process.exit(1);
  }
  recoverBytes(src, dst);
}

module.exports = { recoverBytes };

