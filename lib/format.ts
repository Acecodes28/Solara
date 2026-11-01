/** Display formatting. Values are rounded only here, never in computation. */

export const fmtMm = (n: number | null | undefined, digits = 1) => (n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(digits)} mm`);

export const fmtPct = (p: number | null | undefined) => (p == null || !Number.isFinite(p) ? '—' : `${(p * 100).toFixed(1)}%`);

export function fmtRs(n: number | null | undefined, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n < 0 ? '−' : ''}₹${s}`;
}

export const fmtNum = (n: number | null | undefined, digits = 1) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits));

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  return d.toLocaleDateString('en-IN', { ...(iso.length === 10 ? { timeZone: 'UTC' } : IST), day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return `${new Date(iso).toLocaleString('en-IN', { ...IST, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} IST`;
}

export function ageLabel(iso: string | null | undefined) {
  if (!iso) return 'never';
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${h.toFixed(1)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const fmtCoord = (n: number) => n.toFixed(4);
