import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { TAB_ORDER, TabBar, type Tab } from './components/TabBar';
import { useTabSwipe } from './lib/useTabSwipe';
import { t } from './lib/i18n';
import { disableReminders, followRoom } from './lib/push';
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { carryProfile } from './lib/profile';
import { lastSeen, markSeen } from './lib/seen';
import { closeCurrentRoom, currentRoomId, forgetSession, knownRooms, leaveRoom, restoreSession, roomTitle, selectRoom, type Session } from './lib/session';
import { suitsEveryone } from './lib/diet';
import { entryFood, type Food } from './lib/foods';
import { deciderFor, rotationOf } from './lib/rotation';
import { isEatingDay } from './lib/calendar';
import type { Meal } from './lib/supabase';
import { mealNow } from './lib/dates';
import { useDays } from './lib/useDays';
import { usePresence } from './lib/usePresence';
import { useToday } from './lib/useToday';
import { useFoods } from './lib/useFoods';
import { useRoomData } from './lib/useRoomData';
import { useRoomExtras } from './lib/useRoomExtras';
import { useAttendance } from './lib/useAttendance';
import { useChat } from './lib/useChat';
import { useLiveSpin } from './lib/liveSpin';
import { LiveSpinOverlay } from './components/LiveSpinOverlay';
import { useRain } from './lib/weather';
import { roomSpot, SUNWAY_CENTRE, SUNWAY_SPOTS, spotIsCovered, spotsFor } from './lib/nearby';
import { useDeals } from './lib/useDeals';
import { decodeFoods, PENDING_FOODS_KEY } from './lib/foodShare';
import { PENDING_PAID_KEY } from './lib/paidLink';
import { storage } from './lib/storage';
import { useConnection } from './lib/offline';
import { JoinScreen } from './screens/JoinScreen';
import { TodayScreen } from './screens/TodayScreen';
import type { WheelSend } from './screens/WheelScreen';

// Today and Join load with the app; the other tabs load when first opened (and in the background
// once the app's idle, so they're cached for offline use).
const loadWheel = () => import('./screens/WheelScreen');
const loadPool = () => import('./screens/PoolScreen');
const loadHistory = () => import('./screens/HistoryScreen');
const loadBills = () => import('./screens/BillsScreen');
const loadSettings = () => import('./screens/SettingsScreen');
const loadChat = () => import('./screens/ChatScreen');
const WheelScreen = lazy(() => loadWheel().then((m) => ({ default: m.WheelScreen })));
const PoolScreen = lazy(() => loadPool().then((m) => ({ default: m.PoolScreen })));
const HistoryScreen = lazy(() => loadHistory().then((m) => ({ default: m.HistoryScreen })));
const BillsScreen = lazy(() => loadBills().then((m) => ({ default: m.BillsScreen })));
const SettingsScreen = lazy(() => loadSettings().then((m) => ({ default: m.SettingsScreen })));
const ChatScreen = lazy(() => loadChat().then((m) => ({ default: m.ChatScreen })));

function preloadScreens() {
  const go = () => [loadWheel, loadPool, loadBills, loadHistory, loadSettings, loadChat].forEach((load) => void load().catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 2000);
}

type Route = Tab | 'settings' | 'chat';
const ROUTES: Route[] = ['today', 'wheel', 'pool', 'bills', 'history', 'settings', 'chat'];

function routeFromHash(): Route {
  const h = window.location.hash.replace('#', '') as Route;
  return ROUTES.includes(h) ? h : 'today';
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'home' }
  | { status: 'profile' }
  | { status: 'join'; notice?: string; mode?: 'create' | 'join' }
  | { status: 'ready'; session: Session };

/** Drop ?room= (and optionally ?join=) from the address bar once used, keeping the tab. */
/**
 * The room this browser tab is inside, kept for the tab's life only (sessionStorage). A reload
 * stays in the room; opening the app afresh (a new launch or tab) starts on the main menu.
 */
const IN_ROOM_KEY = 'makan.inRoom';
const tabRoom = {
  get(): string | null {
    try {
      return window.sessionStorage.getItem(IN_ROOM_KEY);
    } catch {
      return null;
    }
  },
  set(roomId: string | null) {
    try {
      if (roomId) window.sessionStorage.setItem(IN_ROOM_KEY, roomId);
      else window.sessionStorage.removeItem(IN_ROOM_KEY);
    } catch {
      /* private mode: every launch starts on the main menu */
    }
  },
};

