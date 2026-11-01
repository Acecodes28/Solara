// AC11: outside tests, no application code may use sample, mock, dummy or fixture data.
import fs from 'fs';
import path from 'path';

const ROOTS = ['app', 'components', 'lib', 'scripts', 'drizzle'];
const SELF = path.normalize('scripts/check-no-mock.mjs');
const PATTERN = /\b(sample|mock|dummy|fixture)s?\b/i;
const hits = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|sql|json)$/.test(e.name) && path.normalize(p) !== SELF) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (PATTERN.test(line)) hits.push(`${p}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
  }
}

for (const r of ROOTS) if (fs.existsSync(r)) walk(r);
if (hits.length) {
  console.error('check-no-mock: found references to mock/sample data outside tests:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('check-no-mock: ok (no sample, mock, dummy or fixture data in application code)');
