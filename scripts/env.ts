import fs from 'fs';

/** Loads .env.local then .env into process.env for scripts (existing variables win). */
export function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined && m[2] !== '') process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
