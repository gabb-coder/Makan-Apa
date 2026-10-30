import { useEffect, useRef, useState } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { forgetSession, restoreSession, type Session } from './lib/session';
import type { Food } from './lib/foods';
import { useFoods } from './lib/useFoods';
import { useRoomData } from './lib/useRoomData';
import { JoinScreen } from './screens/JoinScreen';
import { PoolScreen } from './screens/PoolScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { WheelScreen } from './screens/WheelScreen';

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
    setState({ status: 'loading' });
    restoreSession().then(
      (session) => gen === generation.current && setState(session ? { status: 'ready', session } : { status: 'join' }),
      (e: unknown) => gen === generation.current && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
  };
  useEffect(restore, []);

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
        <p style={{ margin: 0, lineHeight: 1.5 }}>Couldn't reach the server. {state.message}</p>
        <button type="button" className="btn btn--primary press" onClick={restore}>
          Try again
        </button>
      </Splash>
    );
  } else if (state.status === 'join') {
    body = (
      <JoinScreen
        notice={state.notice}
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
          forgetSession();
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
        color: '#fff',
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

function RoomApp({ session, onToast, onLeave }: { session: Session; onToast: (m: string) => void; onLeave: () => void }) {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const { room, members, updateRoom, updateMember, moveMember } = useRoomData(session.room, session.members);
  const me = members.find((m) => m.id === session.me.id) ?? session.me;
  const foodsApi = useFoods(room, me.id);
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

  const others = members.filter((m) => m.id !== me.id);
  const sendTo = others.length === 1 ? others[0].name : others.length === 0 ? 'your kaki' : 'everyone';
  const send = (food: Food) => onToast(`${food.name} is ready to send. Proposals arrive in Phase 4.`);

  const loading = (
    <main className="screen" style={{ justifyContent: 'center', alignItems: 'center', color: 'var(--muted)', textAlign: 'center' }}>
      {foodsApi.error ? `Couldn't load the food list. ${foodsApi.error}` : 'Loading food list…'}
    </main>
  );

  return (
    <div className="app">
      {route === 'today' && (
        <TodayScreen room={room} me={me} members={members} onOpenSettings={() => go('settings')} onSpin={() => go('wheel')} />
      )}
      {route === 'settings' && (
        <SettingsScreen
          room={room}
          me={me}
          members={members}
          updateRoom={updateRoom}
          updateMember={updateMember}
          moveMember={moveMember}
          onBack={() => go('today')}
          onLeave={onLeave}
          onToast={onToast}
        />
      )}
      {route === 'wheel' &&
        (active ? <WheelScreen pool={active} timezone={room.timezone} otherMemberName={sendTo} onBack={() => go('today')} onSend={send} /> : loading)}
      {route === 'pool' && (foods ? <PoolScreen foods={foods} api={foodsApi} onError={onToast} /> : loading)}
      {route === 'history' && (
        <main className="screen" style={{ gap: 18 }}>
          <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">Room {room.code}</span>
            <h1 className="title">History</h1>
          </header>
          <section className="card fade-up" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="section-label">Coming in Phase 5</span>
            <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>Meals, streaks, vetoes and who decided.</p>
          </section>
        </main>
      )}

      <TabBar active={route === 'settings' ? 'today' : route} onChange={go} />
    </div>
  );
}
