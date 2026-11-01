/**
 * Imports CEDA Agri Market Data CSV files from data/raw/ceda/ into price_months.
 * Usage: npm run import:ceda [-- --commodity Wheat --mandi Indore]
 * Stop the dev server first when using the embedded local database (pglite:).
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { sql } from 'drizzle-orm';
import { loadEnv } from './env';
import { normaliseRow, aggregateMonthly, type NormRow } from '../lib/sources/ceda';

const MAX_BYTES = 50 * 1024 * 1024;
const DIR = path.resolve('data/raw/ceda');

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** Splits one CSV line, honouring double quotes. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function readFile(file: string, commodity?: string, mandi?: string): Promise<NormRow[]> {
  const rows: NormRow[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  let header: string[] | null = null;
  let skipped = 0;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!line.trim()) continue;
    const cells = splitCsv(line);
    if (!header) { header = cells.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')); continue; }
    const rec = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    const n = normaliseRow(rec, commodity ?? guessCommodity(file), mandi);
    if (n) rows.push(n); else skipped++;
  }
  console.log(`  ${path.basename(file)}: ${rows.length} rows read, ${skipped} skipped (no modal price, date, commodity or mandi)`);
  return rows;
}

function guessCommodity(file: string) {
  const b = path.basename(file).toLowerCase();
  if (b.includes('wheat')) return 'Wheat';
  if (b.includes('soy')) return 'Soybean';
  return undefined;
}

async function main() {
  loadEnv();
  if (!fs.existsSync(DIR)) throw new Error(`Folder not found: ${DIR}`);
  const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.csv')).map((f) => path.join(DIR, f));
  if (!files.length) { console.log('No CSV files in data/raw/ceda/. See data/raw/ceda/README.md.'); return; }
  const all: NormRow[] = [];
  for (const f of files) {
    const size = fs.statSync(f).size;
    if (size > MAX_BYTES) { console.warn(`  ${path.basename(f)}: skipped, larger than 50 MB`); continue; }
    all.push(...(await readFile(f, arg('commodity'), arg('mandi'))));
  }
  const months = aggregateMonthly(all).filter((m) => m.commodity === 'Wheat' || m.commodity === 'Soybean');
  if (!months.length) { console.log('No Wheat or Soybean monthly prices found.'); return; }

  const { getDb } = await import('../lib/db/client');
  const { priceMonths } = await import('../lib/db/schema');
  const db = await getDb();
  const fetchedAt = new Date();
  for (let i = 0; i < months.length; i += 500) {
    await db.insert(priceMonths).values(months.slice(i, i + 500).map((m) => ({
      commodity: m.commodity, mandi: m.mandi, state: m.state, district: m.district, year: m.year, month: m.month,
      modalPriceRsPerQ: m.modal, minPrice: m.min, maxPrice: m.max, arrivalsTonnes: m.arrivalsTonnes,
      source: 'CEDA Agri Market Data (CSV import)', fetchedAt,
    }))).onConflictDoUpdate({
      target: [priceMonths.commodity, priceMonths.mandi, priceMonths.year, priceMonths.month],
      set: { modalPriceRsPerQ: sql`excluded.modal_price_rs_per_q`, minPrice: sql`excluded.min_price`, maxPrice: sql`excluded.max_price`, arrivalsTonnes: sql`excluded.arrivals_tonnes`, source: sql`excluded.source`, fetchedAt: sql`excluded.fetched_at` },
    });
  }
  const mandis = new Set(months.map((m) => `${m.commodity} · ${m.mandi}`));
  console.log(`Imported ${months.length} monthly prices for ${mandis.size} commodity-mandi pairs:`);
  for (const m of mandis) console.log(`  ${m}`);
  const { recordSuccess } = await import('../lib/sources/status');
  await recordSuccess('CEDA');
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
