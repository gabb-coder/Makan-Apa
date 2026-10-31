import { useEffect, useMemo, useState } from 'react';
import { FoodTile } from '../components/FoodTile';
import { formatTag, lastEatenLabel, type Food } from '../lib/foods';
import { FOOD_COLORS } from '../lib/palette';
import { dayLabel } from '../lib/rotation';
import { MoneyCard } from '../components/MealExtras';
import type { RoomExtras } from '../lib/useRoomExtras';
import { exportFileName, historyFile, historySheet, loadHistory, saveFile } from '../lib/exportHistory';
import { roomTitle } from '../lib/session';
import { availableMonths, monthKey, monthLabel, monthStats } from '../lib/stats';
import type { DayEntryRow, MemberRow, RoomRow, VetoRow } from '../lib/supabase';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { t } from '../lib/i18n';

interface Props {
  room: RoomRow;
  me: MemberRow;
  members: MemberRow[];
  today: string;
  entries: DayEntryRow[];
  vetoes: VetoRow[];
  /** Every food, archived included. */
  foods: Food[];
  onToast: (message: string) => void;
  extras: RoomExtras;
}

const grow = (delay: number, origin: 'left' | 'right' = 'left') =>
  ({ transformOrigin: origin, animation: `growX 1s ${delay}s cubic-bezier(0.2, 0.8, 0.2, 1) both` }) as const;

/** 0 → 1 over 1.1s with an ease-out cubic, restarting when `key` changes. */
function useCountUp(key: string): number {
  const reduced = usePrefersReducedMotion();
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setP(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      setP(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, reduced]);
  return p;
}

const statNumber = {
  fontFamily: 'var(--font-display)',
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: '-0.03em',
  lineHeight: 1.1,
} as const;

