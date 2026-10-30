export type Tab = 'today' | 'wheel' | 'pool' | 'history';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'today',
    label: 'Today',
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </>
    ),
  },
  {
    id: 'wheel',
    label: 'Wheel',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8" />
      </>
    ),
  },
  {
    id: 'pool',
    label: 'Food list',
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
    id: 'history',
    label: 'History',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
];

export function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav aria-label="Main" className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-current={active === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {t.icon}
          </svg>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
