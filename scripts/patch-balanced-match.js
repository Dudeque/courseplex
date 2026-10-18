const fs = require('node:fs');

const candidates = [
  'node_modules/.pnpm/balanced-match@1.0.2/node_modules/balanced-match/index.js',
  'node_modules/.pnpm/node_modules/balanced-match/index.js',
];

for (const p of candidates) {
  if (fs.existsSync(p)) {
    let c = fs.readFileSync(p, 'utf-8');
    if (!c.includes('balanced.balanced')) {
      c = c.replace(
        'balanced.range = range;',
        'balanced.range = range;\nbalanced.balanced = balanced;\nbalanced.default = balanced;'
      );
      fs.writeFileSync(p, c, 'utf-8');
    }
  }
}