export function HistoryScreen({ room, me, members, today, entries, vetoes, foods, onToast, extras }: Props) {
  const months = useMemo(() => availableMonths(entries, today), [entries, today]);
  const [month, setMonth] = useState(() => monthKey(today));
  const [showAllEaten, setShowAllEaten] = useState(false);
  const p = useCountUp(month);

  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const stats = useMemo(() => monthStats(month, entries, vetoes, members, foodsById), [month, entries, vetoes, members, foodsById]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameFor = (id: string | null) => (id === me.id ? t('You') : (id && memberById.get(id)?.name) || t('Someone'));

  const currentYear = today.slice(0, 4);
  const isCurrent = month === monthKey(today);
  const mealsN = stats.meals.length;
  const eaten = showAllEaten ? stats.mostEaten.slice(0, 10) : stats.mostEaten.slice(0, 3);
  const maxEaten = stats.mostEaten[0]?.count ?? 1;
  const vetoSplit = stats.vetoesByMember.map((x) => `${x.member.id === me.id ? t('You') : x.member.name} ${x.count}`).join(' · ');

  // Room favourites: foods with more thumbs up than down, all time.
  const favourites = foods.filter((f) => (f.netRating ?? 0) > 0).sort((a, b) => (b.netRating ?? 0) - (a.netRating ?? 0)).slice(0, 5);

  // Haven't had in a while: never eaten first, then longest ago (all-time, not just this month).
  const longAgo = foods
    .filter((f) => f.isActive && (f.daysSinceEaten === null || f.daysSinceEaten >= 7))
    .sort((a, b) => (b.daysSinceEaten ?? Infinity) - (a.daysSinceEaten ?? Infinity))
    .slice(0, 6);

  return (
    <main className="screen" style={{ gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {roomTitle(room)}
          </span>
          <h1 className="title">{t('History')}</h1>
        </div>
        <label
          className="press"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 44,
            flexShrink: 0,
            padding: '0 14px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {monthLabel(month, currentYear)}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
          {/* Native picker on top, invisible, so phones get their own month list. */}
          <select
            aria-label={t('Change month, showing {month}', { month: monthLabel(month, currentYear) })}
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setShowAllEaten(false);
            }}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', fontSize: 16 }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, currentYear)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div key={`stats-${month}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, flexShrink: 0, animation: 'fadeUp 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
        <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{t('Meals')}</span>
          <span style={statNumber}>{Math.round(mealsN * p)}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{isCurrent ? t('this month') : t('that month')}</span>
        </div>
        <div style={{ background: 'var(--streak-bg)', borderRadius: 18, padding: 12, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--streak-ink-2)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ transformOrigin: '50% 90%', animation: 'flicker 1.1s ease-in-out infinite' }}>
              <path d="M12 2c.5 3.5 5 5.5 5 11a5 5 0 0 1-10 0c0-2.8 1.6-4.4 2.8-5.6.2 2.1 1.2 3.4 2.4 3.6-.6-3.2-.8-6 0-9z" fill="#CC3F17" />
            </svg>
            <span style={{ whiteSpace: 'nowrap' }}>{t('No repeats')}</span>
          </span>
          <span style={{ ...statNumber, color: 'var(--streak-ink)', whiteSpace: 'nowrap' }}>
            {Math.round(stats.bestStreak * p)}
            <span style={{ fontSize: 16, letterSpacing: '-0.01em' }}> {stats.bestStreak === 1 ? t('day') : t('days')}</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--streak-ink-2)' }}>{t('best streak')}</span>
        </div>
        <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{t('Vetoes')}</span>
          <span style={statNumber}>{Math.round(stats.vetoes.length * p)}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {vetoSplit || t('None')}
          </span>
        </div>
      </div>

      <section
        key={`who-${month}`}
        className="card"
        style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, animation: 'fadeUp 0.55s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{t('Who decided')}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {mealsN === 1 ? t('{n} day', { n: mealsN }) : t('{n} days', { n: mealsN })}
          </span>
        </div>
        {stats.deciders.length === 0 ? (
          <div style={{ height: 12, borderRadius: 999, background: 'var(--bar-track)' }} />
        ) : (
          <div
            role="img"
            aria-label={stats.deciders
              .map((d) =>
                d.count === 1
                  ? t('{name} decided {n} day', { name: nameFor(d.member.id), n: d.count })
                  : t('{name} decided {n} days', { name: nameFor(d.member.id), n: d.count }),
              )
              .join(', ')}
            style={{ display: 'flex', gap: 4, height: 12 }}
          >
            {stats.deciders.map((d, i) => (
              <div
                key={d.member.id}
                style={{
                  flex: d.count,
                  borderRadius: 999,
                  background: d.member.color,
                  ...grow(0.3 + i * 0.15, i === stats.deciders.length - 1 && i > 0 ? 'right' : 'left'),
                  animationDuration: '0.9s',
                }}
              />
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 12px', fontSize: 13, fontWeight: 700 }}>
          {(stats.deciders.length ? stats.deciders : members.map((member) => ({ member, count: 0 }))).map((d) => (
            <span key={d.member.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: d.member.color }} />
              {nameFor(d.member.id)} · {d.count}
            </span>
          ))}
        </div>
      </section>

      <section
        key={`eaten-${month}`}
        className="card"
        style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, animation: 'fadeUp 0.55s 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{t('Most eaten')}</span>
          {stats.mostEaten.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllEaten((s) => !s)}
              style={{ minHeight: 32, padding: 0, border: 'none', background: 'none', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}
            >
              {showAllEaten ? t('Show top 3') : t('See top {n}', { n: Math.min(10, stats.mostEaten.length) })}
            </button>
          )}
        </div>
        {eaten.length === 0 ? (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Nothing agreed on yet.')}</span>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 24px', alignItems: 'center', columnGap: 10, rowGap: 8, fontSize: 13 }}>
            {eaten.map((r, i) => (
              <Bar
                key={r.key}
                name={r.name}
                count={r.count}
                pct={(r.count / maxEaten) * 100}
                color={r.food ? FOOD_COLORS[r.food.color].slice : '#E9CC9F'}
                delay={0.45 + i * 0.15}
              />
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <span className="section-label">{isCurrent ? t('Recent meals') : t('Meals in {month}', { month: monthLabel(month, currentYear) })}</span>
        {stats.meals.length === 0 ? (
          <p className="card" style={{ margin: 0, padding: 16, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
            {isCurrent ? t('No meals agreed yet this month.') : t('No meals that month.')}
          </p>
        ) : (
          <div key={`meals-${month}`} className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {stats.meals.map((m, i) => {
              const who = nameFor(m.entry.decider_id);
              const vetoed = m.vetoes.map((v) => v.rejected_food);
              return (
                <div
                  key={m.entry.id}
                  className="row"
                  style={{ animation: `fadeUp 0.5s ${(0.5 + Math.min(i, 8) * 0.1).toFixed(2)}s cubic-bezier(0.2, 0.8, 0.2, 1) both` }}
                >
                  <FoodTile food={m.food} />
                  <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.food.name}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {m.entry.entry_date === today ? t('Today') : dayLabel(m.entry.entry_date)}
                      {(room.meals === 'both' || m.entry.meal === 'dinner') && ` ${m.entry.meal === 'dinner' ? t('dinner') : t('lunch')}`} ·{' '}
                      {m.entry.method === 'wheel' ? t('{name}, by wheel', { name: who }) : t('{name} picked', { name: who })}
                      {(() => {
                        const r = extras.ratings.filter((x) => x.day_entry_id === m.entry.id);
                        const up = r.filter((x) => x.rating === 1).length;
                        const down = r.length - up;
                        return r.length ? ` · ${up ? `👍 ${up}` : ''}${up && down ? ' ' : ''}${down ? `👎 ${down}` : ''}` : '';
                      })()}
                    </span>
                  </div>
                  {vetoed.length > 0 && (
                    <span
                      className="badge"
                      style={{ flexShrink: 1, minWidth: 0, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', background: 'var(--bar-track)', color: 'var(--ink-2)' }}
                    >
                      {vetoed.length > 2 ? t('{n} vetoed', { n: vetoed.length }) : t('{foods} vetoed', { foods: vetoed.join(', ') })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <MoneyCard
        bills={extras.bills}
        settlements={extras.settlements}
        members={members}
        meId={me.id}
        onRecord={async (p) => {
          await extras.recordPayment(p);
          onToast(t('Payment recorded.'));
        }}
        onUndo={extras.removePayment}
      />

      {(stats.mostVetoed.length > 0 || stats.tags.length > 0 || longAgo.length > 0 || favourites.length > 0) && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, paddingBottom: 8 }}>
          <span className="section-label">{t('More')}</span>
          <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {favourites.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{t('Room favourites')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {favourites.map((f) => (
                    <span key={f.id} className="badge" style={{ background: FOOD_COLORS[f.color].tile, color: FOOD_COLORS[f.color].ink, fontSize: 13 }}>
                      {f.name} · 👍 {f.netRating}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('Liked foods come up more often on the wheel.')}</span>
              </div>
            )}
            {longAgo.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{t("Haven't had in a while")}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {longAgo.map((f) => (
                    <span
                      key={f.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px 6px 6px',
                        borderRadius: 999,
                        background: FOOD_COLORS[f.color].tile,
                        color: FOOD_COLORS[f.color].ink,
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      <FoodTile food={f} size={24} style={{ background: '#FFFFFF', borderRadius: 999 }} />
                      {f.name}
                      <span style={{ fontWeight: 600, opacity: 0.8 }}>· {lastEatenLabel(f.daysSinceEaten)}</span>
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('These get the best odds on the wheel.')}</span>
              </div>
            )}
            {stats.mostVetoed.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{t('Most vetoed')}</span>
                <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 24px', alignItems: 'center', columnGap: 10, rowGap: 8, fontSize: 13 }}>
                  {stats.mostVetoed.slice(0, 3).map((r, i) => (
                    <Bar key={r.key} name={r.name} count={r.count} pct={(r.count / stats.mostVetoed[0].count) * 100} color="var(--border-strong)" delay={0.2 + i * 0.12} />
                  ))}
                </div>
              </div>
            )}
            {stats.tags.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{t('By tag')}</span>
                <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 24px', alignItems: 'center', columnGap: 10, rowGap: 8, fontSize: 13 }}>
                  {stats.tags.slice(0, 5).map((t, i) => (
                    <Bar key={t.tag} name={formatTag(t.tag)} count={t.count} pct={(t.count / stats.tags[0].count) * 100} color="#FFB4A2" delay={0.2 + i * 0.12} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {entries.some((e) => e.status === 'accepted') && (
        <ExportCard room={room} members={members} today={today} foodsById={foodsById} onToast={onToast} />
      )}
    </main>
  );
}

interface ExportProps {
  room: RoomRow;
  members: MemberRow[];
  today: string;
  foodsById: Map<string, Food>;
  onToast: (message: string) => void;
}

/** Download every agreed meal as a spreadsheet. */
function ExportCard({ room, members, today, foodsById, onToast }: ExportProps) {
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);
  const run = async (format: 'xlsx' | 'csv') => {
    setBusy(format);
    try {
      const data = await loadHistory(room.id);
      const sheet = historySheet({ room, members, foodsById, ...data });
      const saved = await saveFile(historyFile(sheet, exportFileName(room, today, format), format));
      if (saved) onToast(sheet.rows.length === 1 ? t('Exported {n} meal.', { n: sheet.rows.length }) : t('Exported {n} meals.', { n: sheet.rows.length }));
    } catch (e) {
      onToast(e instanceof Error ? t("Couldn't export: {error}", { error: e.message }) : t("Couldn't export. Try again."));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, paddingBottom: 8 }}>
      <span className="section-label">{t('Export')}</span>
      <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          {t("Every meal you've agreed on, all months: the date, the food or place, who chose it, how, and what got vetoed.")}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button type="button" className="btn btn--primary press" disabled={busy !== null} onClick={() => run('xlsx')}>
            {busy === 'xlsx' ? t('Exporting…') : 'Excel (.xlsx)'}
          </button>
          <button type="button" className="btn btn--secondary press" disabled={busy !== null} onClick={() => run('csv')}>
            {busy === 'csv' ? t('Exporting…') : 'CSV'}
          </button>
        </div>
        <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
          {t('Both open in Excel, Numbers and Google Sheets. For Google Sheets, upload the file to Google Drive and open it, or use File → Import in Sheets.')}
        </span>
      </div>
    </section>
  );
}

function Bar({ name, count, pct, color, delay }: { name: string; count: number; pct: number; color: string; delay: number }) {
  return (
    <>
      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <div style={{ height: 14, borderRadius: 999, background: 'var(--bar-track)' }}>
        <div style={{ width: `${Math.max(pct, 8)}%`, height: 14, borderRadius: 999, background: color, ...grow(delay) }} />
      </div>
      <span style={{ fontWeight: 800, textAlign: 'right' }}>{count}</span>
    </>
  );
}
