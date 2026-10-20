const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const dirsToClean = [
  path.join(root, 'dist-electron'),
  path.join(root, 'standalone'),
  path.join(root, '.next'),
];

for (const dir of dirsToClean) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`✓ Cleaned ${path.basename(dir)}/`);
    } catch (err) {
      console.warn(`Warning: Could not remove ${dir}:`, err.message);
    }
  }
}
