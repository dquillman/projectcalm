const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

async function buildBundle({ watch = false } = {}) {
  const outdir = path.resolve('dist');
  if (!fs.existsSync(outdir)) fs.mkdirSync(outdir);

  const opts = {
    entryPoints: ['app.tsx'],
    outfile: path.join(outdir, 'app.js'),
    bundle: true,
    format: 'iife',
    target: ['es2017'],
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    minify: true,
    sourcemap: false,
    logLevel: 'info',
  };

  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    console.log('[watch] watching for changes...');
  } else {
    await esbuild.build(opts);
  }
}

function copyDir(srcDir, dstDir) {
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, entry);
    const d = path.join(dstDir, entry);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function produceIndexHtml() {
  const outdir = path.resolve('dist');
  if (!fs.existsSync(outdir)) fs.mkdirSync(outdir);

  // Prefer the modern template that references external vendor files
  const templatePath = fs.existsSync('index.modern.html') ? 'index.modern.html' : 'index.html';
  let html = fs.readFileSync(templatePath, 'utf8');

  // If template references ./dist/app.js (for running from project root),
  // rewrite to ./app.js since this file is written inside dist/
  html = html.replace(/\.<\/dist>\/?app\.js/g, './app.js'); // defensive, though unlikely
  html = html.replace('./dist/app.js', './app.js');

  // Ensure vendor assets are available next to dist/index.html
  const vendorSrc = path.resolve('vendor');
  const vendorDst = path.join(outdir, 'vendor');
  if (fs.existsSync(vendorSrc)) {
    copyDir(vendorSrc, vendorDst);
  }

  // Copy version.txt if present so index can read it
  const versionFile = path.resolve('version.txt');
  if (fs.existsSync(versionFile)) {
    fs.copyFileSync(versionFile, path.join(outdir, 'version.txt'));
  }

  // Copy favicon and manifest
  const faviconFile = path.resolve('favicon.ico');
  if (fs.existsSync(faviconFile)) {
    fs.copyFileSync(faviconFile, path.join(outdir, 'favicon.ico'));
  }
  const manifestFile = path.resolve('manifest.json');
  if (fs.existsSync(manifestFile)) {
    fs.copyFileSync(manifestFile, path.join(outdir, 'manifest.json'));
  }
  const icon192 = path.resolve('icon-192.png');
  if (fs.existsSync(icon192)) {
    fs.copyFileSync(icon192, path.join(outdir, 'icon-192.png'));
  }
  const icon512 = path.resolve('icon-512.png');
  if (fs.existsSync(icon512)) {
    fs.copyFileSync(icon512, path.join(outdir, 'icon-512.png'));
  }
  const appIco = path.resolve('app.ico');
  if (fs.existsSync(appIco)) {
    fs.copyFileSync(appIco, path.join(outdir, 'app.ico'));
  }

  fs.writeFileSync(path.join(outdir, 'index.html'), html, 'utf8');
}

async function main() {
  const watch = process.argv.includes('--watch');
  await buildBundle({ watch });
  produceIndexHtml();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
