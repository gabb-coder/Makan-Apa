import { useEffect, useState } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { shortDate } from './lib/dates';
import type { Food } from './lib/foods';
import { useFoods } from './lib/useFoods';
import { useRoom } from './lib/useRoom';
import type { RoomRow } from './lib/supabase';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { PoolScreen } from './screens/PoolScreen';
import { WheelScreen } from './screens/WheelScreen';

const TABS: Tab[] = ['today', 'wheel', 'pool', 'history'];

function tabFromHash(): Tab {
  const h = window.location.hash.replace('#', '') as Tab;
  return TABS.includes(h) ? h : 'pool';
}

export default function App() {
  const { room, error, retry } = useRoom();

  if (error) {
    return (
      <Splash>
        <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>Couldn't reach the server. {error}</p>
        <button type="button" className="btn btn--primary press" onClick={retry}>
          Try again
        </button>
      </Splash>
    );
  }
  if (!room) return <Splash>Loading…</Splash>;
  return <RoomApp room={room} />;
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

function RoomApp({ room }: { room: RoomRow }) {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [toast, setToast] = useState<string | null>(null);
  const foodsApi = useFoods(room);
  const { foods, active } = foodsApi;

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const go = (next: Tab) => {
    window.location.hash = next;
    setTab(next);
  };

  const send = (food: Food) => setToast(`${food.name} is ready to send. Proposals arrive in Phase 4.`);

  const loading = (
    <main className="screen" style={{ justifyContent: 'center', alignItems: 'center', color: 'var(--muted)', textAlign: 'center' }}>
      {foodsApi.error ? `Couldn't load the food list. ${foodsApi.error}` : 'Loading food list…'}
    </main>
  );

  return (
    <div className="app">
      {tab === 'today' && (
        <PlaceholderScreen eyebrow={`${shortDate(new Date(), room.timezone)} · Room ${room.code}`} title="Makan apa?" phase="Phase 4">
          <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>
            The decider card, “Up next” rotation and recent meals.
          </p>
          <button type="button" className="btn btn--primary press" onClick={() => go('wheel')}>
            Spin the wheel
          </button>
        </PlaceholderScreen>
      )}
      {tab === 'wheel' &&
        (active ? <WheelScreen pool={active} otherMemberName="Alex" onBack={() => go('today')} onSend={send} /> : loading)}
      {tab === 'pool' &&
        (foods ? <PoolScreen foods={foods} api={foodsApi} onError={setToast} /> : loading)}
      {tab === 'history' && (
        <PlaceholderScreen eyebrow={`Room ${room.code}`} title="History" phase="Phase 5">
          <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>Meals, streaks, vetoes and who decided.</p>
        </PlaceholderScreen>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 'calc(var(--tabbar-h) + 16px)',
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
          {toast}
        </div>
      )}

      <TabBar active={tab} onChange={go} />
    </div>
  );
}
