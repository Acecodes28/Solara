'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/AppShell';
import { Banner, Button, ButtonLink, Card, CardTitle, EmptyState, Pill, SkeletonRows } from '@/components/ui';
import { IconPlus, IconTrash } from '@/components/icons';
import { ALERT_LABEL } from '@/components/fieldText';
import { api, ApiError } from '@/lib/client';
import { useApi, type FieldListItem } from '@/lib/hooks';
import { useApp } from '@/lib/i18n/context';
import { fmtDate, fmtDateTime } from '@/lib/format';

interface LinksResp { configured: boolean; links: { id: string; chat: string; createdAt: string }[]; sent: { type: string; date: string; sentAt: string }[] }

function FieldAlerts({ field }: { field: FieldListItem }) {
  const [data, setData] = useState<LinksResp | null>(null);
  const [chatId, setChatId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<LinksResp>(`/api/alerts/telegram?fieldId=${field.id}`).then(setData).catch(() => undefined);
  useEffect(() => { load(); }, [field.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/alerts/telegram', { method: 'POST', json: { fieldId: field.id, chatId: chatId.trim() } });
      setMsg({ ok: true, text: 'Linked. A confirmation message was sent to the chat.' });
      setChatId('');
      setConfirming(false);
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not send. Check the chat ID.' });
    } finally { setBusy(false); }
  };

  const unlink = async (id: string) => {
    try { await api(`/api/alerts/telegram/${id}`, { method: 'DELETE' }); load(); } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not unlink.' }); }
  };

  return (
    <Card>
      <CardTitle right={field.summary?.alertsToday.length ? <span className="flex gap-1">{field.summary.alertsToday.map((a) => <Pill key={a} tone="danger">{ALERT_LABEL[a]}</Pill>)}</span> : <Pill tone="success">No alerts today</Pill>}>{field.name}</CardTitle>
      {!data ? <SkeletonRows rows={2} /> : !data.configured ? (
        <p className="text-sm text-muted">Telegram is not configured on this server (see Data Health for setup). Alerts still show on the field’s Today tab.</p>
      ) : (
        <>
          {data.links.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {data.links.map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2 text-sm">
                  <span>Chat {l.chat} · linked {fmtDate(l.createdAt)}</span>
                  <button className="btn-icon hover:!text-danger" onClick={() => unlink(l.id)} aria-label="Unlink chat"><IconTrash size={18} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="label" htmlFor={`chat-${field.id}`}>Telegram chat ID</label>
              <input id={`chat-${field.id}`} className="input" inputMode="numeric" placeholder="123456789" value={chatId} onChange={(e) => { setChatId(e.target.value.replace(/[^\d-]/g, '')); setConfirming(false); }} />
            </div>
            {!confirming
              ? <Button variant="secondary" disabled={!/^-?\d{3,20}$/.test(chatId)} onClick={() => setConfirming(true)}>Link chat</Button>
              : <Button onClick={link} disabled={busy}>{busy ? 'Sending…' : 'Confirm and send test message'}</Button>}
          </div>
          {confirming && <p className="mt-2 text-xs text-muted">Solara AI will send one confirmation message to this chat now, then at most one message per alert type per day.</p>}
          {msg && <div className="mt-3"><Banner tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Banner></div>}
          {data.sent.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Sent</p>
              <ul className="space-y-1 text-sm">{data.sent.slice(-5).reverse().map((s, i) => <li key={i}>{ALERT_LABEL[s.type] ?? s.type} · {fmtDate(s.date)} · {fmtDateTime(s.sentAt)}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default function AlertsPage() {
  const { t } = useApp();
  const { data, loading } = useApi<{ fields: FieldListItem[] }>('/api/fields');
  const fields = data?.fields ?? [];
  return (
    <div className="animate-fadeUp">
      <PageHeader title={t('alerts_title')} subtitle={t('alerts_sub')} />
      <Card className="mb-4 text-sm text-muted">
        To get your chat ID, open Telegram, start a chat with this app’s bot, then message <span className="font-medium text-ink">@userinfobot</span> and copy the number it returns. Solara sends messages only to chats you link here.
      </Card>
      {loading && !data ? <Card><SkeletonRows /></Card> : fields.length === 0 ? (
        <EmptyState message={t('dash_empty')}><ButtonLink href="/fields/new"><IconPlus size={18} /> {t('addField')}</ButtonLink></EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{fields.map((f) => <FieldAlerts key={f.id} field={f} />)}</div>
      )}
    </div>
  );
}
