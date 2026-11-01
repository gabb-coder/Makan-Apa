import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { formatRM, parseRM, type BillItem } from '../lib/money';
import type { MemberRow, TapauOrderRow } from '../lib/supabase';
import type { TapauApi } from '../lib/useTapau';
import { Avatar } from './Avatar';

const CLOSE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const orderLabel = (o: Pick<TapauOrderRow, 'qty' | 'item'>) => (o.qty > 1 ? `${o.qty}× ${o.item}` : o.item);

/** Orders as bill lines: each person's own, priced at qty × price (blank if no price yet). */
export function ordersToItems(orders: TapauOrderRow[]): BillItem[] {
  return orders.map((o) => ({ name: orderLabel(o).slice(0, 40), cents: o.price_cents ? o.price_cents * o.qty : 0, people: [o.member_id] }));
}

/** The order list as text, for the shop or the group chat. */
export function orderListText(place: string, orders: TapauOrderRow[], nameOf: (id: string) => string): string {
  const lines = [t('Tapau from {place}:', { place })];
  for (const o of orders) lines.push(`• ${orderLabel(o)}${o.note ? ` (${o.note})` : ''} · ${nameOf(o.member_id)}`);
  const priced = orders.filter((o) => o.price_cents);
  if (priced.length) lines.push(t('Total so far: {amount}', { amount: formatRM(priced.reduce((n, o) => n + (o.price_cents ?? 0) * o.qty, 0)) }));
  return lines.join('\n');
}

/** On the decided card: start a tapau run, or see the one that's on. */
export function TapauLine({ tapau, members, meId, onOpen }: { tapau: TapauApi; members: MemberRow[]; meId: string; onOpen: () => void }) {
  const { run, orders } = tapau;
  const runner = run && (run.runner_id === meId ? t('You') : (members.find((m) => m.id === run.runner_id)?.name ?? t('Someone')));
  const mine = orders.filter((o) => o.member_id === meId).length;
  return (
    <button
      type="button"
      className="press"
      onClick={onOpen}
      style={{ alignSelf: 'center', minHeight: 44, padding: '0 12px', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: run ? 'var(--ink-2)' : 'var(--accent-text)', textAlign: 'center' }}
    >
      {!run
        ? t('Tapau? Take everyone’s orders')
        : `${run.runner_id === meId ? t('You’re buying from {place}', { place: run.place }) : t('{name} is buying from {place}', { name: runner ?? '', place: run.place })} · ${
            orders.length === 1 ? t('{n} order', { n: orders.length }) : t('{n} orders', { n: orders.length })
          }${run.status === 'open' && !mine && run.runner_id !== meId ? ` · ${t('Add yours')}` : ''}`}
    </button>
  );
}

