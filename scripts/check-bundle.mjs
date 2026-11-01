// AC13: no secret value or secret variable name may appear in the browser bundle.
import fs from 'fs';
import path from 'path';

const NAMES = ['DATABASE_URL', 'CRON_SECRET', 'COPERNICUS_CLIENT_ID', 'COPERNICUS_CLIENT_SECRET', 'CEDA_API_KEY', 'DATA_GOV_IN_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'TELEGRAM_BOT_TOKEN'];

// Secret values from the environment and local env files (values shorter than 8 characters are ignored).
const values = new Set();
for (const n of NAMES) if (process.env[n] && process.env[n].length >= 8) values.add(process.env[n]);
for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && NAMES.includes(m[1]) && m[2].length >= 8 && !m[2].startsWith('pglite:')) values.add(m[2].replace(/^["']|["']$/g, ''));
  }
}

const dir = path.join('.next', 'static');
if (!fs.existsSync(dir)) {
  console.error('check-bundle: .next/static not found; run next build first.');
  process.exit(1);
}
const hits = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css|html|json|map)$/.test(e.name)) {
      const s = fs.readFileSync(p, 'utf8');
      for (const n of NAMES) if (s.includes(n)) hits.push(`${p}: variable name ${n}`);
      for (const v of values) if (s.includes(v)) hits.push(`${p}: a secret value`);
    }
  }
}
walk(dir);
if (hits.length) {
  console.error('check-bundle: secrets found in the browser bundle:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`check-bundle: ok (${NAMES.length} names and ${values.size} configured values absent from .next/static)`);
