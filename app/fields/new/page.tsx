'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import area from '@turf/area';
import centroid from '@turf/centroid';
import { PageHeader } from '@/components/AppShell';
import { DrawMap, type DrawMode } from '@/components/maps';
import { Banner, Button, Card, cx } from '@/components/ui';
import { IconGps, IconPin, IconPolygon, IconSearch, IconField } from '@/components/icons';
import { IngestProgress, type Job } from '@/components/IngestProgress';
import { api, ApiError } from '@/lib/client';
import { useApp } from '@/lib/i18n/context';
import { fmtCoord, fmtNum } from '@/lib/format';

type Step = 1 | 2 | 3;
interface Seed { name: string; lat: number; lon: number; district: string | null }
interface GeoHit { name: string; lat: number; lon: number; district: string | null; state: string | null }
interface Mandi { mandi: string; district: string | null; years: number }

const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export default function NewFieldPage() {
  const { t } = useApp();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<DrawMode>('polygon');
  const [vertices, setVertices] = useState<[number, number][]>([]);
  const [closed, setClosed] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [fly, setFly] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<Seed[]>([]);

  const [name, setName] = useState('');
  const [crop, setCrop] = useState<'Wheat' | 'Soybean' | null>(null);
  const [sowing, setSowing] = useState('');
  const [mandi, setMandi] = useState('');
  const [pointArea, setPointArea] = useState('');
  const [mandis, setMandis] = useState<Record<string, Mandi[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const opened = useRef(false);

  useEffect(() => {
    api<{ seeds: Seed[] }>('/api/location/seeds').then((r) => setSeeds(r.seeds)).catch(() => undefined);
    api<{ commodities: { commodity: string; mandis: Mandi[] }[] }>('/api/market/commodities')
      .then((r) => setMandis(Object.fromEntries(r.commodities.map((c) => [c.commodity, c.mandis])))).catch(() => undefined);
  }, []);

  const geo = useMemo(() => {
    if (mode === 'polygon' && closed && vertices.length >= 3) {
      const ring = [...vertices.map(([lat, lon]) => [lon, lat]), [vertices[0][1], vertices[0][0]]];
      const f = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [ring] } };
      const c = centroid(f).geometry.coordinates;
      return { areaHa: area(f) / 10_000, lat: c[1], lon: c[0], polygon: f.geometry };
    }
    if (mode === 'pin' && point) return { areaHa: null, lat: point.lat, lon: point.lon, polygon: null };
    return null;
  }, [mode, closed, vertices, point]);

  const onMapClick = (lat: number, lon: number) => {
    setLocError(null);
    if (mode === 'pin') { setPoint({ lat, lon }); return; }
    if (closed) return;
    if (vertices.length >= 3) {
      const [flat, flon] = vertices[0];
      if (Math.abs(flat - lat) < 0.00025 && Math.abs(flon - lon) < 0.00025) { setClosed(true); return; }
    }
    setVertices((v) => [...v, [lat, lon]]);
  };

  const goTo = (lat: number, lon: number, note: string) => {
    setFly({ lat, lon, zoom: 15 });
    setLocNote(note);
    if (mode === 'pin') setPoint({ lat, lon });
  };

  const useGps = () => {
    if (!navigator.geolocation) { setLocError('GPS is not available in this browser.'); return; }
    setBusy('gps');
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(null); setMode('pin'); setPoint({ lat: p.coords.latitude, lon: p.coords.longitude }); setFly({ lat: p.coords.latitude, lon: p.coords.longitude, zoom: 16 }); setLocNote(`GPS fix, accuracy about ${Math.round(p.coords.accuracy)} m`); },
      (e) => { setBusy(null); setLocError(e.code === 1 ? 'Location permission was denied.' : 'Could not get a GPS fix.'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const lookupPin = async () => {
    setPinError(null);
    if (!/^\d{6}$/.test(pin)) { setPinError('Pincode must be exactly 6 digits.'); return; }
    setBusy('pin');
    try {
      const r = await api<{ district: string; state: string; point: { lat: number; lon: number } | null }>(`/api/location/pincode/${pin}`);
      if (r.point) goTo(r.point.lat, r.point.lon, `${r.district}, ${r.state} (pincode ${pin}). Zoom in and mark your field.`);
      else setPinError('Pincode found but could not be placed on the map. Try district search.');
    } catch (e) {
      setPinError(e instanceof ApiError ? e.message : 'Lookup failed.');
    } finally { setBusy(null); }
  };

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy('search');
    try {
      const r = await api<{ results: GeoHit[] }>(`/api/location/search?q=${encodeURIComponent(q.trim())}`);
      setHits(r.results);
      if (!r.results.length) setLocError('No places found. Try another spelling.');
    } catch (e) {
      setLocError(e instanceof ApiError ? e.message : 'Search failed.');
    } finally { setBusy(null); }
  };

  const nextFromLocation = () => {
    if (!geo) { setLocError('Draw the field or enter a location.'); return; }
    if (geo.areaHa != null && (geo.areaHa < 0.05 || geo.areaHa > 500)) { setLocError(`Field area must be 0.05 to 500 hectares (drawn: ${geo.areaHa.toFixed(2)} ha).`); return; }
    setStep(2);
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (name.trim().length < 1 || name.trim().length > 60) errs.name = 'Name must be 1 to 60 characters.';
    if (!crop) errs.crop = 'Choose a crop.';
    if (!sowing || sowing < '2005-01-01' || sowing > todayIst()) errs.sowingDate = 'Sowing date must be between 2005-01-01 and today.';
    const pa = parseFloat(pointArea);
    if (mode === 'pin' && !(pa >= 0.05 && pa <= 500)) errs.areaHa = 'Area must be between 0.05 and 500 hectares.';
    setErrors(errs);
    if (Object.keys(errs).length || !geo) return;
    setSaving(true);
    try {
      const r = await api<{ field: { id: string } }>('/api/fields', {
        method: 'POST',
        json: {
          name: name.trim(), crop, sowingDate: sowing, mandi: mandi || null,
          ...(mode === 'polygon' ? { polygon: geo.polygon } : { point: { lat: geo.lat, lon: geo.lon }, areaHa: pa }),
        },
      });
      setFieldId(r.field.id);
      setStep(3);
      await api(`/api/fields/${r.field.id}/ingest`, { method: 'POST' });
    } catch (e) {
      if (e instanceof ApiError) {
        const key = e.field === 'location' ? 'location' : e.field ?? 'form';
        if (key === 'location') { setStep(1); setLocError(e.message); } else setErrors({ [key]: e.message });
      }
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (!fieldId) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await api<{ ingestion: Job[] }>(`/api/fields/${fieldId}`);
        if (stop) return;
        setJobs(r.ingestion);
        const byKind = (k: string) => r.ingestion.find((j) => j.kind === k);
        const weatherDone = ['done', 'failed'].includes(byKind('history')?.status ?? '') && ['done', 'failed'].includes(byKind('soil')?.status ?? '');
        const allDone = r.ingestion.length === 4 && r.ingestion.every((j) => j.status === 'done' || j.status === 'failed');
        if (allDone && !opened.current) {
          opened.current = true;
          setTimeout(() => router.push(`/fields/${fieldId}`), 900);
          return;
        }
        if (!stop) setTimeout(poll, weatherDone ? 1500 : 2000);
      } catch {
        if (!stop) setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { stop = true; };
  }, [fieldId, router]);

  const steps = ['Location', 'Details', 'Save'];

  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('new_title')} subtitle={t('new_sub')} />
      <ol className="mb-5 flex items-center gap-2 text-sm" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cx('inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200', step > i + 1 ? 'bg-success text-white' : step === i + 1 ? 'bg-primary text-white' : 'bg-white text-muted ring-1 ring-line')}>{i + 1}</span>
            <span className={cx('font-medium', step === i + 1 ? 'text-ink' : 'text-muted')}>{s}</span>
            {i < 2 && <span className="mx-1 h-px w-6 bg-line sm:w-12" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="grid animate-fadeUp gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="!p-0 overflow-hidden">
            <div className="flex flex-wrap gap-2 border-b border-line p-3">
              <div className="inline-flex rounded-ctl bg-page p-1" role="radiogroup" aria-label="Location type">
                {([['polygon', 'Draw field', IconPolygon], ['pin', 'Drop a pin', IconPin]] as const).map(([m, label, Icon]) => (
                  <button key={m} role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setLocError(null); }} className={cx('tab', mode === m && 'bg-white text-primary shadow-sm')}>
                    <Icon size={18} /> {label}
                  </button>
                ))}
              </div>
              {mode === 'polygon' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={vertices.length === 0 || closed} onClick={() => setVertices((v) => v.slice(0, -1))}>Undo</Button>
                  <Button variant="secondary" disabled={vertices.length < 3 || closed} onClick={() => setClosed(true)}>Finish shape</Button>
                  <Button variant="ghost" disabled={vertices.length === 0} onClick={() => { setVertices([]); setClosed(false); }}>Clear</Button>
                </div>
              )}
            </div>
            <DrawMap mode={mode} vertices={vertices} closed={closed} point={point} flyTarget={fly} onMapClick={onMapClick} height={420} />
            <p className="px-3 py-2 text-xs text-muted">
              {mode === 'polygon' ? (closed ? 'Shape finished. Clear to redraw.' : 'Zoom in and tap each corner of your field. Tap the first corner or “Finish shape” to close it.') : 'Tap the map to place your field.'}
            </p>
          </Card>

          <div className="space-y-4">
            <Card>
              <h2 className="mb-3 text-[15px] font-semibold">Find your field</h2>
              <Button variant="secondary" className="w-full" onClick={useGps} disabled={busy === 'gps'}><IconGps size={18} /> {busy === 'gps' ? 'Locating…' : 'Use my GPS'}</Button>
              <label className="label mt-4" htmlFor="pin">Pincode</label>
              <div className="flex gap-2">
                <input id="pin" className="input" inputMode="numeric" maxLength={6} placeholder="452001" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && lookupPin()} />
                <Button variant="secondary" onClick={lookupPin} disabled={busy === 'pin'}>Go</Button>
              </div>
              {pinError && <p className="field-error">{pinError}</p>}
              <label className="label mt-4" htmlFor="q">District or town</label>
              <div className="flex gap-2">
                <input id="q" className="input" maxLength={60} placeholder="Sehore" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
                <Button variant="secondary" onClick={search} disabled={busy === 'search'} aria-label="Search"><IconSearch size={18} /></Button>
              </div>
              {hits.length > 0 && (
                <ul className="mt-2 max-h-48 animate-fadeIn overflow-y-auto rounded-ctl border border-line">
                  {hits.map((h, i) => (
                    <li key={i}><button className="w-full px-3 py-2.5 text-left text-sm hover:bg-page" onClick={() => { goTo(h.lat, h.lon, `${h.name}${h.district ? `, ${h.district}` : ''}${h.state ? `, ${h.state}` : ''}`); setHits([]); }}>
                      <span className="font-medium">{h.name}</span> <span className="text-muted">{[h.district, h.state].filter(Boolean).join(', ')}</span>
                    </button></li>
                  ))}
                </ul>
              )}
              {seeds.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-muted">Start near</p>
                  <div className="flex flex-wrap gap-1.5">
                    {seeds.map((s) => <button key={s.name} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary" onClick={() => goTo(s.lat, s.lon, `${s.name}, Madhya Pradesh`)}>{s.name}</button>)}
                  </div>
                </div>
              )}
            </Card>
            <Card>
              {locNote && <p className="mb-2 text-sm text-muted">{locNote}</p>}
              {geo ? (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-xs text-muted">Area</dt><dd className="font-semibold">{geo.areaHa != null ? `${fmtNum(geo.areaHa, 2)} ha` : 'enter in step 2'}</dd></div>
                  <div><dt className="text-xs text-muted">Centre</dt><dd className="font-semibold tabular-nums">{fmtCoord(geo.lat)}, {fmtCoord(geo.lon)}</dd></div>
                </dl>
              ) : <p className="text-sm text-muted">No location yet.</p>}
              {locError && <div className="mt-3"><Banner tone="danger">{locError}</Banner></div>}
              <Button className="mt-4 w-full" onClick={nextFromLocation}>Next: details</Button>
            </Card>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card className="mx-auto max-w-2xl animate-fadeUp">
          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="name">Field name</label>
              <input id="name" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="North plot" aria-invalid={!!errors.name} />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>
            <div>
              <span className="label">Crop</span>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Crop">
                {(['Wheat', 'Soybean'] as const).map((c) => (
                  <button key={c} role="radio" aria-checked={crop === c} onClick={() => setCrop(c)}
                    className={cx('card card-hover flex min-h-[92px] flex-col items-center justify-center gap-1 p-4 text-center', crop === c && '!border-primary ring-2 ring-primary/20')}>
                    <IconField className={crop === c ? 'text-primary' : 'text-muted'} size={26} />
                    <span className="font-semibold">{t(c)}</span>
                    <span className="text-xs text-muted">{c === 'Wheat' ? 'Rabi · sown Oct–Dec' : 'Kharif · sown Jun–Jul'}</span>
                  </button>
                ))}
              </div>
              {errors.crop && <p className="field-error">{errors.crop}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="sow">Sowing date</label>
                <input id="sow" type="date" className="input" min="2005-01-01" max={todayIst()} value={sowing} onChange={(e) => setSowing(e.target.value)} aria-invalid={!!errors.sowingDate} />
                {errors.sowingDate && <p className="field-error">{errors.sowingDate}</p>}
              </div>
              {mode === 'pin' && (
                <div>
                  <label className="label" htmlFor="area">Field area (hectares)</label>
                  <input id="area" type="number" step="0.01" min="0.05" max="500" className="input" value={pointArea} onChange={(e) => setPointArea(e.target.value)} />
                  {errors.areaHa && <p className="field-error">{errors.areaHa}</p>}
                </div>
              )}
            </div>
            <div>
              <label className="label" htmlFor="mandi">Mandi (optional)</label>
              <select id="mandi" className="input" value={mandi} onChange={(e) => setMandi(e.target.value)} disabled={!crop}>
                <option value="">{crop ? 'No mandi' : 'Choose a crop first'}</option>
                {(crop ? mandis[crop] ?? [] : []).map((m) => <option key={m.mandi} value={m.mandi}>{m.mandi}{m.district ? ` (${m.district})` : ''} · {m.years} years</option>)}
              </select>
              {crop && !(mandis[crop]?.length) && <p className="mt-1 text-xs text-muted">No mandi price history is stored yet. You can choose a mandi later on the Market tab after prices are imported.</p>}
            </div>
            {errors.form && <Banner tone="danger">{errors.form}</Banner>}
            <div className="flex justify-between gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save field'}</Button>
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="mx-auto max-w-2xl animate-fadeUp">
          <h2 className="text-lg font-semibold">Fetching real data for “{name}”</h2>
          <p className="mb-4 text-sm text-muted">20 years of daily weather, the soil profile, satellite history and mandi prices. This usually takes under a minute.</p>
          <IngestProgress jobs={jobs} />
          <div className="mt-5 flex justify-end">
            <Button onClick={() => fieldId && router.push(`/fields/${fieldId}`)} disabled={!fieldId}>Open field now</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
