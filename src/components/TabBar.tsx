import { t, tk } from '../lib/i18n';
export type Tab = 'today' | 'wheel' | 'pool' | 'bills' | 'history';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'today',
    label: tk('Today'),
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </>
    ),
  },
  {
    id: 'wheel',
    label: tk('Wheel'),
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8" />
      </>
    ),
  },
  {
    id: 'pool',
    label: tk('Food list'),
    icon: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </>
    ),
  },
  {
    id: 'bills',
    label: tk('Bills'),
    icon: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
  },
  {
    id: 'history',
    label: tk('History'),
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
];

export const TAB_ORDER: Tab[] = TABS.map((tab) => tab.id);

/**
 * The bottom bar. A pill slides behind the active tab's icon (following the finger while the
 * screen is swiped), and the icon gives a little hop when it's picked.
 */
export function TabBar({ active, onChange, dragFraction = 0 }: { active: Tab; onChange: (tab: Tab) => void; dragFraction?: number }) {
  const index = Math.max(0, TAB_ORDER.indexOf(active));
  const position = Math.min(TABS.length - 1, Math.max(0, index + dragFraction));
  const dragging = dragFraction !== 0;
  return (
    <nav aria-label={t('Main')} className="tabbar">
      <span aria-hidden="true" className="tabbar-track">
        <span
          className="tabbar-pill"
          style={{
            transform: `translateX(${position * 100}%)`,
            transition: dragging ? 'none' : undefined,
          }}
        >
          <span />
        </span>
      </span>
      {TABS.map((tab) => {
        const on = active === tab.id;
        return (
          <button key={tab.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => onChange(tab.id)}>
            <span className="tabbar-icon">
              <svg
                key={on ? 'on' : 'off'}
                className={on ? 'tabbar-hop' : undefined}
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={on ? 2.1 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {tab.icon}
              </svg>
            </span>
            {t(tab.label)}
          </button>
        );
      })}
    </nav>
  );
}
