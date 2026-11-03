import { useCallback, useEffect, useState } from 'react';
import { locale, t } from '../lib/i18n';
import { supabase, type MemberRow, type PlaceNoteRow } from '../lib/supabase';

/** Tips your room left on a place ("order the dry version", "cash only"), and a box to add one. */
export function PlaceNotes({ roomId, spotId, me, members, isHost, onError }: { roomId: string; spotId: string; me: MemberRow; members: MemberRow[]; isHost: boolean; onError: (m: string) => void }) {
  const [notes, setNotes] = useState<PlaceNoteRow[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('place_notes').select('*').eq('room_id', roomId).eq('spot_id', spotId).order('created_at', { ascending: false });
    if (error) return onError(error.message);
    setNotes(data as PlaceNoteRow[]);
  }, [roomId, spotId]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('place_notes').insert({ room_id: roomId, spot_id: spotId, member_id: me.id, body: body.slice(0, 200) });
      if (error) throw new Error(error.message);
      setDraft('');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from('place_notes').delete().eq('id', id);
    if (error) onError(error.message);
    await load();
  };

  return (
    <section aria-labelledby="place-notes-label" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 id="place-notes-label" className="field-label" style={{ margin: 0 }}>
        {t('Tips from your room')}
      </h3>
      {notes && notes.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {notes.map((n) => (
            <li key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 14, background: 'var(--bar-track)' }}>
              <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' }}>“{n.body}”</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {nameOf(n.member_id)} · {new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(n.created_at))}
                </span>
              </span>
              {(n.member_id === me.id || isHost) && (
                <button
                  type="button"
                  className="press"
                  aria-label={t('Delete tip: {text}', { text: n.body })}
                  onClick={() => void remove(n.id)}
                  style={{ minWidth: 36, minHeight: 36, border: 'none', background: 'none', color: 'var(--muted)', fontSize: 18 }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        notes && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('No tips yet. What should your kaki know before going?')}</span>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <label htmlFor="place-note" className="sr-only">
          {t('Add a tip')}
        </label>
        <input id="place-note" className="input" maxLength={200} placeholder={t('e.g. Order the dry version. Cash only.')} value={draft} onChange={(e) => setDraft(e.target.value)} style={{ height: 44 }} />
        <button type="submit" className="btn btn--secondary press" disabled={busy || !draft.trim()} style={{ height: 44, padding: '0 16px', flexShrink: 0 }}>
          {t('Add')}
        </button>
      </form>
    </section>
  );
}
