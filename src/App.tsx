import { useEffect, useState } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { shortDate } from './lib/dates';
import { STARTER_FOODS, type Food } from './lib/foods';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { WheelScreen } from './screens/WheelScreen';

const TABS: Tab[] = ['today', 'wheel', 'pool', 'history'];

function tabFromHash(): Tab {
  const h = window.location.hash.replace('#', '') as Tab;
  return TABS.includes(h) ? h : 'wheel';
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [toast, setToast] = useState<string | null>(null);

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

  return (
    <div className="app">
      {tab === 'today' && (
        <PlaceholderScreen eyebrow={shortDate(new Date())} title="Makan apa?" phase="Phase 4">
          <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>
            The decider card, “Up next” rotation and recent meals.
          </p>
          <button type="button" className="btn btn--primary press" onClick={() => go('wheel')}>
            Spin the wheel
          </button>
        </PlaceholderScreen>
      )}
      {tab === 'wheel' && <WheelScreen pool={STARTER_FOODS} otherMemberName="Alex" onBack={() => go('today')} onSend={send} />}
      {tab === 'pool' && (
        <PlaceholderScreen eyebrow={`${STARTER_FOODS.length} options`} title="Food list" phase="Phase 2">
          <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>Add, edit and archive foods, saved to Supabase.</p>
        </PlaceholderScreen>
      )}
      {tab === 'history' && (
        <PlaceholderScreen eyebrow="This month" title="History" phase="Phase 5">
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
            zIndex: 10,
          }}
        >
          {toast}
        </div>
      )}

      <TabBar active={tab} onChange={go} />
    </div>
  );
}
