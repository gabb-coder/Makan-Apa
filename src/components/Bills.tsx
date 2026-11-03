import { useEffect, useRef, useState } from 'react';
import { t, tNodes } from '../lib/i18n';
import { balances, billTotals, formatRM, parsePct, parseRM, settleUp, shares, type BillItem } from '../lib/money';
import type { MealBillRow, MemberRow, SettlementRow } from '../lib/supabase';
import type { RoomExtras } from '../lib/useRoomExtras';
import { qrUrl, removeQrEverywhere, saveQrEverywhere } from '../lib/payQr';
import { Avatar } from './Avatar';

const CLOSE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const sectionStyle = { border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 } as const;
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 14 } as const;

interface Row {
  key: number;
  name: string;
  price: string;
  people: string[];
}

const pctText = (n: number | string | undefined, fallback: string) => (n && Number(n) > 0 ? String(Number(n)) : fallback);

/**
 * Split a meal's bill by what each person had. Starts with one line per person; shared items
 * (a jug of teh tarik, a pizza) are shared between whoever's ticked. Service charge and SST are
 * added on top and shared in proportion to what each person had.
 */
export function BillSheet({
  dayEntryId,
  foodName,
  members,
  meId,
  extras,
  away,
  start,
  onSaved,
  onClose,
}: {
  dayEntryId: string;
  foodName: string;
  members: MemberRow[];
  meId: string;
  extras: RoomExtras;
  /** Who was out for this meal: left off a new bill's lines. */
  away?: ReadonlySet<string>;
  /** A new bill's starting point, e.g. a tapau run's orders. Ignored when there's a bill already. */
  start?: { paidBy: string; items: BillItem[] };
  /** After a save (or removal, with removed true), before the sheet closes. */
  onSaved: (removed: boolean) => void;
  onClose: () => void;
}) {
  const bill = extras.bills.find((b) => b.day_entry_id === dayEntryId) ?? null;
  const nextKey = useRef(0);
  const row = (r: Omit<Row, 'key'>): Row => ({ ...r, key: nextKey.current++ });
  const present = members.filter((m) => !away?.has(m.id) && !m.left_at);
  const eaters = present.length ? present : members;
  const [paidBy, setPaidBy] = useState(bill?.paid_by ?? start?.paidBy ?? meId);
  const [rows, setRows] = useState<Row[]>(() => {
    if (bill?.items?.length) return bill.items.map((i) => row({ name: i.name, price: (i.cents / 100).toFixed(2), people: i.people }));
    if (bill) return [row({ name: '', price: (bill.amount_cents / 100).toFixed(2), people: bill.split_between })];
    if (start?.items.length) return start.items.map((i) => row({ name: i.name, price: i.cents ? (i.cents / 100).toFixed(2) : '', people: i.people }));
    return eaters.map((m) => row({ name: '', price: '', people: [m.id] }));
  });
  const [serviceOn, setServiceOn] = useState(Number(bill?.service_pct ?? 0) > 0);
  const [servicePct, setServicePct] = useState(pctText(bill?.service_pct, '10'));
  const [sstOn, setSstOn] = useState(Number(bill?.sst_pct ?? 0) > 0);
  const [sstPct, setSstPct] = useState(pctText(bill?.sst_pct, '6'));
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [keepOld, setKeepOld] = useState(true);
  const [oldUrl, setOldUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (bill?.receipt_path) void extras.receiptUrl(bill.receipt_path).then(setOldUrl);
  }, [bill?.receipt_path]);
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const nameOf = (id: string) => (id === meId ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  const svc = serviceOn ? parsePct(servicePct) : 0;
  const sst = sstOn ? parsePct(sstPct) : 0;

  // Lines with a price count; a price with nobody ticked, or one that isn't a number, needs fixing.
  const problems: string[] = [];
  const items: BillItem[] = [];
  rows.forEach((r, i) => {
    if (!r.price.trim()) return;
    const cents = parseRM(r.price);
    if (cents === null) problems.push(t('Line {n}: the price isn’t a number.', { n: i + 1 }));
    else if (!r.people.length) problems.push(t('Line {n}: tick who had it.', { n: i + 1 }));
    else items.push({ name: r.name.trim().slice(0, 40), cents, people: r.people });
  });
  if (svc === null) problems.push(t('Service charge should be a percentage from 0 to 30.'));
  if (sst === null) problems.push(t('SST should be a percentage from 0 to 30.'));
  const totals = billTotals(items, svc ?? 0, sst ?? 0);
  const each = items.length ? shares({ paid_by: paidBy, amount_cents: totals.total, split_between: [], items }) : new Map<string, number>();
  const ready = items.length > 0 && problems.length === 0 && totals.total <= 10_000_000;

  const update = (key: number, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const togglePerson = (r: Row, id: string) => update(r.key, { people: r.people.includes(id) ? r.people.filter((p) => p !== id) : [...r.people, id] });
  // Chips for people still in the room, plus anyone who left but is already on this bill.
  const chipMembers = members.filter((m) => !m.left_at || m.id === paidBy || rows.some((r) => r.people.includes(m.id)));
  const everyone = eaters.map((m) => m.id);

  const placeholder = (r: Row) =>
    r.people.length === 1 ? (r.people[0] === meId ? t('Your food') : t("{name}'s food", { name: nameOf(r.people[0]) })) : t('Shared item');

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const oldPath = bill?.receipt_path ?? null;
    let uploaded: string | null = null;
    try {
      if (photo) uploaded = await extras.uploadReceipt(photo.file, dayEntryId);
      const receipt_path = uploaded ?? (keepOld ? oldPath : null);
      await extras.saveBill({
        day_entry_id: dayEntryId,
        paid_by: paidBy,
        amount_cents: totals.total,
        split_between: [...new Set(items.flatMap((i) => i.people))],
        items: items.map((i) => ({ ...i, name: i.name || placeholder({ key: 0, name: '', price: '', people: i.people }) })),
        service_pct: svc ?? 0,
        sst_pct: sst ?? 0,
        receipt_path,
      });
      if (oldPath && oldPath !== receipt_path) void extras.deleteReceipt(oldPath);
      onSaved(false);
      onClose();
    } catch (e) {
      if (uploaded) void extras.deleteReceipt(uploaded);
      setError(e instanceof Error ? e.message : t('Could not save.'));
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await extras.removeBill(dayEntryId);
      onSaved(true);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save.'));
      setBusy(false);
    }
  };

  const shownPhoto = photo?.url ?? (keepOld ? oldUrl : null);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{ maxHeight: '92dvh', overflowY: 'auto' }}
      >
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center', flexShrink: 0 }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="eyebrow">{foodName}</span>
            <h2 id="bill-title" className="title title--sm" style={{ fontSize: 24 }}>
              {t('Split the bill')}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            {CLOSE_ICON}
          </button>
        </header>

        <fieldset style={sectionStyle}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 8 }}>{t('Paid by')}</legend>
          <div className="chip-row" style={{ flexWrap: 'wrap' }}>
            {chipMembers.map((m) => (
              <button key={m.id} type="button" className="chip press" aria-pressed={paidBy === m.id} onClick={() => setPaidBy(m.id)}>
                {nameOf(m.id)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset style={sectionStyle}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 4 }}>{t('What everyone had')}</legend>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{t('Type each price from the receipt, before service charge and SST. Tick more than one person to share an item.')}</p>
          {rows.map((r, i) => (
            <div key={r.key} className="card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input"
                  aria-label={t('Line {n}: item', { n: i + 1 })}
                  placeholder={placeholder(r)}
                  maxLength={40}
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  style={{ flexGrow: 1, minWidth: 0, height: 44 }}
                />
                <input
                  className="input"
                  aria-label={t('Line {n}: price (RM)', { n: i + 1 })}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={r.price}
                  onChange={(e) => update(r.key, { price: e.target.value })}
                  style={{ width: 92, flexShrink: 0, height: 44, fontWeight: 700, textAlign: 'right' }}
                />
                <button
                  type="button"
                  className="icon-btn press"
                  aria-label={t('Remove line {n}', { n: i + 1 })}
                  disabled={rows.length === 1}
                  onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                  style={{ flexShrink: 0 }}
                >
                  {CLOSE_ICON}
                </button>
              </div>
              <div role="group" aria-label={t('Line {n}: who had it', { n: i + 1 })} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {members.length > 2 && (
                  <button
                    type="button"
                    className="chip press"
                    aria-pressed={everyone.every((id) => r.people.includes(id))}
                    onClick={() => update(r.key, { people: everyone.every((id) => r.people.includes(id)) ? [] : everyone })}
                    style={{ height: 36, padding: '0 12px', fontSize: 13 }}
                  >
                    {t('Everyone')}
                  </button>
                )}
                {chipMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chip press"
                    aria-pressed={r.people.includes(m.id)}
                    onClick={() => togglePerson(r, m.id)}
                    style={{ height: 36, padding: '0 12px', fontSize: 13 }}
                  >
                    {nameOf(m.id)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--secondary press"
            onClick={() => setRows((cur) => [...cur, row({ name: '', price: '', people: everyone })])}
            style={{ height: 44 }}
          >
            {t('Add an item')}
          </button>
        </fieldset>

        <fieldset style={sectionStyle}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 4 }}>{t('Charges')}</legend>
          {(
            [
              [t('Service charge'), serviceOn, setServiceOn, servicePct, setServicePct, totals.service, 'bill-service'],
              [t('SST'), sstOn, setSstOn, sstPct, setSstPct, totals.sst, 'bill-sst'],
            ] as const
          ).map(([label, on, setOn, pct, setPct, cents, id]) => (
            <div key={id} style={{ ...rowStyle, minHeight: 44 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: 15 }}>
                <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
                {label}
              </label>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  id={id}
                  className="input"
                  aria-label={t('{charge} percentage', { charge: label })}
                  inputMode="decimal"
                  disabled={!on}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  style={{ width: 60, height: 40, textAlign: 'right' }}
                />
                <span aria-hidden="true">%</span>
                <span style={{ width: 76, textAlign: 'right', color: 'var(--muted)' }}>{on ? formatRM(cents) : '–'}</span>
              </span>
            </div>
          ))}
        </fieldset>

        <section aria-label={t('Summary')} className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'none' }}>
          <div style={rowStyle}>
            <span>{t('Subtotal')}</span>
            <span>{formatRM(totals.subtotal)}</span>
          </div>
          <div style={{ ...rowStyle, fontSize: 17, fontWeight: 800 }}>
            <span>{t('Total')}</span>
            <span data-testid="bill-total">{formatRM(totals.total)}</span>
          </div>
          {each.size > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
              {members
                .filter((m) => each.has(m.id))
                .map((m) => (
                  <div key={m.id} style={rowStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={m.name} color={m.color} size={24} />
                      {nameOf(m.id)}
                      {m.id === paidBy && <span style={{ color: 'var(--muted)', fontSize: 13 }}>· {t('paid')}</span>}
                    </span>
                    <b>{formatRM(each.get(m.id) ?? 0)}</b>
                  </div>
                ))}
            </div>
          )}
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {shownPhoto && (
            <a href={shownPhoto} target="_blank" rel="noreferrer" aria-label={t('Open the receipt photo')} style={{ flexShrink: 0 }}>
              <img src={shownPhoto} alt="" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', display: 'block' }} />
            </a>
          )}
          <button type="button" className="btn btn--secondary press" onClick={() => fileInput.current?.click()} style={{ flexGrow: 1, height: 44 }}>
            {shownPhoto ? t('Change receipt photo') : t('Add receipt photo')}
          </button>
          {shownPhoto && (
            <button
              type="button"
              className="icon-btn press"
              aria-label={t('Remove receipt photo')}
              onClick={() => {
                setPhoto(null);
                setKeepOld(false);
              }}
            >
              {CLOSE_ICON}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            data-testid="receipt-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPhoto({ file, url: URL.createObjectURL(file) });
              e.target.value = '';
            }}
          />
        </div>

        {(error || problems.length > 0) && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
            {error ?? problems[0]}
          </p>
        )}
        <button type="submit" className="btn btn--primary press" disabled={busy || !ready} style={{ height: 52, flexShrink: 0 }}>
          {busy ? t('Saving…') : t('Save bill')}
        </button>
        {bill && (
          <button type="button" className="btn btn--danger press" disabled={busy} onClick={() => void remove()} style={{ flexShrink: 0 }}>
            {t('Remove bill')}
          </button>
        )}
      </form>
    </div>
  );
}

