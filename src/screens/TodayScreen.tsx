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
import { BillLine, RatingRow } from '../components/MealExtras';
import { BillSheet } from '../components/Bills';
import { TapauLine, TapauSheet } from '../components/Tapau';
import { WhosInCard } from '../components/WhosIn';
import { MeetupCard, PlanAheadSheet, VoteCard, VoteSheet } from '../components/Plans';
import { SwipeCard, SwipeSheet } from '../components/Swipe';
import type { BillItem } from '../lib/money';
import type { AttendanceApi } from '../lib/useAttendance';
import { useTapau } from '../lib/useTapau';
import { shareCard } from '../lib/shareCard';
import { MealPhotos, photoUrl, ReactionBar } from '../components/MealSocial';
import { JoinRequestList } from '../components/JoinRequests';
import { PlaceNotes } from '../components/PlaceNotes';
import { EventsCard } from '../components/Events';
import { useEvents } from '../lib/useEvents';
import { useJoinRequests } from '../lib/useJoinRequests';
import { clockTime } from '../lib/vote';
import { PickSheet } from '../components/PickSheet';
import { SecretCollectCard, SecretRevealCard, type RevealedPick } from '../components/SecretCards';
import { AUTO_PICK_AT, daysBetween } from '../lib/dates';
import { useQueues } from '../lib/queues';
import { usualsAt } from '../lib/usual';
import { QueueBadge, QueueRow } from '../components/Queue';
import { DealSheet, DealsRow, SpotDeals } from '../components/Deals';
import { Lifts } from '../components/Lifts';
import type { DealsApi } from '../lib/useDeals';
import { AddSpotSheet, LocationLine, NearbyAllSheet, NearbyList, NearbyStrip, NearYouStrip, SpotSheet } from '../components/Nearby';
import { OnlineDot, PeopleSheet } from '../components/PeopleSheet';
import { customFood, entryFood, joinNames, normalizeTag, timesWord, type Food, type FoodDraft } from '../lib/foods';
import { locale, t, tNodes } from '../lib/i18n';
import { shareInvite } from '../lib/invite';
import { hostOf, roomTitle } from '../lib/session';
import { useLocation } from '../lib/location';
import { byDistance, coveredFirst, spotIsCovered, spotOpenNow, isNearSunway, NEARBY_LABEL, roomSpot, SUNWAY_CENTRE, SUNWAY_SPOTS, spotsFor, spotsOfTheDay, type Spot } from '../lib/nearby';
import { useRain } from '../lib/weather';
import { suggestions } from '../lib/suggest';
import { SuggestCard } from '../components/SuggestCard';
import { nearbyPref, usePref } from '../lib/prefs';
import { spotSuitability, suitsEveryone } from '../lib/diet';
import { addDays, dayLabel, dayMonthLabel, deciderFor, rotationOf } from '../lib/rotation';
import { eatingDaysAfter, holidayOn, isEatingDay } from '../lib/calendar';
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
  /** The room's chat, and how many messages are new there. */
  onOpenChat?: () => void;
  unreadChat?: number;
  onSpin: () => void;
  onSeeAll: () => void;
  /** Back to the home screen with every room. */
  onHome?: () => void;
  onToast: (message: string) => void;
  /** Ratings, bills and the room's own spots. */
  extras: RoomExtras;
  /** Who's in for each meal. */
  attendance: AttendanceApi;
  /** Who said they're out for this meal. */
  away: ReadonlySet<string>;
  /** Which meal this is about; rooms deciding both get a lunch/dinner switch. */
  meal: Meal;
  onMealChange?: (meal: Meal) => void;
  /** On a day off (weekend, public holiday): eat together anyway, with this phone deciding. */
  onEatAnyway?: () => void;
  /** Promos people in the room spotted. */
  deals: DealsApi;
}

/** "11:42" right now in the room's timezone, for comparing with times like "12:00". */
const clockNow = (timeZone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date());

