import { z } from 'zod';
import { fetchJson } from './http';
import { SOURCE } from '../config/sources';

const RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070'; // Current daily price of various commodities from various markets (Mandi)

const Schema = z.object({
  records: z.array(z.object({
    state: z.string().optional(),
    district: z.string().optional(),
    market: z.string(),
    commodity: z.string(),
    variety: z.string().optional(),
    arrival_date: z.string(),
    min_price: z.union([z.string(), z.number()]).optional(),
    max_price: z.union([z.string(), z.number()]).optional(),
    modal_price: z.union([z.string(), z.number()]),
  })).default([]),
});

export const dataGovConfigured = () => !!process.env.DATA_GOV_IN_API_KEY;

export interface LiveReading { market: string; commodity: string; date: string; modal: number; min: number | null; max: number | null }

/** Today's Agmarknet reading for a commodity at a mandi (label: "Live reading"). Never used for recommendations. */
export async function liveReading(commodity: string, mandi: string): Promise<LiveReading | null> {
  const key = process.env.DATA_GOV_IN_API_KEY;
  if (!key) return null;
  const commodityName = commodity === 'Soybean' ? 'Soyabean' : commodity;
  const url = `https://api.data.gov.in/resource/${RESOURCE}?api-key=${encodeURIComponent(key)}&format=json&limit=20&filters%5Bcommodity%5D=${encodeURIComponent(commodityName)}&filters%5Bmarket%5D=${encodeURIComponent(mandi)}`;
  const j = await fetchJson(url, Schema, { source: SOURCE.datagov });
  const r = (j.records ?? [])[0];
  if (!r) return null;
  const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const [d, m, y] = r.arrival_date.split('/');
  return { market: r.market, commodity: r.commodity, date: y && m && d ? `${y}-${m}-${d}` : r.arrival_date, modal: Number(r.modal_price), min: n(r.min_price), max: n(r.max_price) };
}