async function copy(text: string, onToast: (m: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    onToast(t('Copied {text}', { text }));
  } catch {
    onToast(t("Couldn't copy. {text}", { text }));
  }
}

/** "DuitNow 012-345 6789 [Copy]" lines for someone you owe. */
/** A full-screen look at someone's DuitNow QR, to scan with a banking app. */
export function QrViewer({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void qrUrl(path).then(setUrl);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [path, onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="qr-title" onClick={(e) => e.stopPropagation()} style={{ alignItems: 'center' }}>
        <h2 id="qr-title" className="title title--sm" style={{ fontSize: 22, alignSelf: 'stretch' }}>
          {t('Pay {name} with DuitNow', { name })}
        </h2>
        {url ? (
          <img src={url} alt={t('DuitNow QR code for {name}', { name })} style={{ width: '100%', maxWidth: 320, borderRadius: 16, background: '#fff' }} />
        ) : (
          <span style={{ color: 'var(--muted)' }}>{t('Loading…')}</span>
        )}
        <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>{t('Scan it with your banking or e-wallet app, then tap Mark paid.')}</span>
        <button type="button" className="btn btn--secondary press" onClick={onClose} style={{ alignSelf: 'stretch', height: 48 }}>
          {t('Close')}
        </button>
      </div>
    </div>
  );
}

/** "Show QR" for someone who has a DuitNow QR saved. */
export function ShowQrButton({ member }: { member: MemberRow | undefined }) {
  const [open, setOpen] = useState(false);
  if (!member?.pay_qr_path) return null;
  return (
    <>
      <button type="button" className="chip press" onClick={() => setOpen(true)} style={{ height: 32, padding: '0 10px', fontSize: 12, alignSelf: 'flex-start' }}>
        {t('Show DuitNow QR')}
      </button>
      {open && <QrViewer path={member.pay_qr_path} name={member.name} onClose={() => setOpen(false)} />}
    </>
  );
}

function PayLines({ member, onToast }: { member: MemberRow | undefined; onToast: (m: string) => void }) {
  if (!member?.pay_duitnow && !member?.pay_bank && !member?.pay_qr_path) return null;
  const line = (label: string, value: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
      <span style={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        {label}: <b>{value}</b>
      </span>
      <button
        type="button"
        onClick={() => void copy(value, onToast)}
        aria-label={t('Copy {label} for {name}', { label, name: member.name })}
        style={{ minHeight: 36, padding: '0 6px', border: 'none', background: 'none', color: 'var(--accent-text)', fontWeight: 700, fontSize: 13, flexShrink: 0 }}
      >
        {t('Copy')}
      </button>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 2 }}>
      {member.pay_duitnow && line(t('DuitNow'), member.pay_duitnow)}
      {member.pay_bank && line(t('Bank'), member.pay_bank)}
      <ShowQrButton member={member} />
    </div>
  );
}