type JustVetoed = { veto: VetoRow; previous: DayEntryRow; foodName: string };

export function TodayScreen({ room, me, members, today, foods, pickable, days, online, onAddFood, onOpenSettings, onOpenChat, unreadChat = 0, onSpin, onSeeAll, onHome, onToast, extras, attendance, away, meal, onMealChange, onEatAnyway, deals }: Props) {
  const [dealFor, setDealFor] = useState<{ spotId: string | null } | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [allSpots, setAllSpots] = useState(false);
  const showNearby = usePref(nearbyPref) === 'on';
  const [billOpen, setBillOpen] = useState(false);
  const [billStart, setBillStart] = useState<{ paidBy: string; items: BillItem[] } | undefined>(undefined);
  const [tapauOpen, setTapauOpen] = useState(false);
  const [voteSheet, setVoteSheet] = useState(false);
  const [swipeSheet, setSwipeSheet] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const events = useEvents(room.id, me.id);
  const queues = useQueues();
  const joinRequests = useJoinRequests(room.id, hostOf(members, room.host_id)?.id === me.id);
  // Whoever's in for this meal: they decide, answer, pick and pay.
  const present = members.filter((m) => !away.has(m.id));
  const [addingSpot, setAddingSpot] = useState(false);
  const roomSpots = useMemo(() => extras.spots.map(roomSpot), [extras.spots]);
  const location = useLocation();
  const here = location.status === 'ready' ? location.here : undefined;
  const nearSunway = !here || isNearSunway(here);
  // Rain now or soon near Sunway: places you can walk to under cover come first.
  const rain = useRain(nearSunway ? (here ?? SUNWAY_CENTRE) : undefined);
  const wet = !!rain && (rain.now || rain.soon);
  const dry = (spots: Spot[]) => (wet ? coveredFirst(spots) : spots);
  const rainNote = wet ? (
    <p role="status" style={{ margin: 0, padding: '10px 12px', borderRadius: 14, background: 'var(--accent-tint)', color: 'var(--accent-ink)', fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>
      {rain?.now
        ? t('🌧 It’s raining. Places you can reach under cover come first, or order in from a place’s page.')
        : t('🌦 Rain is likely soon. Places you can reach under cover come first.')}
    </p>
  ) : null;
  // Places that suit everyone's diet and budget first; the rest only if nothing fits.
  const suiting = (spots: Spot[]) => {
    const fit = spots.filter((sp) => suitsEveryone(spotSuitability(sp), present));
    return fit.length ? fit : spots;
  };
  const [sheet, setSheet] = useState<'list' | 'type' | null>(null);
  const [justVetoed, setJustVetoed] = useState<JustVetoed | null>(null);
  const { busy, run } = useAction(onToast);

  const { entries, todayEntry, todayVetoes, myVetoesToday } = days;
  const tapau = useTapau(room.id, todayEntry?.status === 'accepted' ? todayEntry.id : null);
  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameFor = (id: string | null, you = t('You')) => (id === me.id ? you : (id && memberById.get(id)?.name) || t('Someone'));

  const rot = rotationOf(room);
  // Weekends and public holidays the room doesn't eat together use nobody's turn.
  const offDay = !isEatingDay(today, rot.cal);
  const decider = (todayEntry && memberById.get(todayEntry.decider_id ?? '')) || (offDay ? me : deciderFor(members, rot, today, meal, away)) || me;
  const isDecider = decider.id === me.id;
  const others = present.filter((m) => m.id !== decider.id);
  const waitingFor = others.length === 1 ? others[0].name : others.length === 0 ? t('nobody yet') : t('everyone');
  const todayFood = todayEntry ? entryFood(todayEntry, foodsById) : null;
  // Everyone's usual where you're eating today, from old bills at the same place or food.
  const usuals = useMemo(
    () => (todayEntry?.status === 'accepted' && !todayEntry.mystery_hidden ? usualsAt([todayEntry.meet_place, todayFood?.name, tapau.run?.place], entries ?? [], extras.bills, foodsById, todayEntry.id) : new Map()),
    [todayEntry, todayFood?.name, tapau.run?.place, entries, extras.bills, foodsById],
  );
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
  const allIn = present.length > 0 && present.every((m) => pickedIds.has(m.id));
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

  // The next day the room eats together: tomorrow, or after a weekend or holiday.
  const nextDay = eatingDaysAfter(today, rot.cal, 1)[0] ?? addDays(today, 1);
  const tomorrow = deciderFor(members, rot, nextDay, meal, attendance.awayOn(nextDay, meal));
  const tomorrowText = !tomorrow
    ? ''
    : nextDay === addDays(today, 1)
      ? tomorrow.id === me.id
        ? t('Tomorrow it’s your turn to decide.')
        : t('Tomorrow it’s {name}’s turn.', { name: tomorrow.name })
      : tomorrow.id === me.id
        ? t('Next turn, {day}: yours.', { day: dayLabel(nextDay) })
        : t('Next turn, {day}: {name}.', { day: dayLabel(nextDay), name: tomorrow.name });

  // A mystery pick: agreed at once and hidden from the others till the meet-up.
  const [mysteryOn, setMysteryOn] = useState(false);
  const pickFromSheet = async (p: { food: Food } | { name: string }, mystery = false) => {
    const match = 'food' in p ? p.food : pickable.find((f) => f.name.toLowerCase() === p.name.toLowerCase());
    const pick = match ? { foodId: match.id, name: match.name } : { foodId: null, name: 'name' in p ? p.name : '' };
    // Nobody can veto a mystery, so it has to suit everyone's diet and budget.
    if (mystery && match && !suitsEveryone(match, present)) throw new Error(t('A mystery has to suit everyone, and {food} doesn’t.', { food: match.name }));
    return mystery ? days.proposeMystery(pick) : days.propose(pick, 'direct');
  };

  // Closed-today warnings: the pick (when it's a place) or the meet-up place, at the time you'd go.
  const placeNamed = (name: string) => [...roomSpots, ...SUNWAY_SPOTS].find((sp) => sp.name.toLowerCase() === name.trim().toLowerCase());
  const closedNote = (() => {
    if (!todayEntry || todayEntry.status !== 'accepted' || !todayFood) return null;
    const at = todayEntry.meet_at ? new Date(todayEntry.meet_at) : new Date();
    const when = todayEntry.meet_at ? clockTime(todayEntry.meet_at, room.timezone) : null;
    for (const name of [todayEntry.meet_place, todayFood.name]) {
      const place = name ? placeNamed(name) : undefined;
      const state = place ? spotOpenNow(place, at) : null;
      if (place && state && !state.open)
        return when ? t('⚠️ {place} looks closed at {time} ({hours}). Check before heading out.', { place: place.name, time: when, hours: state.label }) : t('⚠️ {place} looks closed right now ({hours}).', { place: place.name, hours: state.label });
    }
    const near = spotsFor(todayFood, 6, [...roomSpots, ...SUNWAY_SPOTS]).map((sp) => spotOpenNow(sp, at)).filter((x): x is NonNullable<typeof x> => !!x);
    if (near.length >= 2 && near.every((x) => !x.open)) return t('⚠️ The places for {food} nearby look closed at that time. Check before heading out.', { food: todayFood.name });
    return null;
  })();
  const closedBanner = closedNote ? (
    <p role="status" style={{ margin: 0, padding: '10px 12px', borderRadius: 14, background: 'var(--danger-tint)', color: 'var(--danger)', fontSize: 13, lineHeight: 1.45, fontWeight: 700 }}>
      {closedNote}
    </p>
  ) : null;

  /* ----- The main card for today's state ----- */

  let main: React.ReactNode;
  let proposalView = false;

  if (offDay && !todayEntry && entries) {
    const holiday = holidayOn(today, rot.cal);
    main = <OffDayCard holiday={holiday ? t(holiday) : null} nextText={tomorrowText} onAnyway={onEatAnyway} />;
  } else if (!todayEntry || !entries) {
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
  } else if (todayEntry.swipe_options && todayEntry.status !== 'accepted') {
    main = (
      <SwipeCard
        key={todayEntry.swipe_round ?? 0}
        foods={todayEntry.swipe_options.map(foodByName)}
        swipes={days.swipes}
        round={todayEntry.swipe_round ?? 0}
        voters={present}
        me={me}
        decider={decider}
        onSwipe={days.swipe}
        onSettle={(food) => days.settleSwipe(food.id.startsWith('custom') ? { foodId: null, name: food.name } : { foodId: food.id, name: food.name })}
        onDealAgain={() => setSwipeSheet(true)}
        onCancel={days.cancelSwipe}
        onError={onToast}
      />
    );
  } else if (todayEntry.vote_options && todayEntry.status !== 'accepted') {
    const options = todayEntry.vote_options;
    main = (
      <VoteCard
        key={todayEntry.vote_ends_at ?? 'vote'}
        options={options}
        votes={days.votes}
        voters={present}
        me={me}
        isDecider={isDecider}
        endsAt={todayEntry.vote_ends_at ?? null}
        onVote={days.castVote}
        onSettle={(winner) => {
          const match = pickable.find((f) => f.name.toLowerCase() === winner.toLowerCase());
          return days.settleVote(match ? { foodId: match.id, name: match.name } : { foodId: null, name: winner });
        }}
        onCancel={days.cancelVote}
        onError={onToast}
      />
    );
  } else if (todayEntry.status === 'accepted' && todayEntry.mystery_hidden) {
    main = <MysteryCard decider={decider.name} meal={meal} meetAt={todayEntry.meet_at ?? null} timeZone={room.timezone} />;
  } else if (todayEntry.status === 'accepted' && todayFood) {
    main = (
      <DecidedCard
        food={todayFood}
        tomorrowText={tomorrowText}
        here={here}
        nearby={
          showNearby ? (
            <>
              {closedBanner}
              {rainNote}
              <NearbyList spots={dry(suiting(spotsFor(todayFood, 6, [...roomSpots, ...SUNWAY_SPOTS]))).slice(0, 3)} here={here} />
            </>
          ) : null
        }
        extras={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8 }}>
            <ReactionBar dayEntryId={todayEntry.id} me={me} members={members} onError={onToast} />
            <RatingRow entryId={todayEntry.id} ratings={extras.ratings} meId={me.id} onRate={(r) => run(() => extras.rate(todayEntry.id, r))} />
            <MealPhotos
              photos={extras.photos.filter((p) => p.day_entry_id === todayEntry.id).reverse()}
              me={me}
              members={members}
              isHost={hostOf(members, room.host_id)?.id === me.id}
              onAdd={(file) => extras.addPhoto(todayEntry.id, file)}
              onRemove={extras.removePhoto}
              onError={onToast}
            />
            <BillLine bill={extras.bills.find((b) => b.day_entry_id === todayEntry.id) ?? null} members={members} meId={me.id} onOpen={() => setBillOpen(true)} />
            {!extras.bills.some((b) => b.day_entry_id === todayEntry.id) && <TapauLine tapau={tapau} members={members} meId={me.id} onOpen={() => setTapauOpen(true)} />}
            <button
              type="button"
              className="press"
              onClick={() =>
                run(async () => {
                  const msg = await shareCard({
                    room: roomTitle(room),
                    date: new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${today}T00:00:00Z`)),
                    food: todayFood.name,
                    place: todayEntry.meet_place,
                    time: todayEntry.meet_at ? t('Leaving {time}', { time: clockTime(todayEntry.meet_at, room.timezone) }) : null,
                    by: todayEntry.method === 'wheel' ? t('Picked by the wheel') : t('{name} picked', { name: nameFor(todayEntry.decider_id, me.name) }),
                    photo: await (async () => {
                      const latest = extras.photos.find((p) => p.day_entry_id === todayEntry.id);
                      return latest ? photoUrl(latest.path) : null;
                    })(),
                  });
                  if (msg) onToast(msg);
                })
              }
              style={{ alignSelf: 'center', minHeight: 44, padding: '0 12px', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent-text)' }}
            >
              {t('Share today’s pick as a picture')}
            </button>
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
        members={present}
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
          autoAt={todayEntry.auto_picked ? AUTO_PICK_AT[meal] : undefined}
          waitingFor={waitingFor}
          answerers={joinNames(others.map((m) => m.name), 'or')}
          several={others.length > 1}
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
      // The wheel steps in if nobody's picked by 12:00 (7pm for dinner).
      if (room.auto_decide !== false && others.length > 0 && !latestVeto && clockNow(room.timezone) < AUTO_PICK_AT[meal]) {
        sub = `${sub} ${t('If you haven’t picked by {time}, the wheel will.', { time: AUTO_PICK_AT[meal] })}`;
      }
      main = (
        <>
          <YourTurnCard
            me={me}
            sub={sub}
            onSpin={onSpin}
            onPickList={() => setSheet('list')}
            onType={() => setSheet('type')}
            onVote={others.length > 0 && pickable.length >= 2 ? () => setVoteSheet(true) : undefined}
            onSwipe={others.length > 0 && pickable.length >= 3 ? () => setSwipeSheet(true) : undefined}
            onSuggest={() => setSuggesting((on) => !on)}
          />
          {suggesting && (
            <SuggestCard
              list={suggestions({
                foods: pickable,
                suits: (f) => suitsEveryone(f, present),
                wet,
                covered: (f) => spotsFor(f, 6, SUNWAY_SPOTS).some(spotIsCovered),
              })}
              onPick={async (food) => {
                await pickFromSheet({ food });
                setSuggesting(false);
              }}
              onClose={() => setSuggesting(false)}
              onError={onToast}
            />
          )}
        </>
      );
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
        autoAt={todayEntry.auto_picked ? AUTO_PICK_AT[meal] : undefined}
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

  const upNext = eatingDaysAfter(today, rot.cal, 3).map((date) => ({ date, member: deciderFor(members, rot, date, meal, attendance.awayOn(date, meal)) }));

  const backHome = onHome && (
    <button type="button" className="icon-btn press" aria-label={t('All rooms')} onClick={onHome} style={{ flexShrink: 0, alignSelf: 'center' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );

  const recent = (entries ?? []).filter((e) => e.status === 'accepted' && e.entry_date < today).slice(0, 3);

  return (
    <main className="screen" style={{ gap: proposalView ? 20 : 18 }}>
      {proposalView ? (
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {backHome}
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
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {backHome}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexGrow: 1 }}>
            <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${today}T00:00:00Z`))}
            </span>
            {/* The room's name, so it's always clear which group this is. */}
            <h1
              className="title title--sm"
              style={{ fontSize: 26, lineHeight: 1.1, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {roomTitle(room)}
            </h1>
          </div>
          {onOpenChat && (
            <button
              type="button"
              className="icon-btn press"
              aria-label={unreadChat ? (unreadChat === 1 ? t('Chat, 1 new message') : t('Chat, {n} new messages', { n: unreadChat })) : t('Chat')}
              onClick={onOpenChat}
              style={{ flexShrink: 0, alignSelf: 'center', position: 'relative' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {unreadChat > 0 && (
                <span aria-hidden="true" style={{ position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', boxShadow: '0 0 0 2px var(--bg)' }}>
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </button>
          )}
          <button type="button" className="icon-btn press" aria-label={t('Room settings')} onClick={onOpenSettings} style={{ flexShrink: 0, alignSelf: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
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
              padding: '0 8px 0 6px',
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

      {joinRequests.requests.length > 0 && !proposalView && (
        <section className="card fade-up" aria-label={t('Waiting to join')} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, borderColor: 'var(--accent)' }}>
          <JoinRequestList requests={joinRequests.requests} onAnswer={joinRequests.answer} onToast={onToast} />
        </section>
      )}

      {main}
      {isDecider && todayEntry?.status === 'accepted' && todayEntry.mystery && !todayEntry.mystery_revealed && (
        <section className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ flexGrow: 1, fontSize: 14, lineHeight: 1.45 }}>{t('🎁 It’s a mystery to the others. They find out at the meet-up time, or when you reveal it.')}</span>
          <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => run(days.revealMystery)} style={{ height: 40, padding: '0 14px', flexShrink: 0 }}>
            {t('Reveal now')}
          </button>
        </section>
      )}

      {!proposalView && todayEntry?.status === 'accepted' && todayFood && present.length > 1 && (
        <MeetupCard
          meetAt={todayEntry.meet_at ?? null}
          place={todayEntry.meet_place ?? null}
          today={today}
          timeZone={room.timezone}
          places={todayEntry.mystery_hidden ? [t('Lobby')] : [t('Lobby'), ...suiting(spotsFor(todayFood, 6, [...roomSpots, ...SUNWAY_SPOTS])).map((sp) => sp.name)]}
          late={members.filter((m) => m.id !== me.id && attendance.statusOf(m.id, today, meal) === 'late')}
          myStatus={attendance.statusOf(me.id, today, meal)}
          onSave={(at, where) => run(() => days.setMeetup(at, where))}
          onLate={() => run(() => attendance.setStatus(me.id, today, meal, 'late'))}
          warning={todayEntry.meet_at ? closedNote : null}
          extra={members.length > 1 ? <Lifts roomId={room.id} me={me} members={members} trip={{ dayEntryId: todayEntry.id }} onError={onToast} /> : undefined}
          calendar={{
            uid: `${todayEntry.id}-${todayEntry.meet_at ?? ''}`,
            title: t('{meal}: {food}, with {room}', { meal: meal === 'dinner' ? t('Dinner') : t('Lunch'), food: todayFood.name, room: roomTitle(room) }),
            description: t('Planned on Makan apa?'),
          }}
        />
      )}

      {!proposalView && members.length > 1 && todayEntry && (
        <WhosInCard
          onPlan={() => setPlanOpen(true)}
          me={me}
          members={members}
          meal={meal}
          statusOf={(id) => attendance.statusOf(id, today, meal)}
          onSet={(status) => run(() => attendance.setStatus(me.id, today, meal, status))}
          guests={attendance.guestsOn(today, meal)}
          onGuests={(n) => run(() => attendance.setGuests(me.id, today, meal, n))}
        />
      )}

      {!proposalView && <EventsCard room={room} me={me} members={members} api={events} extras={extras} onToast={onToast} />}

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
          <MealPhotos
            compact
            photos={extras.photos.filter((p) => p.day_entry_id === lastMeal.entry.id).reverse()}
            me={me}
            members={members}
            isHost={hostOf(members, room.host_id)?.id === me.id}
            onAdd={(file) => extras.addPhoto(lastMeal.entry.id, file)}
            onRemove={extras.removePhoto}
            onError={onToast}
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
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, animation: 'fadeUp 0.55s 0.12s cubic-bezier(0.2, 0.8, 0.2, 1) backwards' }}>
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

          <section style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, animation: 'fadeUp 0.55s 0.24s cubic-bezier(0.2, 0.8, 0.2, 1) backwards' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="section-label">{t('Recently')}</span>
              <button
                type="button"
                onClick={onSeeAll}
                style={{ padding: '10px 0', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent-text)' }}
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
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, animation: 'fadeUp 0.55s 0.36s cubic-bezier(0.2, 0.8, 0.2, 1) backwards' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="section-label">{!here ? t('Ideas near {place}', { place: NEARBY_LABEL }) : nearSunway ? t('Ideas closest to you') : t('Ideas near you')}</span>
                <button
                  type="button"
                  onClick={() => setAllSpots(true)}
                  style={{ padding: '10px 0', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent-text)' }}
                >
                  {nearSunway ? t('See all {n}', { n: SUNWAY_SPOTS.length + roomSpots.length }) : t('Sunway picks')}
                </button>
              </div>
              {nearSunway && rainNote}
              {nearSunway && <DealsRow api={deals} spots={[...SUNWAY_SPOTS, ...roomSpots]} today={today} onOpenSpot={setSpot} onPost={() => setDealFor({ spotId: null })} />}
              {here && !nearSunway ? (
                <NearYouStrip here={here} />
              ) : (
                <NearbyStrip
                  spots={dry(suiting(here ? byDistance([...roomSpots, ...spotsOfTheDay(today)], here) : [...roomSpots, ...spotsOfTheDay(today)])).slice(0, 8 + Math.min(roomSpots.length, 4))}
                  here={here}
                  onOpen={setSpot}
                  extraFor={(s) => <QueueBadge q={queues.byPlace.get(s.id)} />}
                />
              )}
              <LocationLine location={location} nearSunway={nearSunway} />
            </section>
          )}
        </>
      )}

      {billOpen && todayEntry && todayFood && (
        <BillSheet
          dayEntryId={todayEntry.id}
          usuals={usuals}
          foodName={todayFood.name}
          when={room.meals === 'both' ? `${dayMonthLabel(today)} · ${meal === 'dinner' ? t('Dinner') : t('Lunch')}` : dayMonthLabel(today)}
          members={members}
          meId={me.id}
          extras={extras}
          away={away}
          start={billStart}
          kittyKeeper={room.kitty_keeper}
          guests={attendance.guestsOn(today, meal)}
          onSaved={(removed) => onToast(removed ? t('Bill removed.') : t('Bill saved. See who owes what in Bills.'))}
          onClose={() => {
            setBillOpen(false);
            setBillStart(undefined);
          }}
        />
      )}

      {swipeSheet && (
        <SwipeSheet
          foods={(() => {
            // Foods everyone can eat, when there are enough of them.
            const suiting = pickable.filter((f) => suitsEveryone(f, present));
            return suiting.length >= 3 ? suiting : pickable;
          })()}
          onStart={days.startSwipe}
          onClose={() => setSwipeSheet(false)}
        />
      )}
      {voteSheet && (
        <VoteSheet foods={pickable.map((f) => f.name)} onStart={(options, minutes) => days.startVote(options, minutes)} onClose={() => setVoteSheet(false)} />
      )}

      {planOpen && (
        <PlanAheadSheet
          today={today}
          meals={room.meals === 'both' ? ['lunch', 'dinner'] : ['lunch']}
          statusOf={(date, m) => attendance.statusOf(me.id, date, m)}
          onSet={(date, m, status) => attendance.setStatus(me.id, date, m, status)}
          onClose={() => setPlanOpen(false)}
        />
      )}

      {tapauOpen && todayEntry && todayFood && (
        <TapauSheet
          tapau={tapau}
          foodName={todayFood.name}
          places={suiting(here ? byDistance(spotsFor(todayFood, 6, [...roomSpots, ...SUNWAY_SPOTS]), here) : spotsFor(todayFood, 6, [...roomSpots, ...SUNWAY_SPOTS])).map((sp) => sp.name)}
          members={members}
          me={me}
          onToast={onToast}
          usuals={usuals}
          onMakeBill={(items, paidBy) => {
            setTapauOpen(false);
            setBillStart({ items, paidBy });
            setBillOpen(true);
          }}
          onClose={() => setTapauOpen(false)}
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
          meal={meal}
          onClose={() => setPeopleOpen(false)}
          onPlan={() => {
            setPeopleOpen(false);
            setPlanOpen(true);
          }}
          onInvite={() => run(async () => {
            const message = await shareInvite(room.code, room.name);
            if (message) onToast(message);
          })}
          onSettings={() => {
            setPeopleOpen(false);
            onOpenSettings();
          }}
          onHome={onHome}
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
          members={members}
          notes={
            <>
              <QueueRow spotId={spot.id} queues={queues} onError={onToast} />
              <SpotDeals spot={spot} api={deals} today={today} me={me} members={members} isHost={hostOf(members, room.host_id)?.id === me.id} onPost={() => setDealFor({ spotId: spot.id })} onError={onToast} />
              <PlaceNotes roomId={room.id} spotId={spot.id} me={me} members={members} isHost={hostOf(members, room.host_id)?.id === me.id} onError={onToast} />
            </>
          }
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
          members={present}
          mystery={!secret && others.length > 0 ? { on: mysteryOn, onToggle: setMysteryOn } : undefined}
          onClose={() => setSheet(null)}
          onPick={async (p) => {
            const name = 'food' in p ? p.food.name : p.name;
            if (secret && todayEntry?.status === 'pending') {
              await days.submitSecretPick('food' in p ? p.food.name : foodByName(p.name).name);
              onToast(t('Locked in. Only you can see {name} until the reveal.', { name }));
              return;
            }
            const mystery = mysteryOn && others.length > 0;
            await pickFromSheet(p, mystery);
            setMysteryOn(false);
            onToast(
              mystery
                ? t('{name} it is, and it’s a mystery to the others. Set where to meet so they know where to go.', { name })
                : others.length === 0
                  ? t('{name} it is.', { name })
                  : t('Sent {name} to {who}.', { name, who: waitingFor }),
            );
          }}
        />
      )}
      {dealFor && (
        <DealSheet
          spots={[...SUNWAY_SPOTS, ...roomSpots]}
          today={today}
          spotId={dealFor.spotId}
          onPost={async (d) => {
            await deals.post(d);
            onToast(t('Deal posted. Everyone in the room can see it.'));
          }}
          onClose={() => setDealFor(null)}
        />
      )}
    </main>
  );
}

/** A weekend or public holiday the room doesn't eat together: no turns, unless you want to. */
function OffDayCard({ holiday, nextText, onAnyway }: { holiday: string | null; nextText: string; onAnyway?: () => void }) {
  return (
    <section aria-labelledby="off-day-label" className="card fade-up" style={{ padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <span aria-hidden="true" style={{ fontSize: 32, lineHeight: 1 }}>
        {holiday ? '🇲🇾' : '🏖️'}
      </span>
      <h2 id="off-day-label" style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>
        {holiday ? t('Public holiday: {name}', { name: holiday }) : t('Day off')}
      </h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
        {t('No turns today, so nobody’s turn is used up.')} {nextText}
      </p>
      {onAnyway && (
        <button type="button" className="btn btn--secondary press" onClick={onAnyway} style={{ height: 44, marginTop: 4 }}>
          {t('Eating together anyway? I’ll decide')}
        </button>
      )}
    </section>
  );
}

/** Everyone but the decider, on a mystery day: where and when to meet, but not what. */
function MysteryCard({ decider, meal, meetAt, timeZone }: { decider: string; meal: Meal; meetAt: string | null; timeZone: string }) {
  const time = meetAt ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(meetAt)) : null;
  return (
    <section aria-labelledby="mystery-label" className="card fade-up" style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, background: 'var(--accent-tint)', color: 'var(--accent-ink)', borderColor: 'transparent' }}>
      <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 1 }}>
        🎁
      </span>
      <h2 id="mystery-label" style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
        {meal === 'dinner' ? t('Mystery dinner!') : t('Mystery lunch!')}
      </h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
        {time
          ? t('{name} picked, and it suits everyone. Meet at {time}: you’ll find out what it is then.', { name: decider, time })
          : t('{name} picked, and it suits everyone. You’ll find out once they say where to meet.', { name: decider })}
      </p>
    </section>
  );
}