function clearParam(...names: string[]) {
  const url = new URL(window.location.href);
  names.forEach((n) => url.searchParams.delete(n));
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [toast, setToast] = useState<string | null>(null);

  // Bumped on every restore, join and leave so a slow, stale restore can't land afterwards.
  const generation = useRef(0);

  const restore = () => {
    const gen = ++generation.current;
    if (!navigator.onLine) {
      setState({ status: 'error', message: 'offline' });
      return;
    }
    setState({ status: 'loading' });
    restoreSession().then(
      (session) => gen === generation.current && setState(session ? { status: 'ready', session } : knownRooms().length ? { status: 'home' } : { status: 'join' }),
      (e: unknown) => gen === generation.current && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
  };

  /**
   * Opening the app: a notification's ?room= goes straight into that room, an invite link's
   * ?join= to its room (or the join screen), otherwise the home screen with every room.
   */
  const start = () => {
    const params = new URLSearchParams(window.location.search);
    // A shared food list (?foods=): kept until a room is open, then offered on its Food list.
    const sharedFoods = params.get('foods');
    if (sharedFoods) {
      clearParam('foods');
      if (decodeFoods(sharedFoods)) {
        storage.set(PENDING_FOODS_KEY, sharedFoods);
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#pool`);
      }
    }
    // Home-screen shortcuts (long-press the app icon): ?go=today, bills or new.
    const goParam = params.get('go');
    if (goParam) {
      clearParam('go');
      if (goParam === 'new') {
        generation.current++;
        closeCurrentRoom();
        return setState(knownRooms().length ? { status: 'join', mode: 'create' } : { status: 'join' });
      }
      if (goParam === 'today' || goParam === 'bills' || goParam === 'chat') {
        // The room you were in most recently.
        const recent = [...knownRooms()].sort((a, b) => (lastSeen(b.roomId) ?? '').localeCompare(lastSeen(a.roomId) ?? ''))[0];
        if (recent && selectRoom(recent.roomId)) {
          window.history.replaceState(null, '', `${window.location.pathname}#${goParam}`);
          return restore();
        }
      }
    }
    // "I've paid" on a payback nudge: ?paid=<who>:<sen>, confirmed on the Bills tab.
    const paidParam = params.get('paid');
    if (paidParam) {
      clearParam('paid');
      // Tied to the nudge's room, so it can't pop up later in another one.
      storage.set(PENDING_PAID_KEY, `${params.get('room') ?? ''}|${paidParam}`);
    }
    const roomParam = params.get('room');
    if (roomParam) {
      clearParam('room');
      if (selectRoom(roomParam)) return restore();
    }
    const joinCode = params.get('join')?.toUpperCase();
    if (joinCode) {
      const known = knownRooms().find((r) => r.code === joinCode);
      if (known && selectRoom(known.roomId)) {
        clearParam('join');
        return restore();
      }
      generation.current++;
      // An invite link: just joining (with the code filled in), unless this is the first room.
      return setState(knownRooms().length ? { status: 'join', mode: 'join' } : { status: 'join' });
    }
    // A reload inside a room (this tab was in it, and the address has a tab like #bills) stays
    // there. Anything else, including a fresh launch of the installed app, opens the main menu.
    const onTab = (ROUTES as string[]).includes(window.location.hash.replace('#', ''));
    const reloadInRoom = onTab && !!currentRoomId() && tabRoom.get() === currentRoomId();
    if (knownRooms().length && !reloadInRoom) {
      generation.current++;
      closeCurrentRoom();
      return setState({ status: 'home' });
    }
    restore();
  };
  useEffect(start, []);
  // Remember, for this tab only, which room it's inside.
  const readyRoom = state.status === 'ready' ? state.session.room.id : null;
  useEffect(() => {
    if (readyRoom) tabRoom.set(readyRoom);
    else if (state.status === 'home') tabRoom.set(null);
  }, [readyRoom, state.status]);

  const goHome = () => {
    generation.current++;
    tabRoom.set(null);
    closeCurrentRoom();
    // A room opened from home starts on Today.
    window.history.replaceState(null, '', window.location.pathname);
    setState(knownRooms().length ? { status: 'home' } : { status: 'join' });
  };
  const openRoomFromHome = (roomId: string) => {
    if (selectRoom(roomId)) {
      window.history.replaceState(null, '', `${window.location.pathname}#today`);
      restore();
    }
  };

  // Coming back online after an offline start: try again without a tap.
  const status = useRef(state.status);
  status.current = state.status;
  useEffect(() => {
    const onOnline = () => status.current === 'error' && start();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  let body: React.ReactNode;
  if (state.status === 'loading') {
    body = <Splash>{t('Loading…')}</Splash>;
  } else if (state.status === 'error') {
    body = (
      <Splash>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          {state.message === 'offline'
            ? t('You’re offline. Makan apa? needs a connection to sync with your room, and will reconnect when you’re back.')
            : t("Couldn't reach the server. {message}", { message: state.message })}
        </p>
        <button type="button" className="btn btn--primary press" onClick={restore}>
          {t('Try again')}
        </button>
      </Splash>
    );
  } else if (state.status === 'home') {
    body = (
      <HomeScreen
        onOpen={openRoomFromHome}
        onNew={() => setState({ status: 'join', mode: 'create' })}
        onJoin={() => setState({ status: 'join', mode: 'join' })}
        onToast={setToast}
        onNoRooms={() => setState({ status: 'join' })}
        onProfile={() => setState({ status: 'profile' })}
      />
    );
  } else if (state.status === 'profile') {
    body = <ProfileScreen onBack={() => setState({ status: 'home' })} onToast={setToast} />;
  } else if (state.status === 'join') {
    body = (
      <JoinScreen
        key={state.mode ?? 'both'}
        notice={state.notice}
        mode={state.mode}
        onBack={knownRooms().length ? goHome : undefined}
        rooms={knownRooms()}
        onOpenRoom={(roomId) => {
          if (selectRoom(roomId)) restore();
        }}
        onJoined={(session, message) => {
          generation.current++;
          // Drop any ?join= invite code from the address bar now it's been used.
          window.history.replaceState(null, '', `${window.location.pathname}#today`);
          setState({ status: 'ready', session });
          if (message) setToast(message);
          // Phones with notifications on get them for the new room too, and your food needs and
          // DuitNow come along from your other rooms.
          void followRoom(session.me.id).catch(() => {});
          void carryProfile(session.me.id).catch(() => {});
        }}
      />
    );
  } else {
    body = (
      <RoomApp
        key={state.session.me.id}
        session={state.session}
        onToast={setToast}
        onLeave={() => {
          generation.current++;
          void disableReminders(state.session.me.id).catch(() => {});
          forgetSession();
          // Back to the other rooms on this phone, if there are any.
          setState(knownRooms().length ? { status: 'home' } : { status: 'join' });
        }}
        onHome={goHome}
        onProfile={() => {
          goHome();
          setState({ status: 'profile' });
        }}
      />
    );
  }

  return (
    <>
      {body}
      {toast && <Toast message={toast} raised={state.status === 'ready'} />}
    </>
  );
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="app" style={{ justifyContent: 'center', padding: 24, gap: 16 }}>
      <h1 className="title" style={{ fontSize: 44, lineHeight: 0.95 }}>
        Makan <span style={{ color: 'var(--accent-text)' }}>apa?</span>
      </h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--muted)' }}>{children}</div>
    </div>
  );
}

function Toast({ message, raised }: { message: string; raised: boolean }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: raised ? 'calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom))' : 'calc(24px + env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 40px)',
        maxWidth: 360,
        padding: '12px 16px',
        borderRadius: 14,
        background: 'var(--ink)',
        color: 'var(--on-ink)',
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.4,
        boxShadow: '0 10px 24px rgba(24, 24, 27, 0.25)',
        animation: 'toastIn 0.3s var(--ease-out) both',
        zIndex: 30,
      }}
    >
      {message}
    </div>
  );
}

