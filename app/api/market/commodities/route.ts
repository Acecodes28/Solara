import { handle, json } from '@/lib/api';
import { commoditiesWithHistory } from '@/lib/services/market';
import { cedaConfigured } from '@/lib/sources/ceda';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async () => {
  const rows = await commoditiesWithHistory();
  return json({
    commodities: ['Wheat', 'Soybean'].map((c) => ({
      commodity: c,
      mandis: rows.filter((r) => r.commodity === c).map((r) => ({ mandi: r.mandi, district: r.district, state: r.state, years: Number(r.years), firstYear: Number(r.firstYear), lastYear: Number(r.lastYear), source: r.source })),
    })),
    cedaConfigured: cedaConfigured(),
  });
});
