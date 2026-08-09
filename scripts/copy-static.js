// Copies non-.ts static assets (html/css) from src/renderer into dist/renderer,
// since tsc only emits compiled .js and doesn't touch other file types.
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'renderer');
const outDir = path.join(__dirname, '..', 'dist', 'renderer');

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else if (!entry.name.endsWith('.ts')) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(srcDir, outDir);
console.log('[copy-static] renderer assets copied to dist/renderer');
