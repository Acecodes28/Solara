'use client';

import { PageHeader } from '@/components/AppShell';
import { Banner, Card } from '@/components/ui';
import { useApp } from '@/lib/i18n/context';

export default function AboutPage() {
  const { t } = useApp();
  return (
    <div className="animate-fadeUp space-y-4">
      <PageHeader title={t('about_title')} subtitle={t('about_sub')} />
      <Banner tone="warning"><strong>{t('decisionAid')}</strong></Banner>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">What Solara does</h2>
        <p className="text-[15px] leading-relaxed">Solara gives each Wheat or Soybean field in India its own irrigation decision in millimetres, its chance of a water-stress period this season, protective actions for frost, heavy rain and heat, a satellite vegetation check and a sell-or-hold comparison built from past years. Every number shows its source and fetch time. Solara AI answers questions about a field in English or Hindi using only that field’s data.</p>
        <p className="mt-2 text-[15px] leading-relaxed">It does not diagnose pests or diseases, forecast yield, take payments, trade, file forms or contact anyone. The only messages it sends are Telegram alerts to chats you link yourself.</p>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">No login, and what that means</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-[15px]">
          <li>This browser keeps a random 128-bit key that lists the fields it created. It is not an identity.</li>
          <li><strong>Clearing browser storage removes the link to your field list.</strong> Keep a field’s link if you want to find it again.</li>
          <li>Anyone with a field’s link can view that field. Only the browser that created it can edit, delete or link alerts.</li>
          <li>Stored personal data is limited to the field name, its location, its sowing date and any Telegram chat ID you link. Coordinates are shown to four decimal places (about 11 metres).</li>
          <li>Server logs record only a source name, a status and a time.</li>
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Data credits</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Weather data by Open-Meteo.com. ERA5 reanalysis: Copernicus Climate Change Service (C3S) / ECMWF. Ensembles: ECMWF IFS and SEAS5.</li>
          <li>Soil: SoilGrids v2.0, ISRIC World Soil Information (CC BY 4.0).</li>
          <li>Satellite: contains modified Copernicus Sentinel-2 data, Copernicus Data Space Ecosystem.</li>
          <li>Prices: CEDA Agri Market Data, Ashoka University (source: Agmarknet); live readings from data.gov.in.</li>
          <li>Pincodes: India Post via api.postalpincode.in. Place search: Open-Meteo geocoding (GeoNames).</li>
          <li>Map tiles: © OpenStreetMap contributors.</li>
        </ul>
      </Card>
    </div>
  );
}
