import { useEffect, useRef, useState } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { disableReminders } from './lib/push';
import { closeCurrentRoom, forgetSession, knownRooms, leaveRoom, restoreSession, roomTitle, selectRoom, type Session } from './lib/session';
import { suitsEveryone } from './lib/diet';
import { entryFood, type Food } from './lib/foods';
import { deciderFor } from './lib/rotation';
import { useDays } from './lib/useDays';
import { usePresence } from './lib/usePresence';
import { useToday } from './lib/useToday';
import { useFoods } from './lib/useFoods';
import { useRoomData } from './lib/useRoomData';
import { useRoomExtras } from './lib/useRoomExtras';
import { HistoryScreen } from './screens/HistoryScreen';
import { JoinScreen } from './screens/JoinScreen';
import { PoolScreen } from './screens/PoolScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { WheelScreen, type WheelSend } from './screens/WheelScreen';

type Route = Tab | 'settings';
const ROUTES: Route[] = ['today', 'wheel', 'pool', 'history', 'settings'];

function routeFromHash(): Route {
  const h = window.location.hash.replace('#', '') as Route;
  return ROUTES.includes(h) ? h : 'today';
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'join'; notice?: string } | { status: 'ready'; session: Session };

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
      (session) => gen === generation.current && setState(session ? { status: 'ready', session } : { status: 'join' }),
      (e: unknown) => gen === generation.current && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
  };
  useEffect(restore, []);

  // Coming back online after an offline start: try again without a tap.
  const status = useRef(state.status);
  status.current = state.status;
  useEffect(() => {
    const onOnline = () => status.current === 'error' && restore();
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
    body = <Splash>Loading…</Splash>;
  } else if (state.status === 'error') {
    body = (
      <Splash>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          {state.message === 'offline'
            ? 'You’re offline. Makan apa? needs a connection to sync with your room, and will reconnect when you’re back.'
            : `Couldn't reach the server. ${state.message}`}
        </p>
        <button type="button" className="btn btn--primary press" onClick={restore}>
          Try again
        </button>
      </Splash>
    );
  } else if (state.status === 'join') {
    body = (
      <JoinScreen
        notice={state.notice}
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
          void disableReminders().catch(() => {});
          forgetSession();
          // Open another room on this phone if there is one.
          if (knownRooms().length) restore();
          else setState({ status: 'join' });
        }}
        onSwitchRoom={(roomId) => {
          if (selectRoom(roomId)) restore();
        }}
        onAddRoom={() => {
          generation.current++;
          closeCurrentRoom();
          setState({ status: 'join' });
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
        Makan <span style={{ color: 'var(--accent)' }}>apa?</span>
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
  onSwitchRoom: (roomId: string) => void;
  onAddRoom: () => void;
}

function RoomApp({ session, onToast, onLeave, onSwitchRoom, onAddRoom }: RoomAppProps) {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const { room, members, updateRoom, updateMember, moveMember, removeMember, deleteRoom } = useRoomData(session.room, session.members, session.me.id);
  const me = members.find((m) => m.id === session.me.id) ?? session.me;
  const removed = !members.some((m) => m.id === session.me.id);

  // Someone removed this phone's member from the room.
  useEffect(() => {
    if (removed) {
      onToast(`You’re no longer in room ${room.code}.`);
      onLeave();
    }
  }, [removed]);
  const today = useToday(room.timezone);
  const days = useDays(room, members, me.id, today);
  const extras = useRoomExtras(room.id, me.id);
  const foodsApi = useFoods(room, me.id, days.entries, today, extras.ratings);
  const online = usePresence(room.id, me.id);
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

  // Today's decider and what the wheel may do about it.
  const memberById = new Map(members.map((m) => [m.id, m]));
  const entry = days.todayEntry;
  const decider = (entry && memberById.get(entry.decider_id ?? '')) || deciderFor(members, room.rotation_start, today);
  const isDecider = decider?.id === me.id;
  const others = members.filter((m) => m.id !== decider?.id);
  const sendTo = others.length === 1 ? others[0].name : others.length === 0 ? null : 'everyone';
  const vetoedNames = days.todayVetoes.map((v) => v.rejected_food);
  const vetoed = new Set(vetoedNames.map((n) => n.toLowerCase()));
  const notVetoed = active?.filter((f) => !vetoed.has(f.name.toLowerCase())) ?? null;
  // Keep foods that clash with someone's diet or budget off, unless that leaves too few to spin.
  const suiting = notVetoed?.filter((f) => suitsEveryone(f, members)) ?? null;
  const pickable = suiting && suiting.length >= 2 ? suiting : notVetoed;
  const leftOut = notVetoed && suiting && pickable === suiting ? notVetoed.length - suiting.length : 0;
  const dietNote =
    leftOut > 0
      ? ` ${leftOut} ${leftOut === 1 ? 'food is' : 'foods are'} left off so it suits everyone's diet and budget.`
      : notVetoed && suiting && suiting.length < notVetoed.length
        ? ' Too few foods suit everyone’s diet and budget, so all of them are on.'
        : '';
  const decidedFood = entry?.status === 'accepted' ? entryFood(entry, new Map((foods ?? []).map((f) => [f.id, f]))) : null;

  let wheelSend: WheelSend;
  if (room.decision_mode === 'secret' && !decidedFood) wheelSend = { kind: 'note', text: 'Secret picks are on today. Make your pick on Today.' };
  else if (decidedFood) wheelSend = { kind: 'note', text: `Today's already decided: ${decidedFood.name}. Spin for fun.` };
  else if (!isDecider) wheelSend = { kind: 'note', text: `It's ${decider?.name ?? 'someone else'}'s turn, so only they can send today's pick.` };
  else if (!sendTo) wheelSend = { kind: 'send', label: 'Lock it in' };
  else wheelSend = { kind: 'send', label: entry?.status === 'proposed' ? `Send instead` : `Send to ${sendTo}` };

  const sendFromWheel = async (food: Food) => {
    try {
      const inPool = !food.id.startsWith('custom');
      await days.propose(inPool ? { foodId: food.id, name: food.name } : { foodId: null, name: food.name }, 'wheel');
      onToast(sendTo ? `Sent ${food.name} to ${sendTo}.` : `${food.name} it is.`);
      go('today');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not send that.');
    }
  };

  const loading = (
    <main className="screen" style={{ justifyContent: 'center', alignItems: 'center', color: 'var(--muted)', textAlign: 'center' }}>
      {foodsApi.error ? `Couldn't load the food list. ${foodsApi.error}` : 'Loading food list…'}
    </main>
  );

  return (
    <div className="app">
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
            onSpin={() => go('wheel')}
            onSeeAll={() => go('history')}
            onSwitchRoom={onSwitchRoom}
            onAddRoom={onAddRoom}
            extras={extras}
            onToast={onToast}
          />
        ) : (
          loading
        ))}
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
            await deleteRoom();
            onToast(`${roomTitle(room)} deleted.`);
            void leaveRoom(room.id).catch(() => {});
            onLeave();
          }}
          onLeave={() => {
            void leaveRoom(room.id).catch(() => {});
            onLeave();
          }}
          onToast={onToast}
        />
      )}
      {route === 'wheel' &&
        (pickable ? (
          <WheelScreen
            pool={pickable}
            vetoedNames={vetoedNames}
            extraNote={dietNote}
            timezone={room.timezone}
            turnLabel={isDecider ? 'Your turn' : `${decider?.name ?? 'Someone'}'s turn`}
            send={wheelSend}
            onBack={() => go('today')}
            onSend={sendFromWheel}
          />
        ) : (
          loading
        ))}
      {route === 'pool' && (foods ? <PoolScreen foods={foods} api={foodsApi} onError={onToast} /> : loading)}
      {route === 'history' &&
        (foods && days.entries ? (
          <HistoryScreen
            room={room}
            me={me}
            members={members}
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

      <TabBar active={route === 'settings' ? 'today' : route} onChange={go} />
    </div>
  );
}