/** The text sent to the group chat: who owes whom, and where to pay them. */
export function settleUpMessage(roomName: string, bills: MealBillRow[], settlements: SettlementRow[], members: MemberRow[]): string {
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id: string) => byId.get(id)?.name ?? t('Someone');
  const plan = settleUp(balances(bills, settlements));
  if (!plan.length) return `${roomName}: ${t("Everyone's settled up.")}`;
  const lines = [`${roomName} · ${t('Who owes whom')}`, ''];
  for (const p of plan) lines.push(`• ${t('{from} owes {to} {amount}', { from: name(p.from_member), to: name(p.to_member), amount: formatRM(p.amount_cents) })}`);
  const payees = [...new Set(plan.map((p) => p.to_member))].map((id) => byId.get(id)).filter((m): m is MemberRow => !!m && !!(m.pay_duitnow || m.pay_bank));
  if (payees.length) {
    lines.push('');
    for (const m of payees) {
      const how = [m.pay_duitnow && `${t('DuitNow')} ${m.pay_duitnow}`, m.pay_bank].filter(Boolean).join(' · ');
      lines.push(t('Pay {name}: {how}', { name: m.name, how }));
    }
  }
  return lines.join('\n');
}

/** Bills tab: what everyone's owed, the payments that settle it, and recent paybacks. */
export function SettleUpCard({
  roomName,
  bills,
  settlements,
  members,
  meId,
  onRecord,
  onUndo,
  onToast,
}: {
  roomName: string;
  bills: MealBillRow[];
  settlements: SettlementRow[];
  members: MemberRow[];
  meId: string;
  onRecord: (p: { from_member: string; to_member: string; amount_cents: number }) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
  onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const nameOf = (id: string) => (id === meId ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  const net = balances(bills, settlements);
  const plan = settleUp(net);
  const spent = bills.reduce((n, b) => n + b.amount_cents, 0);
  const mine = net.get(meId) ?? 0;
  const recent = settlements.slice(-3).reverse();
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  if (!bills.length) {
    return (
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{t('No bills yet')}</span>
        <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          {t('After a meal, tap it below to add who paid and what everyone had. The app works out who owes whom.')}
        </span>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {bills.length === 1
            ? t('{amount} paid across {n} meal.', { amount: formatRM(spent), n: bills.length })
            : t('{amount} paid across {n} meals.', { amount: formatRM(spent), n: bills.length })}
        </span>
        <span style={{ fontSize: 18, fontWeight: 800, color: mine < 0 ? 'var(--accent-text)' : undefined }}>
          {mine < 0 ? t('You owe {amount}', { amount: formatRM(mine) }) : mine > 0 ? t("You're owed {amount}", { amount: formatRM(mine) }) : t("You're all square")}
        </span>
      </div>
      {plan.length === 0 ? (
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t("Everyone's settled up.")}</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan.map((p) => {
            const key = `${p.from_member}>${p.to_member}`;
            const owes = { from: <b>{nameOf(p.from_member)}</b>, to: <b>{nameOf(p.to_member)}</b>, amount: formatRM(p.amount_cents) };
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flexGrow: 1, fontSize: 15 }}>
                    {p.from_member === meId ? tNodes('{from} owe {to} {amount}', owes) : tNodes('{from} owes {to} {amount}', owes)}
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary press"
                    disabled={busy !== null}
                    onClick={() => void act(key, () => onRecord(p))}
                    style={{ height: 36, padding: '0 12px', fontSize: 13, flexShrink: 0 }}
                  >
                    {busy === key ? t('Saving…') : t('Mark paid')}
                  </button>
                </div>
                {p.to_member !== meId && <PayLines member={members.find((m) => m.id === p.to_member)} onToast={onToast} />}
              </div>
            );
          })}
          <a
            className="btn btn--secondary press"
            href={`https://wa.me/?text=${encodeURIComponent(settleUpMessage(roomName, bills, settlements, members))}`}
            target="_blank"
            rel="noreferrer"
            style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
            </svg>
            {t('Share to WhatsApp')}
          </a>
        </div>
      )}
      {recent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
          {recent.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
              <span style={{ flexGrow: 1 }}>
                {t('{from} paid {to} back {amount}', { from: nameOf(s.from_member), to: nameOf(s.to_member), amount: formatRM(s.amount_cents) })}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void act(s.id, () => onUndo(s.id))}
                style={{ minHeight: 36, border: 'none', background: 'none', color: 'var(--accent-text)', fontWeight: 700, fontSize: 13 }}
              >
                {t('Undo')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Your DuitNow and bank details, shown to the room when someone owes you. */
export function PayDetailsCard({ me, onSave, onQrChanged }: { me: MemberRow; onSave: (patch: { pay_duitnow: string | null; pay_bank: string | null }) => Promise<void>; onQrChanged?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [duitnow, setDuitnow] = useState(me.pay_duitnow ?? '');
  const [bank, setBank] = useState(me.pay_bank ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = !!(me.pay_duitnow || me.pay_bank);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const qrInput = useRef<HTMLInputElement>(null);
  const qrAct = async (fn: () => Promise<void>) => {
    setQrBusy(true);
    setQrError(null);
    try {
      await fn();
      onQrChanged?.();
    } catch (e) {
      setQrError(e instanceof Error ? e.message : t('Could not save.'));
    } finally {
      setQrBusy(false);
    }
  };
  // Your DuitNow QR photo, for kaki to scan: saved in every room you're in.
  const qrRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid var(--divider)', flexWrap: 'wrap' }}>
      <span style={{ flexGrow: 1, fontSize: 14, color: 'var(--ink-2)' }}>{me.pay_qr_path ? t('DuitNow QR saved.') : t('Add your DuitNow QR so kaki can scan it.')}</span>
      {me.pay_qr_path && (
        <button type="button" className="chip press" onClick={() => setShowQr(true)} style={{ height: 34, padding: '0 12px', fontSize: 13 }}>
          {t('View')}
        </button>
      )}
      <button type="button" className="chip press" disabled={qrBusy} onClick={() => qrInput.current?.click()} style={{ height: 34, padding: '0 12px', fontSize: 13 }}>
        {qrBusy ? t('Saving…') : me.pay_qr_path ? t('Change') : t('Add QR photo')}
      </button>
      {me.pay_qr_path && (
        <button type="button" className="chip press" disabled={qrBusy} onClick={() => void qrAct(removeQrEverywhere)} style={{ height: 34, padding: '0 12px', fontSize: 13 }}>
          {t('Remove')}
        </button>
      )}
      <input
        ref={qrInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="qr-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void qrAct(() => saveQrEverywhere(file));
        }}
      />
      {qrError && (
        <span role="alert" style={{ width: '100%', fontSize: 13, color: 'var(--danger)' }}>
          {qrError}
        </span>
      )}
      {showQr && me.pay_qr_path && <QrViewer path={me.pay_qr_path} name={me.name} onClose={() => setShowQr(false)} />}
    </div>
  );

  if (!editing) {
    return (
      <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 }}>
          {has ? (
            <>
              {me.pay_duitnow && (
                <span style={{ overflowWrap: 'anywhere' }}>
                  {t('DuitNow')}: <b>{me.pay_duitnow}</b>
                </span>
              )}
              {me.pay_bank && (
                <span style={{ overflowWrap: 'anywhere' }}>
                  {t('Bank')}: <b>{me.pay_bank}</b>
                </span>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--ink-2)' }}>{t('Add your DuitNow or bank account so kaki can pay you back.')}</span>
          )}
        </div>
        <button
          type="button"
          className="btn btn--secondary press"
          onClick={() => {
            setDuitnow(me.pay_duitnow ?? '');
            setBank(me.pay_bank ?? '');
            setEditing(true);
          }}
          style={{ height: 40, padding: '0 14px', fontSize: 14, flexShrink: 0 }}
        >
          {has ? t('Edit') : t('Add')}
        </button>
      </div>
        {qrRow}
      </div>
    );
  }

  return (
    <form
      className="card"
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSave({ pay_duitnow: duitnow.trim() || null, pay_bank: bank.trim() || null });
          setEditing(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : t('Could not save.'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field-label" htmlFor="pay-duitnow">{t('DuitNow phone number or ID')}</label>
      <input id="pay-duitnow" className="input" maxLength={40} placeholder="012-345 6789" value={duitnow} onChange={(e) => setDuitnow(e.target.value)} />
      <label className="field-label" htmlFor="pay-bank">{t('Bank and account number')}</label>
      <input id="pay-bank" className="input" maxLength={80} placeholder="Maybank 1234 5678 9012" value={bank} onChange={(e) => setBank(e.target.value)} />
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Only people in this room can see these.')}</span>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn--secondary press" onClick={() => setEditing(false)} style={{ flex: 1, height: 44 }}>
          {t('Cancel')}
        </button>
        <button type="submit" className="btn btn--primary press" disabled={busy} style={{ flex: 1, height: 44 }}>
          {busy ? t('Saving…') : t('Save')}
        </button>
      </div>
    </form>
  );
}
