import { useState } from 'react';
import { t } from '../lib/i18n';
import type { JoinRequestRow } from '../lib/supabase';

/** "Ali wants to join · Let in / Not now", for the host. */
export function JoinRequestList({ requests, onAnswer, onToast }: { requests: JoinRequestRow[]; onAnswer: (id: string, letIn: boolean) => Promise<void>; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (r: JoinRequestRow, letIn: boolean) => {
    setBusy(r.id);
    try {
      await onAnswer(r.id, letIn);
      onToast(letIn ? t('{name} is in the room.', { name: r.name }) : t('{name} wasn’t let in.', { name: r.name }));
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {requests.map((r) => (
        <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ flexGrow: 1, minWidth: 120, fontSize: 15, fontWeight: 700 }}>{t('{name} wants to join', { name: r.name })}</span>
          <button type="button" className="btn btn--primary press" disabled={busy === r.id} onClick={() => answer(r, true)} style={{ height: 40, padding: '0 16px', fontSize: 14 }}>
            {t('Let in')}
          </button>
          <button type="button" className="btn btn--secondary press" disabled={busy === r.id} onClick={() => answer(r, false)} style={{ height: 40, padding: '0 14px', fontSize: 14 }}>
            {t('Not now')}
          </button>
        </li>
      ))}
    </ul>
  );
}
