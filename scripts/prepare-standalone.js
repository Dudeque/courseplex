const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const standaloneSource = path.join(root, '.next', 'standalone');
const staticSrc = path.join(root, '.next', 'static');
const staticDest = path.join(standaloneSource, '.next', 'static');
const publicSrc = path.join(root, 'public');
const publicDest = path.join(standaloneSource, 'public');

if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log('✓ Copied .next/static to standalone build');
}

if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log('✓ Copied public assets to standalone build');
}

// Mirror to top-level 'standalone' directory so electron-builder packages it without dotfile filtering
const targetStandalone = path.join(root, 'standalone');
if (fs.existsSync(targetStandalone)) {
  fs.rmSync(targetStandalone, { recursive: true, force: true });
}

if (fs.existsSync(standaloneSource)) {
  fs.cpSync(standaloneSource, targetStandalone, { recursive: true, dereference: true });
  console.log('✓ Mirrored .next/standalone to top-level standalone/ directory');
}
