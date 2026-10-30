import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import {
  ChoosingCard,
  DecidedCard,
  lastEatenText,
  ProposalCard,
  SentCard,
  useAction,
  VetoedCard,
  YourTurnCard,
} from '../components/DayCards';
import { FoodTile } from '../components/FoodTile';
import { PickSheet } from '../components/PickSheet';
import { daysBetween } from '../lib/dates';
import { entryFood, joinNames, timesWord, type Food } from '../lib/foods';
import { addDays, dayLabel, dayMonthLabel, deciderFor } from '../lib/rotation';
import type { DayEntryRow, MemberRow, RoomRow, VetoRow } from '../lib/supabase';
import type { useDays } from '../lib/useDays';

type DaysApi = ReturnType<typeof useDays>;

interface Props {
  room: RoomRow;
  me: MemberRow;
  members: MemberRow[];
  today: string;
  /** Every food, archived included, to resolve past entries. */
  foods: Food[];
  /** Active foods minus today's vetoes: what the decider can pick from. */
  pickable: Food[];
  days: DaysApi;
  onOpenSettings: () => void;
  onSpin: () => void;
  onSeeAll: () => void;
  onToast: (message: string) => void;
}

type JustVetoed = { veto: VetoRow; previous: DayEntryRow; foodName: string };