export function TapauSheet({
  tapau,
  foodName,
  members,
  me,
  onMakeBill,
  onToast,
  onClose,
}: {
  tapau: TapauApi;
  foodName: string;
  members: MemberRow[];
  me: MemberRow;
  /** The runner turns the orders into the meal's bill. */
  onMakeBill: (items: BillItem[], paidBy: string) => void;
  onToast: (m: string) => void;
  onClose: () => void;
}) {
  const { run, orders } = tapau;
  const [place, setPlace] = useState(foodName);
  const [who, setWho] = useState(me.id);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  const realName = (id: string) => members.find((m) => m.id === id)?.name ?? t('Someone');
  const isRunner = run?.runner_id === me.id;
  const open = run?.status === 'open';
  const cents = price.trim() ? parseRM(price) : null;
  const priceBad = price.trim() !== '' && cents === null;

  const act = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) onToast(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const byPerson = members
    .map((m) => ({ member: m, lines: orders.filter((o) => o.member_id === m.id) }))
    .filter((g) => g.lines.length);
  const total = orders.reduce((n, o) => n + (o.price_cents ?? 0) * o.qty, 0);
  const unpriced = orders.filter((o) => !o.price_cents).length;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="tapau-title" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92dvh', overflowY: 'auto' }}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center', flexShrink: 0 }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="eyebrow">{run ? (isRunner ? t('You’re buying from {place}', { place: run.place }) : t('{name} is buying from {place}', { name: realName(run.runner_id), place: run.place })) : foodName}</span>
            <h2 id="tapau-title" className="title title--sm" style={{ fontSize: 24 }}>
              {t('Tapau run')}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            {CLOSE_ICON}
          </button>
        </header>

        {!run ? (
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (place.trim()) void act(() => tapau.start(me.id, place), t('Run started. Everyone can add their orders.'));
            }}
          >
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              {t('Going to buy? Start a run and everyone adds what they want. When you’re back, the orders become the bill.')}
            </p>
            <label className="field-label" htmlFor="tapau-place">
              {t('Buying from')}
            </label>
            <input id="tapau-place" className="input" maxLength={60} value={place} onChange={(e) => setPlace(e.target.value)} />
            <button type="submit" className="btn btn--primary press" disabled={busy || !place.trim()} style={{ height: 52 }}>
              {t('Start the run, I’m buying')}
            </button>
          </form>
        ) : (
          <>
            {byPerson.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{t('No orders yet.')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byPerson.map(({ member, lines }) => (
                  <div key={member.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
                      <Avatar name={member.name} color={member.color} size={24} />
                      {nameOf(member.id)}
                    </span>
                    {lines.map((o) => (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 32, fontSize: 14 }}>
                        <span style={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                          {orderLabel(o)}
                          {o.note && <span style={{ color: 'var(--muted)' }}> · {o.note}</span>}
                        </span>
                        {isRunner ? (
                          <PriceInput order={o} onSave={(c) => act(() => tapau.updateOrder(o.id, { price_cents: c }))} />
                        ) : (
                          o.price_cents !== null && <span style={{ color: 'var(--ink-2)' }}>{formatRM(o.price_cents * o.qty)}</span>
                        )}
                        {(isRunner || (open && o.member_id === me.id)) && (
                          <button
                            type="button"
                            className="icon-btn press"
                            aria-label={t('Remove {item}', { item: orderLabel(o) })}
                            disabled={busy}
                            onClick={() => void act(() => tapau.removeOrder(o.id))}
                            style={{ width: 36, height: 36 }}
                          >
                            {CLOSE_ICON}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
                  <span>{orders.length === 1 ? t('{n} order', { n: orders.length }) : t('{n} orders', { n: orders.length })}</span>
                  <span>
                    {total ? formatRM(total) : ''}
                    {unpriced > 0 && total > 0 ? ` + ${t('{n} unpriced', { n: unpriced })}` : ''}
                  </span>
                </div>
              </div>
            )}

            {open ? (
              <form
                className="card"
                style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'none' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!item.trim() || priceBad) return;
                  void act(async () => {
                    await tapau.addOrder({ member_id: who, item: item.trim().slice(0, 60), qty, price_cents: cents, note: note.trim().slice(0, 80) || null });
                    setItem('');
                    setPrice('');
                    setNote('');
                    setQty(1);
                  });
                }}
              >
                <span className="field-label">{who === me.id ? t('Add your order') : t('Add an order for {name}', { name: realName(who) })}</span>
                {isRunner && members.length > 1 && (
                  <div className="chip-row" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
                    {members.map((m) => (
                      <button key={m.id} type="button" className="chip press" aria-pressed={who === m.id} onClick={() => setWho(m.id)} style={{ height: 34, padding: '0 12px', fontSize: 13 }}>
                        {nameOf(m.id)}
                      </button>
                    ))}
                  </div>
                )}
                <input className="input" aria-label={t('What do you want?')} placeholder={t('e.g. Nasi lemak ayam')} maxLength={60} value={item} onChange={(e) => setItem(e.target.value)} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="input" aria-label={t('How many')} value={qty} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 76, flexShrink: 0 }}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}×
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    aria-label={t('Price each (RM), if you know it')}
                    placeholder={t('RM each (optional)')}
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    style={{ flexGrow: 1, minWidth: 0 }}
                  />
                </div>
                <input className="input" aria-label={t('Note')} placeholder={t('Note, e.g. less spicy (optional)')} maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
                {priceBad && (
                  <span role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>
                    {t('The price isn’t a number.')}
                  </span>
                )}
                <button type="submit" className="btn btn--primary press" disabled={busy || !item.trim() || priceBad} style={{ height: 48 }}>
                  {t('Add order')}
                </button>
              </form>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{t('Orders are closed.')}</p>
            )}

            {error && (
              <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orders.length > 0 && (
                <a
                  className="btn btn--secondary press"
                  href={`https://wa.me/?text=${encodeURIComponent(orderListText(run.place, orders, realName))}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                >
                  {t('Share the order list')}
                </a>
              )}
              {isRunner && (
                <>
                  {orders.length > 0 && (
                    <button type="button" className="btn btn--primary press" disabled={busy} onClick={() => onMakeBill(ordersToItems(orders), run.runner_id)} style={{ height: 52 }}>
                      {t('Back with the food? Make the bill')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--secondary press"
                    disabled={busy}
                    onClick={() => void act(() => tapau.setOpen(!open), open ? t('Orders closed.') : t('Orders reopened.'))}
                    style={{ height: 44 }}
                  >
                    {open ? t('Close orders') : t('Reopen orders')}
                  </button>
                  <button type="button" className="btn btn--danger press" disabled={busy} onClick={() => void act(() => tapau.cancel(), t('Tapau run cancelled.'))} style={{ height: 44 }}>
                    {t('Cancel the run')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The runner fills in a price once they know it; saved when the field is left. */
function PriceInput({ order, onSave }: { order: TapauOrderRow; onSave: (cents: number | null) => Promise<void> }) {
  const [text, setText] = useState(order.price_cents ? (order.price_cents / 100).toFixed(2) : '');
  useEffect(() => setText(order.price_cents ? (order.price_cents / 100).toFixed(2) : ''), [order.price_cents]);
  return (
    <input
      className="input"
      aria-label={t('Price each for {item} (RM)', { item: orderLabel(order) })}
      inputMode="decimal"
      placeholder="RM"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const cents = text.trim() ? parseRM(text) : null;
        if (text.trim() && cents === null) return;
        if (cents !== order.price_cents) void onSave(cents);
      }}
      style={{ width: 76, height: 36, padding: '0 8px', textAlign: 'right', flexShrink: 0 }}
    />
  );
}