interface RoomAppProps {
  session: Session;
  onToast: (m: string) => void;
  onLeave: () => void;
  /** Back to the home screen with every room. */
  onHome: () => void;
  /** The main menu's You & this phone page. */
  onProfile: () => void;
}

function RoomApp({ session, onToast, onLeave, onHome, onProfile }: RoomAppProps) {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const { room, members: everyone, updateRoom, updateMember, moveMember, removeMember, deleteRoom } = useRoomData(session.room, session.members, session.me.id);
  // People who left stay in the room's history and money, but not in its turns, Who's in or new bills.
  const members = everyone.filter((m) => !m.left_at || m.id === session.me.id);
  const me = everyone.find((m) => m.id === session.me.id) ?? session.me;
  const removed = !everyone.some((m) => m.id === session.me.id) || !!me.removed_at;

  // Someone removed this phone's member from the room.
  useEffect(() => {
    if (removed) {
      onToast(t('You’re no longer in room {code}.', { code: room.code }));
      onLeave();
    }
  }, [removed]);
  const today = useToday(room.timezone);
  // Lunch or dinner, for rooms that decide both: dinner from 6pm in the room's timezone.
  const [mealChoice, setMeal] = useState<Meal>(() => mealNow('both', room.timezone));
  const meal: Meal = room.meals === 'both' ? mealChoice : 'lunch';
  const attendance = useAttendance(room.id, today);
  const away = attendance.awayOn(today, meal);
  const present = members.filter((m) => !away.has(m.id));
  // Days the room doesn't eat together (weekends, public holidays) have no turn, unless someone
  // decides to eat together anyway: then they're the decider.
  const offDay = !isEatingDay(today, rotationOf(room).cal);
  const [anywayOn, setAnywayOn] = useState<string | null>(null);
  const anyway = offDay && anywayOn === `${today}:${meal}`;
  const days = useDays(room, members, me.id, today, meal, away, anyway);
  const extras = useRoomExtras(room.id, me.id);
  const foodsApi = useFoods(room, me.id, days.entries, today, extras.ratings);
  const online = usePresence(room.id, me.id);
  const chat = useChat(room.id, me.id);
  const liveSpin = useLiveSpin(room.id, me.id);
  // On a wet day the wheel leans towards foods you can get without leaving the canopy walk.
  const rain = useRain(SUNWAY_CENTRE);
  const wet = !!rain && (rain.now || rain.soon);
  // Deals someone spotted: the wheel leans a little towards food you can get where they are on.
  const deals = useDeals(room.id, me.id, today);
  const dealSpots = new Set(deals.deals.map((d) => d.spot_id).filter((x): x is string => !!x));
  const allSpots = [...SUNWAY_SPOTS, ...extras.spots.map(roomSpot)];
  const wheelBoost =
    wet || dealSpots.size
      ? (f: Food) => {
          const at = spotsFor(f, 6, allSpots);
          return (wet && at.some(spotIsCovered) ? 1.6 : 1) * (at.some((s) => dealSpots.has(s.id)) ? 1.3 : 1);
        }
      : undefined;
  const { foods, active } = foodsApi;

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: Route) => {
    window.location.hash = next;
    setRoute(next);
  };

  // A food list someone shared waits for the first room you open: show it on the Food list.
  useEffect(() => {
    if (storage.get(PENDING_FOODS_KEY)) go('pool');
  }, [room.id]);

  // Which way a new tab's screen slides in: from the right when it's further along the bar.
  const tab: Tab = route === 'settings' || route === 'chat' ? 'today' : route;
  const tabIndex = TAB_ORDER.indexOf(tab);
  // Worked out while rendering, so the new screen mounts already knowing its side.
  const tabEntry = useRef<{ index: number; from: 'left' | 'right' | null }>({ index: tabIndex, from: null });
  if (tabEntry.current.index !== tabIndex) tabEntry.current = { index: tabIndex, from: tabIndex > tabEntry.current.index ? 'right' : 'left' };
  const enterFrom = tabEntry.current.from;
  const swipe = useTabSwipe(tabIndex, TAB_ORDER.length, (to) => go(TAB_ORDER[to]), route !== 'settings' && route !== 'chat');

  // Today's decider and what the wheel may do about it.
  const memberById = new Map(members.map((m) => [m.id, m]));
  const entry = days.todayEntry;
  const decider = (entry && memberById.get(entry.decider_id ?? '')) || (offDay && !anyway ? null : anyway && !entry ? me : deciderFor(members, rotationOf(room), today, meal, away));
  const isDecider = decider?.id === me.id;
  const others = present.filter((m) => m.id !== decider?.id);
  const sendTo = others.length === 1 ? others[0].name : others.length === 0 ? null : t('everyone');
  const vetoedNames = days.todayVetoes.map((v) => v.rejected_food);
  const vetoed = new Set(vetoedNames.map((n) => n.toLowerCase()));
  const notVetoed = active?.filter((f) => !vetoed.has(f.name.toLowerCase())) ?? null;
  // Keep foods that clash with someone's diet or budget off, unless that leaves too few to spin.
  const suiting = notVetoed?.filter((f) => suitsEveryone(f, present)) ?? null;
  const pickable = suiting && suiting.length >= 2 ? suiting : notVetoed;
  const leftOut = notVetoed && suiting && pickable === suiting ? notVetoed.length - suiting.length : 0;
  const dietNote =
    leftOut > 0
      ? ' ' +
        (leftOut === 1
          ? t("{n} food is left off so it suits everyone's diet and budget.", { n: leftOut })
          : t("{n} foods are left off so it suits everyone's diet and budget.", { n: leftOut }))
      : notVetoed && suiting && suiting.length < notVetoed.length
        ? ' ' + t('Too few foods suit everyone’s diet and budget, so all of them are on.')
        : '';
  const decidedFood = entry?.status === 'accepted' ? entryFood(entry, new Map((foods ?? []).map((f) => [f.id, f]))) : null;

  let wheelSend: WheelSend;
  if (room.decision_mode === 'secret' && !decidedFood) wheelSend = { kind: 'note', text: t('Secret picks are on today. Make your pick on Today.') };
  else if (decidedFood) wheelSend = { kind: 'note', text: t("Today's already decided: {food}. Spin for fun.", { food: decidedFood.name }) };
  else if (!decider) wheelSend = { kind: 'note', text: t('No turns today: it’s a day off. To eat together anyway, tap “Eating together anyway?” on Today. Spin for fun.') };
  else if (!isDecider) wheelSend = { kind: 'note', text: t("It's {name}'s turn, so only they can send today's pick.", { name: decider.name }) };
  // While a swipe or a vote is on, the pick comes out of that.
  else if (entry?.swipe_options || entry?.vote_options) wheelSend = { kind: 'note', text: t('A swipe or a vote is on, so today’s pick comes from that. Spin for fun.') };
  else if (!sendTo) wheelSend = { kind: 'send', label: t('Lock it in') };
  else wheelSend = { kind: 'send', label: entry?.status === 'proposed' ? t('Send instead') : t('Send to {name}', { name: sendTo }) };

  const sendFromWheel = async (food: Food) => {
    try {
      const inPool = !food.id.startsWith('custom');
      await days.propose(inPool ? { foodId: food.id, name: food.name } : { foodId: null, name: food.name }, 'wheel');
      onToast(sendTo ? t('Sent {food} to {name}.', { food: food.name, name: sendTo }) : t('{food} it is.', { food: food.name }));
      go('today');
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Could not send that.'));
    }
  };

  const loading = (
    <main className="screen" style={{ justifyContent: 'center', alignItems: 'center', color: 'var(--muted)', textAlign: 'center' }}>
      {foodsApi.error ? t("Couldn't load the food list. {error}", { error: foodsApi.error }) : t('Loading {room}…', { room: roomTitle(room) })}
    </main>
  );

  useEffect(preloadScreens, []);
  // For the main menu's "New" badge: this room has been looked at, now and on the way out.
  useEffect(() => {
    markSeen(room.id);
    return () => markSeen(room.id);
  }, [room.id]);
  const connection = useConnection();

  return (
    <div className="app">
      {connection.offline && (
        <div role="status" style={{ position: 'sticky', top: 0, zIndex: 20, padding: '8px 16px', background: 'var(--ink)', color: 'var(--on-ink)', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
          {connection.pending
            ? t("You're offline · {n} waiting to send. Changes from others will appear when you're back.", { n: connection.pending })
            : t("You're offline. Changes from others will appear when you're back.")}
        </div>
      )}
      <div className="tab-stage" {...swipe.handlers}>
      {/* The finger moves this layer; the keyed one inside slides in when the tab changes. */}
      <div
        className="tab-pane"
        style={{
          transform: swipe.dragX ? `translateX(${swipe.dragX}px)` : undefined,
          opacity: swipe.dragX ? 1 - Math.min(0.45, Math.abs(swipe.dragFraction) * 0.6) : undefined,
          transition: swipe.settling ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s' : 'none',
        }}
      >
      <div key={route} className={`tab-pane${enterFrom ? ` tab-in-${enterFrom}` : ''}`}>
      <Suspense fallback={loading}>
      {route === 'today' &&
        (foods && notVetoed ? (
          <TodayScreen
            room={room}
            me={me}
            members={members}
            today={today}
            foods={foods}
            pickable={notVetoed}
            days={days}
            online={online}
            onAddFood={foodsApi.addFood}
            onOpenSettings={() => go('settings')}
            onOpenChat={() => go('chat')}
            unreadChat={chat.unread}
            onSpin={() => go('wheel')}
            onSeeAll={() => go('history')}
            onHome={onHome}
            extras={extras}
            attendance={attendance}
            away={away}
            meal={meal}
            deals={deals}
          onEatAnyway={offDay ? () => setAnywayOn(`${today}:${meal}`) : undefined}
          onMealChange={room.meals === 'both' ? setMeal : undefined}
            onToast={onToast}
          />
        ) : (
          loading
        ))}
      {route === 'chat' && <ChatScreen room={room} me={me} members={everyone} today={today} chat={chat} onBack={() => go('today')} onToast={onToast} />}
      {route === 'settings' && (
        <SettingsScreen
          room={room}
          me={me}
          members={members}
          updateRoom={updateRoom}
          updateMember={updateMember}
          moveMember={moveMember}
          removeMember={removeMember}
          onBack={() => go('today')}
          deleteRoom={async () => {
            await extras.clearReceipts().catch(() => {});
            await deleteRoom();
            onToast(t('{room} deleted.', { room: roomTitle(room) }));
            // The room's gone for everyone, so just forget it here.
            forgetSession(room.id);
            onLeave();
          }}
          onLeave={() => leaveRoom(room.id).then(onLeave, (e: unknown) => onToast(e instanceof Error ? e.message : String(e)))}
          onToast={onToast}
          onOpenProfile={onProfile}
          foodNames={(active ?? []).map((f) => f.name)}
        />
      )}
      {route === 'wheel' &&
        (pickable ? (
          <WheelScreen
            pool={pickable}
            vetoedNames={vetoedNames}
            extraNote={dietNote + (wet ? ' ' + t('🌧 Rainy, so foods you can get under cover come up more.') : '')}
            boost={wheelBoost}
            // Only the decider's spin, before anything's decided, shows on everyone's phone.
            onSpin={wheelSend.kind === 'send' ? liveSpin.send : undefined}
            timezone={room.timezone}
            turnLabel={!decider ? t('Day off') : isDecider ? t('Your turn') : t("{name}'s turn", { name: decider.name })}
            send={wheelSend}
            onBack={() => go('today')}
            onSend={sendFromWheel}
          />
        ) : (
          loading
        ))}
      {route === 'pool' && (foods ? <PoolScreen foods={foods} api={foodsApi} onError={onToast} onToast={onToast} roomId={room.id} roomName={roomTitle(room)} /> : loading)}
      {route === 'bills' &&
        (foods && days.entries ? (
          <BillsScreen
            attendance={attendance}
            room={room}
            me={me}
            members={everyone}
            entries={days.entries}
            foods={foods}
            extras={extras}
            updateMember={updateMember}
            onToast={onToast}
          />
        ) : (
          loading
        ))}
      {route === 'history' &&
        (foods && days.entries ? (
          <HistoryScreen
            room={room}
            me={me}
            members={everyone}
            today={today}
            entries={days.entries}
            vetoes={days.vetoes}
            foods={foods}
            onToast={onToast}
            extras={extras}
          />
        ) : (
          loading
        ))}

      </Suspense>
      </div>
      </div>
      </div>
      <TabBar active={tab} onChange={go} dragFraction={swipe.dragFraction} />
      {liveSpin.incoming && (
        <LiveSpinOverlay spin={liveSpin.incoming} byName={everyone.find((m) => m.id === liveSpin.incoming!.by)?.name ?? t('Someone')} onClose={liveSpin.dismiss} />
      )}
    </div>
  );
}
