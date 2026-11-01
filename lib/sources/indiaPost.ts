import { z } from 'zod';
import { fetchJson } from './http';
import { SOURCE } from '../config/sources';

const Schema = z.array(z.object({
  Status: z.string(),
  PostOffice: z.array(z.object({ Name: z.string(), District: z.string(), State: z.string() })).nullable(),
}));

export async function lookupPincode(pin: string): Promise<{ district: string; state: string; offices: string[] } | null> {
  const j = await fetchJson(`https://api.postalpincode.in/pincode/${pin}`, Schema, { source: SOURCE.indiaPost });
  const first = j[0];
  if (!first || first.Status !== 'Success' || !first.PostOffice?.length) return null;
  const po = first.PostOffice;
  return { district: po[0].District, state: po[0].State, offices: po.slice(0, 5).map((p) => p.Name.trim()) };
}
