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
import { BillLine, BillSheet, RatingRow } from '../components/MealExtras';
import { PickSheet } from '../components/PickSheet';
import { SecretCollectCard, SecretRevealCard, type RevealedPick } from '../components/SecretCards';
import { daysBetween } from '../lib/dates';
import { AddSpotSheet, LocationLine, NearbyAllSheet, NearbyList, NearbyStrip, NearYouStrip, SpotSheet } from '../components/Nearby';
import { OnlineDot, PeopleSheet } from '../components/PeopleSheet';
import { customFood, entryFood, joinNames, normalizeTag, timesWord, type Food, type FoodDraft } from '../lib/foods';
import { locale, t, tNodes } from '../lib/i18n';
import { shareInvite } from '../lib/invite';
import { roomTitle } from '../lib/session';
import { useLocation } from '../lib/location';
import { byDistance, isNearSunway, NEARBY_LABEL, roomSpot, SUNWAY_SPOTS, spotsFor, spotsOfTheDay, type Spot } from '../lib/nearby';
import { nearbyPref, usePref } from '../lib/prefs';
import { spotSuitability, suitsEveryone } from '../lib/diet';
import { addDays, dayLabel, dayMonthLabel, deciderFor } from '../lib/rotation';
import type { DayEntryRow, Meal, MemberRow, RoomRow, VetoRow } from '../lib/supabase';
import type { useDays } from '../lib/useDays';
import type { RoomExtras } from '../lib/useRoomExtras';

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
  onSwitchRoom: (roomId: string) => void;
  onAddRoom: () => void;
  onToast: (message: string) => void;
  /** Ratings, bills and the room's own spots. */
  extras: RoomExtras;
  /** Which meal this is about; rooms deciding both get a lunch/dinner switch. */
  meal: Meal;
  onMealChange?: (meal: Meal) => void;
}

type JustVetoed = { veto: VetoRow; previous: DayEntryRow; foodName: string };

