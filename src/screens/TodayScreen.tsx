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
import { SecretCollectCard, SecretRevealCard, type RevealedPick } from '../components/SecretCards';
import { daysBetween } from '../lib/dates';
import { NearbyAllSheet, NearbyList, NearbyStrip, SpotSheet } from '../components/Nearby';
import { OnlineDot, PeopleSheet } from '../components/PeopleSheet';
import { customFood, entryFood, joinNames, normalizeTag, timesWord, type Food, type FoodDraft } from '../lib/foods';
import { shareInvite } from '../lib/invite';
import { NEARBY_LABEL, SUNWAY_SPOTS, spotsFor, spotsOfTheDay, type Spot } from '../lib/nearby';
import { nearbyPref, usePref } from '../lib/prefs';
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
  /** Member ids with the app open right now. */
  online: Set<string>;
  onAddFood: (draft: FoodDraft) => Promise<void>;
  onOpenSettings: () => void;
  onSpin: () => void;
  onSeeAll: () => void;
  onToast: (message: string) => void;
}

type JustVetoed = { veto: VetoRow; previous: DayEntryRow; foodName: string };

export function TodayScreen({ room, me, members, today, foods, pickable, days, online, onAddFood, onOpenSettings, onSpin, onSeeAll, onToast }: Props) {
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [allSpots, setAllSpots] = useState(false);
  const showNearby = usePref(nearbyPref) === 'on';
  const [sheet, setSheet] = useState<'list' | 'type' | null>(null);
  const [justVetoed, setJustVetoed] = useState<JustVetoed | null>(null);
  const { busy, run } = useAction(onToast);

  const { entries, todayEntry, todayVetoes, myVetoesToday } = days;
  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameFor = (id: string | null, you = 'You') => (id === me.id ? you : (id && memberById.get(id)?.name) || 'Someone');

  const decider = (todayEntry && memberById.get(todayEntry.decider_id ?? '')) || deciderFor(members, room.rotation_start, today) || me;
  const isDecider = decider.id === me.id;
  const others = members.filter((m) => m.id !== decider.id);
  const waitingFor = others.length === 1 ? others[0].name : others.length === 0 ? 'nobody yet' : 'everyone';
  const todayFood = todayEntry ? entryFood(todayEntry, foodsById) : null;
  const vetoedNames = todayVetoes.map((v) => v.rejected_food);
  const latestVeto = todayVetoes[todayVetoes.length - 1] ?? null;
  const myVetoesLeft = Math.max(0, room.veto_limit - myVetoesToday);

  // Secret picks mode: everyone picks, then the wheel spins among the picks.
  const secret = room.decision_mode === 'secret';
  const [holdReveal, setHoldReveal] = useState(false);
  const foodByName = (name: string) => pickable.find((f) => f.name.toLowerCase() === name.toLowerCase()) ?? customFood(name);
  const revealed: RevealedPick[] = days.secretPicks
    .map((p) => ({ member: memberById.get(p.member_id), food: foodByName(p.food_text) }))
    .filter((p): p is RevealedPick => !!p.member)
    .sort((a, b) => a.member.sort_order - b.member.sort_order);
  const pickedIds = new Set(revealed.map((p) => p.member.id));
  const allIn = members.length > 0 && members.every((m) => pickedIds.has(m.id));
  const myPick = revealed.find((p) => p.member.id === me.id)?.food ?? null;
  const showReveal = secret && !!todayEntry && ((todayEntry.status === 'pending' && allIn) || holdReveal);

  // Keep the reveal on screen while this phone watches the wheel land, then show the result.
  useEffect(() => {
    if (secret && todayEntry?.status === 'pending' && allIn) setHoldReveal(true);
  }, [secret, todayEntry?.status, allIn]);

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
  } else if (showReveal) {
    main = (
      <SecretRevealCard
        picks={revealed}
        me={me}
        result={todayEntry.status === 'accepted' ? todayFood : null}
        onSpin={(p) => days.settleSecretSpin(p.food.id.startsWith('custom') ? { foodId: null, name: p.food.name } : { foodId: p.food.id, name: p.food.name })}
        onDone={() => setHoldReveal(false)}
        onError={onToast}
      />
    );
  } else if (todayEntry.status === 'accepted' && todayFood) {
    main = (
      <DecidedCard
        food={todayFood}
        tomorrowText={tomorrowText}
        nearby={showNearby ? <NearbyList spots={spotsFor(todayFood)} /> : null}
        busy={busy}
        // A secret-picks result is everyone's, so it's final.
        onUndo={!isDecider && !secret ? () => run(days.undoAccept) : undefined}
      />
    );
  } else if (secret && todayEntry.status === 'pending') {
    main = (
      <SecretCollectCard
        decider={decider}
        members={members}
        me={me}
        pickedIds={pickedIds}
        myPick={myPick}
        onPickList={() => setSheet('list')}
        onType={() => setSheet('type')}
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
          answerers={joinNames(others.map((m) => m.name), 'or')}
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

  // What a Near Sunway spot can do for today: send it as the pick, or make it my secret pick.
  const spotPickLabel =
    todayEntry && todayEntry.status !== 'accepted'
      ? secret
        ? todayEntry.status === 'pending'
          ? myPick
            ? 'Make this my secret pick instead'
            : 'Make this my secret pick'
          : undefined
        : isDecider && todayEntry.status === 'pending'
          ? others.length === 0
            ? 'Pick this for today'
            : `Send to ${waitingFor}`
          : undefined
      : undefined;

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
            aria-label={`Room ${room.code}: ${members.length} ${members.length === 1 ? 'person' : 'people'}, ${online.size} here now. Show people`}
            onClick={() => setPeopleOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 44,
              flexShrink: 0,
              padding: '0 14px 0 6px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            <span aria-hidden="true" style={{ display: 'flex' }}>
              {members.slice(0, 3).map((m, i) => (
                <span key={m.id} style={{ position: 'relative', marginLeft: i ? -8 : 0, zIndex: 3 - i }}>
                  <Avatar name={m.name} color={m.color} size={30} style={{ boxShadow: '0 0 0 2px var(--surface)' }} />
                  {online.has(m.id) && <OnlineDot size={9} />}
                </span>
              ))}
              {members.length > 3 && (
                <span
                  style={{
                    marginLeft: -8,
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    background: 'var(--track)',
                    color: 'var(--ink-2)',
                    boxShadow: '0 0 0 2px var(--surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0,
                  }}
                >
                  +{members.length - 3}
                </span>
              )}
            </span>
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

          {showNearby && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, animation: 'fadeUp 0.55s 0.36s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="section-label">Ideas near {NEARBY_LABEL}</span>
                <button
                  type="button"
                  onClick={() => setAllSpots(true)}
                  style={{ padding: '10px 0', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}
                >
                  See all {SUNWAY_SPOTS.length}
                </button>
              </div>
              <NearbyStrip spots={spotsOfTheDay(today).slice(0, 8)} onOpen={setSpot} />
            </section>
          )}
        </>
      )}

      {peopleOpen && (
        <PeopleSheet
          room={room}
          me={me}
          members={members}
          online={online}
          todayDeciderId={todayEntry?.decider_id ?? decider.id}
          today={today}
          onClose={() => setPeopleOpen(false)}
          onInvite={() => run(async () => {
            const message = await shareInvite(room.code);
            if (message) onToast(message);
          })}
          onSettings={() => {
            setPeopleOpen(false);
            onOpenSettings();
          }}
        />
      )}

      {allSpots && !spot && <NearbyAllSheet spots={SUNWAY_SPOTS} onClose={() => setAllSpots(false)} onOpen={setSpot} />}

      {spot && (
        <SpotSheet
          spot={spot}
          inList={foods.some((f) => f.name.toLowerCase() === spot.name.toLowerCase())}
          pickLabel={spotPickLabel}
          onClose={() => setSpot(null)}
          onAdd={() =>
            run(async () => {
              await onAddFood({ name: spot.name, tags: spot.tags.map(normalizeTag), icon: spot.icon, color: spot.color });
              onToast(`${spot.name} added to your food list.`);
            })
          }
          onPick={
            spotPickLabel
              ? () =>
                  run(async () => {
                    if (secret) {
                      await days.submitSecretPick(spot.name);
                      onToast(`Locked in. Only you can see ${spot.name} until the reveal.`);
                    } else {
                      await pickFromSheet({ name: spot.name });
                      onToast(others.length === 0 ? `${spot.name} it is.` : `Sent ${spot.name} to ${waitingFor}.`);
                    }
                    setSpot(null);
                    setAllSpots(false);
                  })
              : undefined
          }
        />
      )}

      {sheet && (
        <PickSheet
          mode={sheet}
          foods={pickable}
          vetoed={vetoedNames}
          sendTo={others.length === 0 ? null : waitingFor}
          secret={secret && todayEntry?.status === 'pending'}
          onClose={() => setSheet(null)}
          onPick={async (p) => {
            const name = 'food' in p ? p.food.name : p.name;
            if (secret && todayEntry?.status === 'pending') {
              await days.submitSecretPick('food' in p ? p.food.name : foodByName(p.name).name);
              onToast(`Locked in. Only you can see ${name} until the reveal.`);
              return;
            }
            await pickFromSheet(p);
            onToast(others.length === 0 ? `${name} it is.` : `Sent ${name} to ${waitingFor}.`);
          }}
        />
      )}
    </main>
  );
}