export function TodayScreen({ room, me, members, today, foods, pickable, days, onOpenSettings, onSpin, onSeeAll, onToast }: Props) {
  const [sheet, setSheet] = useState<'list' | 'type' | null>(null);
  const [justVetoed, setJustVetoed] = useState<JustVetoed | null>(null);
  const { busy, run } = useAction(onToast);

  const { entries, todayEntry, todayVetoes, myVetoesToday } = days;
  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameFor = (id: string, you = 'You') => (id === me.id ? you : memberById.get(id)?.name ?? 'Someone');

  const decider = (todayEntry && memberById.get(todayEntry.decider_id)) || deciderFor(members, room.rotation_start, today) || me;
  const isDecider = decider.id === me.id;
  const others = members.filter((m) => m.id !== decider.id);
  const waitingFor = others.length === 1 ? others[0].name : others.length === 0 ? 'nobody yet' : 'everyone';
  const todayFood = todayEntry ? entryFood(todayEntry, foodsById) : null;
  const vetoedNames = todayVetoes.map((v) => v.rejected_food);
  const latestVeto = todayVetoes[todayVetoes.length - 1] ?? null;
  const myVetoesLeft = Math.max(0, room.veto_limit - myVetoesToday);

  // The "Back to <decider>" card lasts until the decider sends something new.
  useEffect(() => {
    if (justVetoed && (!todayEntry || todayEntry.status !== 'pending' || todayEntry.id !== justVetoed.previous.id)) {
      setJustVetoed(null);
    }
  }, [todayEntry, justVetoed]);

  const tomorrow = deciderFor(members, room.rotation_start, addDays(today, 1));
  const tomorrowText = !tomorrow
    ? ''
    : tomorrow.id === me.id
      ? 'Tomorrow it’s your turn to decide.'
      : `Tomorrow it’s ${tomorrow.name}’s turn.`;

  const pickFromSheet = async (p: { food: Food } | { name: string }) => {
    if ('food' in p) return days.propose({ foodId: p.food.id, name: p.food.name }, 'direct');
    const match = pickable.find((f) => f.name.toLowerCase() === p.name.toLowerCase());
    return days.propose(match ? { foodId: match.id, name: match.name } : { foodId: null, name: p.name }, 'direct');
  };

  /* ----- The main card for today's state ----- */

  let main: React.ReactNode;
  let proposalView = false;

  if (!todayEntry || !entries) {
    main = (
      <section className="card" style={{ padding: 22, color: 'var(--muted)', flexShrink: 0 }}>
        {days.error ? `Couldn't load today. ${days.error}` : 'Getting today ready…'}
      </section>
    );
  } else if (todayEntry.status === 'accepted' && todayFood) {
    main = (
      <DecidedCard
        food={todayFood}
        tomorrowText={tomorrowText}
        busy={busy}
        onUndo={!isDecider ? () => run(days.undoAccept) : undefined}
      />
    );
  } else if (isDecider) {
    if (todayEntry.status === 'proposed' && todayFood) {
      main = (
        <SentCard
          me={me}
          food={todayFood}
          method={todayEntry.method}
          waitingFor={waitingFor}
          busy={busy}
          onChange={() => setSheet('list')}
          onRetract={() => run(days.retract)}
        />
      );
    } else {
      let sub: string;
      if (others.length === 0) sub = 'Nobody else here yet, so your pick is final.';
      else if (latestVeto) sub = `${nameFor(latestVeto.member_id)} vetoed ${latestVeto.rejected_food}. Pick again.`;
      else if (room.veto_limit === 0) sub = 'No vetoes today, so your pick stands.';
      else if (others.length === 1) {
        const left = room.veto_limit - todayVetoes.filter((v) => v.member_id === others[0].id).length;
        sub = left > 0 ? `${others[0].name} can veto ${timesWord(left)}` : `${others[0].name} is out of vetoes, so your pick stands.`;
      } else sub = `Everyone else can veto ${timesWord(room.veto_limit)}`;
      main = <YourTurnCard me={me} sub={sub} onSpin={onSpin} onPickList={() => setSheet('list')} onType={() => setSheet('type')} />;
    }
  } else if (todayEntry.status === 'proposed' && todayFood) {
    proposalView = true;
    const past = (entries ?? []).find(
      (e) =>
        e.status === 'accepted' &&
        e.entry_date < today &&
        (todayEntry.food_option_id
          ? e.food_option_id === todayEntry.food_option_id
          : e.custom_food?.toLowerCase() === todayFood.name.toLowerCase()),
    );
    main = (
      <ProposalCard
        food={todayFood}
        method={todayEntry.method}
        deciderName={decider.name}
        lastEatenText={lastEatenText(past ? daysBetween(past.entry_date, today) : null, past ? nameFor(past.decider_id, 'you') : null)}
        vetoesLeft={myVetoesLeft}
        busy={busy}
        onAccept={() => run(days.accept)}
        onVeto={() =>
          run(async () => {
            const done = await days.veto(todayFood.name);
            setJustVetoed({ ...done, foodName: todayFood.name });
          })
        }
      />
    );
  } else if (justVetoed) {
    main = (
      <VetoedCard
        foodName={justVetoed.foodName}
        deciderName={decider.name}
        vetoesLeft={myVetoesLeft}
        busy={busy}
        onUndo={() =>
          run(async () => {
            await days.undoVeto(justVetoed.veto, justVetoed.previous);
            setJustVetoed(null);
          })
        }
      />
    );
  } else {
    const sub =
      room.veto_limit === 0
        ? ''
        : myVetoesLeft > 0
          ? `You can veto ${timesWord(myVetoesLeft)}.`
          : 'Your vetoes are used up, so the next pick stands.';
    main = <ChoosingCard decider={decider} sub={sub} />;
  }

  /* ----- Up next and Recently ----- */

  const upNext = [1, 2, 3].map((i) => {
    const date = addDays(today, i);
    return { date, member: deciderFor(members, room.rotation_start, date) };
  });

  const recent = (entries ?? []).filter((e) => e.status === 'accepted' && e.entry_date < today).slice(0, 3);

  return (
    <main className="screen" style={{ gap: proposalView ? 20 : 18 }}>
      {proposalView ? (
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={decider.name} color={decider.color} size={44} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="eyebrow">{dayMonthLabel(today)} · Room {room.code}</span>
            <h1 className="title title--sm" style={{ overflowWrap: 'anywhere' }}>
              {decider.name}’s pick
            </h1>
          </div>
        </header>
      ) : (
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">
              {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
                new Date(`${today}T00:00:00Z`),
              )}
            </span>
            <h1 className="title">
              Makan <span style={{ color: 'var(--accent)' }}>apa?</span>
            </h1>
          </div>
          <button
            type="button"
            className="press"
            aria-label={`Room ${room.code}, open settings`}
            onClick={onOpenSettings}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 44,
              flexShrink: 0,
              padding: '0 14px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
              <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2.1.7 3.5 2.8 3.5 5.8" />
            </svg>
            {room.code}
          </button>
        </header>
      )}

      {main}

      {vetoedNames.length > 0 && isDecider && todayEntry?.status === 'pending' && (
        <p style={{ margin: '-6px 0 0', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          Off the wheel today: {joinNames(vetoedNames)}
        </p>
      )}

      {!proposalView && (
        <>
          {members.length < 2 ? (
            <section className="card fade-up" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, animationDelay: '0.12s' }}>
              <span className="section-label">Up next</span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
                Share code <strong style={{ color: 'var(--ink)', letterSpacing: '0.08em' }}>{room.code}</strong> so your kaki can join. Then
                you take turns deciding.
              </p>
            </section>
          ) : (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, animation: 'fadeUp 0.55s 0.12s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
              <span className="section-label">Up next</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                {upNext.map(({ date, member }) => (
                  <div key={date} className="card lift" style={{ borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{dayLabel(date)}</span>
                    {member && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Avatar name={member.name} color={member.color} />
                        <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.id === me.id ? 'You' : member.name}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, animation: 'fadeUp 0.55s 0.24s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="section-label">Recently</span>
              <button
                type="button"
                onClick={onSeeAll}
                style={{ padding: '10px 0', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}
              >
                See all
              </button>
            </div>
            {recent.length === 0 ? (
              <p className="card" style={{ margin: 0, padding: 16, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
                Nothing yet. Meals you agree on show up here.
              </p>
            ) : (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {recent.map((e) => {
                  const food = entryFood(e, foodsById);
                  if (!food) return null;
                  const who = nameFor(e.decider_id);
                  return (
                    <div key={e.id} className="row" style={{ padding: '12px 14px' }}>
                      <FoodTile food={food} />
                      <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{food.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {dayLabel(e.entry_date)} · {e.method === 'wheel' ? `${who}, by wheel` : `${who} picked`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {sheet && (
        <PickSheet
          mode={sheet}
          foods={pickable}
          vetoed={vetoedNames}
          sendTo={others.length === 0 ? null : waitingFor}
          onClose={() => setSheet(null)}
          onPick={async (p) => {
            await pickFromSheet(p);
            const name = 'food' in p ? p.food.name : p.name;
            onToast(others.length === 0 ? `${name} it is.` : `Sent ${name} to ${waitingFor}.`);
          }}
        />
      )}
    </main>
  );
}
