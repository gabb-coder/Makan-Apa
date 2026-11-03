import { useState } from 'react';
import { locale, t } from '../lib/i18n';
import { formatRM, kitty, parseRM } from '../lib/money';
import { hostOf } from '../lib/session';
import type { MemberRow, RoomRow } from '../lib/supabase';
import type { RoomExtras } from '../lib/useRoomExtras';

/**
 * The group kitty: everyone tops up a shared pool (held by the keeper), meals marked "paid from
 * the kitty" come out of it, and each person sees what's left of what they put in.
 */
export function KittyCard({ room, me, members, extras, onToast }: { room: RoomRow; me: MemberRow; members: MemberRow[]; extras: RoomExtras; onToast: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [who, setWho] = useState(me.id);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const { total, each } = kitty(extras.bills, extras.topUps);
  const nameOf = (id: string | null) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  const keeper = room.kitty_keeper ? members.find((m) => m.id === room.kitty_keeper) : undefined;
  const isHost = hostOf(members, room.host_id)?.id === me.id;
  const people = members.filter((m) => !m.left_at || (each.get(m.id) ?? 0) !== 0);

  const save = async () => {
    const cents = parseRM(amount);
    if (cents === null) return onToast(t('Type an amount, like 50.'));
    setBusy(true);
    try {
      await extras.addTopUp(who, cents);
      onToast(t('{name} put {amount} in the kitty.', { name: nameOf(who), amount: formatRM(cents) }));
      setAmount('');
      setAdding(false);
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden="true" style={{ fontSize: 30 }}>
          🫙
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: total < 0 ? 'var(--danger)' : 'var(--ink)' }}>
            {total < 0 ? t('{amount} short', { amount: formatRM(total) }) : formatRM(total)}
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {keeper ? t('In the kitty · held by {name}', { name: nameOf(keeper.id) }) : t('The kitty is off. Turn it on in Settings.')}
          </span>
        </div>
      </div>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }} aria-label={t('Everyone’s part of the kitty')}>
        {people.map((m) => {
          const part = each.get(m.id) ?? 0;
          return (
            <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(m.id)}</span>
              <span style={{ fontWeight: 700, flexShrink: 0, color: part < 0 ? 'var(--accent-text)' : part > 0 ? 'var(--success)' : 'var(--muted)' }}>
                {part < 0 ? t('top up {amount}', { amount: formatRM(part) }) : part > 0 ? t('{amount} left', { amount: formatRM(part) }) : t('even')}
              </span>
            </li>
          );
        })}
      </ul>

      {keeper &&
        (adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4, borderTop: '1px solid var(--divider)' }}
          >
            <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
              <legend className="field-label" style={{ padding: 0, marginBottom: 6 }}>
                {t('Who put money in?')}
              </legend>
              <div className="chip-row" style={{ flexWrap: 'wrap' }}>
                {members
                  .filter((m) => !m.left_at)
                  .map((m) => (
                    <button key={m.id} type="button" className="chip press" aria-pressed={who === m.id} onClick={() => setWho(m.id)}>
                      {nameOf(m.id)}
                    </button>
                  ))}
              </div>
            </fieldset>
            <div style={{ display: 'flex', gap: 8 }}>
              <label htmlFor="kitty-amount" className="sr-only">
                {t('Amount')}
              </label>
              <div style={{ position: 'relative', flexGrow: 1 }}>
                <span aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--muted)' }}>
                  RM
                </span>
                <input id="kitty-amount" className="input" inputMode="decimal" placeholder="50" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ paddingLeft: 46 }} autoFocus />
              </div>
              <button type="submit" className="btn btn--primary press" disabled={busy} style={{ padding: '0 18px', flexShrink: 0 }}>
                {t('Add')}
              </button>
            </div>
            <button type="button" className="press" onClick={() => setAdding(false)} style={{ alignSelf: 'flex-start', minHeight: 36, border: 'none', background: 'none', padding: 0, fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>
              {t('Cancel')}
            </button>
          </form>
        ) : (
          <button type="button" className="btn btn--secondary press" onClick={() => setAdding(true)}>
            {t('Record a top-up')}
          </button>
        ))}

      {extras.topUps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="field-label">{t('Recent top-ups')}</span>
          {extras.topUps.slice(0, 5).map((tu) => {
            const canUndo = tu.created_by === me.id || isHost || room.kitty_keeper === me.id;
            return (
              <div key={tu.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)', minHeight: 36 }}>
                <span style={{ flexGrow: 1, minWidth: 0 }}>
                  {t('{name} put in {amount}', { name: nameOf(tu.member_id), amount: formatRM(tu.amount_cents) })} ·{' '}
                  {new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(tu.created_at))}
                </span>
                {canUndo && (
                  <button
                    type="button"
                    className="press"
                    onClick={() => extras.removeTopUp(tu.id).catch((e: unknown) => onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.')))}
                    style={{ minHeight: 36, border: 'none', background: 'none', padding: '0 4px', fontSize: 13, fontWeight: 700, color: 'var(--accent-text)' }}
                    aria-label={t('Undo top-up of {amount} by {name}', { amount: formatRM(tu.amount_cents), name: nameOf(tu.member_id) })}
                  >
                    {t('Undo')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {keeper && (
        <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
          {t('When adding a bill, choose “🫙 The kitty” under Paid by. Everyone’s share comes out of their part, and nobody owes anybody.')}
        </span>
      )}
    </div>
  );
}