export function TodayScreen({ room, me, members, today, foods, pickable, days, online, onAddFood, onOpenSettings, onSpin, onSeeAll, onSwitchRoom, onAddRoom, onToast, extras, meal, onMealChange }: Props) {
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [allSpots, setAllSpots] = useState(false);
  const showNearby = usePref(nearbyPref) === 'on';
  const [billOpen, setBillOpen] = useState(false);
  const [addingSpot, setAddingSpot] = useState(false);
  const roomSpots = useMemo(() => extras.spots.map(roomSpot), [extras.spots]);
  const location = useLocation();
  const here = location.status === 'ready' ? location.here : undefined;
  const nearSunway = !here || isNearSunway(here);
  // Places that suit everyone's diet and budget first; the rest only if nothing fits.
  const suiting = (spots: Spot[]) => {
    const fit = spots.filter((sp) => suitsEveryone(spotSuitability(sp), members));
    return fit.length ? fit : spots;
  };
  const [sheet, setSheet] = useState<'list' | 'type' | null>(null);
  const [justVetoed, setJustVetoed] = useState<JustVetoed | null>(null);
  const { busy, run } = useAction(onToast);

  const { entries, todayEntry, todayVetoes, myVetoesToday } = days;
  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameFor = (id: string | null, you = t('You')) => (id === me.id ? you : (id && memberById.get(id)?.name) || t('Someone'));

  const decider = (todayEntry && memberById.get(todayEntry.decider_id ?? '')) || deciderFor(members, room.rotation_start, today, meal) || me;
  const isDecider = decider.id === me.id;
  const others = members.filter((m) => m.id !== decider.id);
  const waitingFor = others.length === 1 ? others[0].name : others.length === 0 ? t('nobody yet') : t('everyone');
  const todayFood = todayEntry ? entryFood(todayEntry, foodsById) : null;
  const vetoedNames = todayVetoes.map((v) => v.rejected_food);
  // The last meal before today, if it was in the past couple of days and you haven't rated it.
  const lastEntry =
    entries?.find(
      (e) => e.status === 'accepted' && (e.entry_date < today || (meal === 'dinner' && e.entry_date === today && e.meal === 'lunch')),
    ) ?? null;
  const lastMeal =
    lastEntry && lastEntry.entry_date >= addDays(today, -2) && !extras.ratings.some((r) => r.day_entry_id === lastEntry.id && r.member_id === me.id)
      ? { entry: lastEntry, food: entryFood(lastEntry, foodsById) ?? { ...customFood('Lunch'), name: t('Lunch') } }
      : null;
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

  const tomorrow = deciderFor(members, room.rotation_start, addDays(today, 1), meal);
  const tomorrowText = !tomorrow
    ? ''
    : tomorrow.id === me.id
      ? t('Tomorrow it’s your turn to decide.')
      : t('Tomorrow it’s {name}’s turn.', { name: tomorrow.name });

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
        {days.error ? t("Couldn't load today. {error}", { error: days.error }) : t('Getting today ready…')}
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
        here={here}
        nearby={showNearby ? <NearbyList spots={suiting(spotsFor(todayFood, 6, [...roomSpots, ...SUNWAY_SPOTS])).slice(0, 3)} here={here} /> : null}
        extras={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8 }}>
            <RatingRow entryId={todayEntry.id} ratings={extras.ratings} meId={me.id} onRate={(r) => run(() => extras.rate(todayEntry.id, r))} />
            <BillLine bill={extras.bills.find((b) => b.day_entry_id === todayEntry.id) ?? null} members={members} meId={me.id} onOpen={() => setBillOpen(true)} />
          </div>
        }
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
      if (others.length === 0) sub = t('Nobody else here yet, so your pick is final.');
      else if (latestVeto) sub = t('{name} vetoed {food}. Pick again.', { name: nameFor(latestVeto.member_id), food: latestVeto.rejected_food });
      else if (room.veto_limit === 0) sub = t('No vetoes today, so your pick stands.');
      else if (others.length === 1) {
        const left = room.veto_limit - todayVetoes.filter((v) => v.member_id === others[0].id).length;
        sub =
          left > 0
            ? t('{name} can veto {times}', { name: others[0].name, times: timesWord(left) })
            : t('{name} is out of vetoes, so your pick stands.', { name: others[0].name });
      } else sub = t('Everyone else can veto {times}', { times: timesWord(room.veto_limit) });
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
        lastEatenText={lastEatenText(past ? daysBetween(past.entry_date, today) : null, past ? nameFor(past.decider_id, t('you')) : null)}
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
          ? t('You can veto {times}.', { times: timesWord(myVetoesLeft) })
          : t('Your vetoes are used up, so the next pick stands.');
    main = <ChoosingCard decider={decider} sub={sub} />;
  }

  // What a Near Sunway spot can do for today: send it as the pick, or make it my secret pick.
  const spotPickLabel =
    todayEntry && todayEntry.status !== 'accepted'
      ? secret
        ? todayEntry.status === 'pending'
          ? myPick
            ? t('Make this my secret pick instead')
            : t('Make this my secret pick')
          : undefined
        : isDecider && todayEntry.status === 'pending'
          ? others.length === 0
            ? t('Pick this for today')
            : t('Send to {name}', { name: waitingFor })
          : undefined
      : undefined;

  /* ----- Up next and Recently ----- */

  const upNext = [1, 2, 3].map((i) => {
    const date = addDays(today, i);
    return { date, member: deciderFor(members, room.rotation_start, date, meal) };
  });

  const recent = (entries ?? []).filter((e) => e.status === 'accepted' && e.entry_date < today).slice(0, 3);

  return (
    <main className="screen" style={{ gap: proposalView ? 20 : 18 }}>
      {proposalView ? (
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={decider.name} color={decider.color} size={44} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dayMonthLabel(today)} · {roomTitle(room)}
            </span>
            <h1 className="title title--sm" style={{ overflowWrap: 'anywhere' }}>
              {t('{name}’s pick', { name: decider.name })}
            </h1>
          </div>
        </header>
      ) : (
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
                new Date(`${today}T00:00:00Z`),
              )}
              {room.name ? ` · ${room.name}` : ''}
            </span>
            <h1 className="title">
              Makan <span style={{ color: 'var(--accent)' }}>apa?</span>
            </h1>
          </div>
          <button
            type="button"
            className="press"
            aria-label={
              members.length === 1
                ? t('{room}, code {code}: {n} person, {online} here now. Show people', { room: roomTitle(room), code: room.code, n: members.length, online: online.size })
                : t('{room}, code {code}: {n} people, {online} here now. Show people', { room: roomTitle(room), code: room.code, n: members.length, online: online.size })
            }
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

      {onMealChange && !proposalView && (
        <div className="segmented" role="group" aria-label={t('Meal')} style={{ flexShrink: 0 }}>
          {(['lunch', 'dinner'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={meal === m} onClick={() => onMealChange(m)}>
              {m === 'lunch' ? t('Lunch') : t('Dinner')}
            </button>
          ))}
        </div>
      )}

      {main}

      {vetoedNames.length > 0 && isDecider && todayEntry?.status === 'pending' && (
        <p style={{ margin: '-6px 0 0', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          {t('Off the wheel today: {names}', { names: joinNames(vetoedNames) })}
        </p>
      )}

      {!proposalView && lastMeal && (
        <section className="card fade-up" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <RatingRow
            entryId={lastMeal.entry.id}
            ratings={extras.ratings}
            meId={me.id}
            label={
              lastMeal.entry.entry_date === today
                ? t('How was lunch, {food}?', { food: lastMeal.food.name })
                : lastMeal.entry.entry_date === addDays(today, -1)
                  ? t('How was yesterday’s {food}?', { food: lastMeal.food.name })
                  : t('How was your last {food}?', { food: lastMeal.food.name })
            }
            onRate={(r) => run(() => extras.rate(lastMeal.entry.id, r))}
          />
        </section>
      )}

      {!proposalView && (
        <>
          {members.length < 2 ? (
            <section className="card fade-up" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, animationDelay: '0.12s' }}>
              <span className="section-label">{t('Up next')}</span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
                {tNodes('Share code {code} so your kaki can join. Then you take turns deciding.', {
                  code: <strong style={{ color: 'var(--ink)', letterSpacing: '0.08em' }}>{room.code}</strong>,
                })}
              </p>
            </section>
          ) : (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, animation: 'fadeUp 0.55s 0.12s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
              <span className="section-label">{t('Up next')}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                {upNext.map(({ date, member }) => (
                  <div key={date} className="card lift" style={{ borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{dayLabel(date)}</span>
                    {member && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Avatar name={member.name} color={member.color} />
                        <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.id === me.id ? t('You') : member.name}
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
              <span className="section-label">{t('Recently')}</span>
              <button
                type="button"
                onClick={onSeeAll}
                style={{ padding: '10px 0', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}
              >
                {t('See all')}
              </button>
            </div>
            {recent.length === 0 ? (
              <p className="card" style={{ margin: 0, padding: 16, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
                {t('Nothing yet. Meals you agree on show up here.')}
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
                          {dayLabel(e.entry_date)} · {e.method === 'wheel' ? t('{name}, by wheel', { name: who }) : t('{name} picked', { name: who })}
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
                <span className="section-label">{!here ? t('Ideas near {place}', { place: NEARBY_LABEL }) : nearSunway ? t('Ideas closest to you') : t('Ideas near you')}</span>
                <button
                  type="button"
                  onClick={() => setAllSpots(true)}
                  style={{ padding: '10px 0', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}
                >
                  {nearSunway ? t('See all {n}', { n: SUNWAY_SPOTS.length + roomSpots.length }) : t('Sunway picks')}
                </button>
              </div>
              {here && !nearSunway ? (
                <NearYouStrip here={here} />
              ) : (
                <NearbyStrip
                  spots={suiting(here ? byDistance([...roomSpots, ...spotsOfTheDay(today)], here) : [...roomSpots, ...spotsOfTheDay(today)]).slice(0, 8 + Math.min(roomSpots.length, 4))}
                  here={here}
                  onOpen={setSpot}
                />
              )}
              <LocationLine location={location} nearSunway={nearSunway} />
            </section>
          )}
        </>
      )}

      {billOpen && todayEntry && todayFood && (
        <BillSheet
          foodName={todayFood.name}
          bill={extras.bills.find((b) => b.day_entry_id === todayEntry.id) ?? null}
          members={members}
          meId={me.id}
          onSave={async (bill) => {
            await extras.saveBill({ ...bill, day_entry_id: todayEntry.id });
            onToast(t('Bill saved. See who owes what in History.'));
          }}
          onRemove={() => extras.removeBill(todayEntry.id)}
          onClose={() => setBillOpen(false)}
        />
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
            const message = await shareInvite(room.code, room.name);
            if (message) onToast(message);
          })}
          onSettings={() => {
            setPeopleOpen(false);
            onOpenSettings();
          }}
          onSwitchRoom={onSwitchRoom}
          onAddRoom={onAddRoom}
        />
      )}

      {addingSpot && (
        <AddSpotSheet
          here={here}
          onSave={async (row) => {
            await extras.addSpot(row);
            onToast(t("{name} added to your room's spots.", { name: row.name }));
          }}
          onClose={() => setAddingSpot(false)}
        />
      )}

      {allSpots && !spot && !addingSpot && <NearbyAllSheet spots={SUNWAY_SPOTS} roomSpots={roomSpots} onAddSpot={() => setAddingSpot(true)} here={here} members={members} onClose={() => setAllSpots(false)} onOpen={setSpot} />}

      {spot && (
        <SpotSheet
          spot={spot}
          here={here}
          addedBy={spot.room?.addedBy ? (spot.room.addedBy === me.id ? t('you') : memberById.get(spot.room.addedBy)?.name) : undefined}
          onRemove={
            spot.room
              ? () =>
                  run(async () => {
                    await extras.removeSpot(spot.room!.id);
                    setSpot(null);
                    onToast(t('{name} removed.', { name: spot.name }));
                  })
              : undefined
          }
          inList={foods.some((f) => f.name.toLowerCase() === spot.name.toLowerCase())}
          pickLabel={spotPickLabel}
          onClose={() => setSpot(null)}
          onAdd={() =>
            run(async () => {
              await onAddFood({ name: spot.name, tags: spot.tags.map(normalizeTag), icon: spot.icon, color: spot.color, diet: spot.diet ? [spot.diet] : [], price: spot.price });
              onToast(t('{name} added to your food list.', { name: spot.name }));
            })
          }
          onPick={
            spotPickLabel
              ? () =>
                  run(async () => {
                    if (secret) {
                      await days.submitSecretPick(spot.name);
                      onToast(t('Locked in. Only you can see {name} until the reveal.', { name: spot.name }));
                    } else {
                      await pickFromSheet({ name: spot.name });
                      onToast(others.length === 0 ? t('{name} it is.', { name: spot.name }) : t('Sent {name} to {who}.', { name: spot.name, who: waitingFor }));
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
          members={members}
          onClose={() => setSheet(null)}
          onPick={async (p) => {
            const name = 'food' in p ? p.food.name : p.name;
            if (secret && todayEntry?.status === 'pending') {
              await days.submitSecretPick('food' in p ? p.food.name : foodByName(p.name).name);
              onToast(t('Locked in. Only you can see {name} until the reveal.', { name }));
              return;
            }
            await pickFromSheet(p);
            onToast(others.length === 0 ? t('{name} it is.', { name }) : t('Sent {name} to {who}.', { name, who: waitingFor }));
          }}
        />
      )}
    </main>
  );
}
