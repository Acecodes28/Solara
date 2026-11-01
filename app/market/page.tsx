'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { Banner, Card, CardTitle, Pill, SkeletonRows } from '@/components/ui';
import { useApi, type FieldListItem } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';

interface Resp { commodities: { commodity: string; mandis: { mandi: string; district: string | null; state: string | null; years: number; firstYear: number; lastYear: number; source: string }[] }[]; cedaConfigured: boolean }

export default function MarketPage() {
  const { t } = useApp();
  const { data, loading, error } = useApi<Resp>('/api/market/commodities');
  const fields = useApi<{ fields: FieldListItem[] }>('/api/fields').data?.fields ?? [];
  const total = data?.commodities.reduce((s, c) => s + c.mandis.length, 0) ?? 0;

  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('market_title')} subtitle={t('market_sub')} />
      {error && <Banner tone="danger">{error.message}</Banner>}
      {data && total === 0 && (
        <Card className="mb-4">
          <CardTitle>No mandi price history stored yet</CardTitle>
          <p className="text-sm text-muted">Sell-or-hold uses real monthly modal prices from CEDA Agri Market Data (Ashoka University, from Agmarknet). Solara never invents prices. To add them:</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
            <li>{data.cedaConfigured ? 'A CEDA key is configured: choose a mandi on a field’s Market tab and refresh the field.' : <>Get a free key at <span className="font-medium">api.ceda.ashoka.edu.in</span> and add it to the server configuration (see Data Health), or</>}</li>
            <li>Download monthly CSVs for Wheat or Soybean from <span className="font-medium">agmarknet.ceda.ashoka.edu.in</span> into <code className="rounded bg-page px-1">data/raw/ceda/</code> and run <code className="rounded bg-page px-1">npm run import:ceda</code>.</li>
          </ol>
        </Card>
      )}
      {loading && !data ? <Card><SkeletonRows /></Card> : data && total > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.commodities.map((c) => (
            <Card key={c.commodity}>
              <CardTitle right={<Pill>{c.mandis.length} mandis</Pill>}>{t(c.commodity as 'Wheat')}</CardTitle>
              {c.mandis.length === 0 ? <p className="text-sm text-muted">No history stored.</p> : (
                <div className="table-wrap">
                  <table className="data-table stack-table">
                    <thead><tr><th>Mandi</th><th>District</th><th>Years</th><th>Range</th></tr></thead>
                    <tbody>
                      {c.mandis.map((m) => (
                        <tr key={m.mandi}>
                          <td data-label="Mandi" className="font-medium">{m.mandi}</td>
                          <td data-label="District">{m.district ?? '—'}</td>
                          <td data-label="Years">{m.years}{m.years < 8 && <span className="ml-1"><Pill tone="warning">under 8</Pill></span>}</td>
                          <td data-label="Range">{m.firstYear}–{m.lastYear}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-muted">Source: {c.mandis[0]?.source ?? 'CEDA Agri Market Data'}</p>
            </Card>
          ))}
        </div>
      )}
      {fields.length > 0 && (
        <Card className="mt-4">
          <CardTitle>Sell-or-hold for your fields</CardTitle>
          <ul className="divide-y divide-line">
            {fields.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span><span className="font-medium">{f.name}</span> <span className="text-muted">· {t(f.crop)} · {f.mandi ?? 'no mandi chosen'}</span></span>
                <Link href={`/fields/${f.id}?tab=market`} className="font-semibold text-primary hover:underline">Open market tab</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
