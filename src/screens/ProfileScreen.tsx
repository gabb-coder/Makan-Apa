import { useEffect, useState } from 'react';
import { PayDetailsCard } from '../components/Bills';
import { PhoneSettings } from '../components/PhoneSettings';
import { BUDGETS, MEMBER_NEEDS } from '../lib/diet';
import { t } from '../lib/i18n';
import { myMembers, updateEverywhere, type ProfilePatch } from '../lib/profile';
import type { MemberRow } from '../lib/supabase';

const cardStyle = { padding: 16, display: 'flex', flexDirection: 'column', gap: 14 } as const;

/**
 * You & this phone, from the main menu: what follows you into every room (food needs, budget,
 * DuitNow) and what belongs to this phone (language, look, notifications).
 */
export function ProfileScreen({ onBack, onToast }: { onBack: () => void; onToast: (message: string) => void }) {
  const [mine, setMine] = useState<MemberRow[] | null>(null);
  const me = mine?.[0] ?? null;
  useEffect(() => {
    myMembers().then(setMine, (e: unknown) => onToast(e instanceof Error ? e.message : String(e)));
  }, []);

  const save = async (patch: ProfilePatch, ok?: string) => {
    // Show it straight away; put it back if the save fails.
    const before = mine;
    setMine((cur) => cur?.map((m) => ({ ...m, ...patch })) ?? cur);
    try {
      await updateEverywhere(patch);
      if (ok) onToast(ok);
    } catch (e) {
      setMine(before);
      onToast(e instanceof Error ? e.message : t('Could not save that change.'));
    }
  };

  return (
    <div className="app">
      <main className="screen" style={{ gap: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="icon-btn press" aria-label={t('Your rooms')} onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="title title--sm">{t('You & this phone')}</h1>
        </header>

        <section className="card fade-up" style={cardStyle} aria-busy={!me}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="section-label">{t('Your food needs')}</span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              {t("For every room you're in. Foods that clash with anyone in a room stay off its wheel, and nearby ideas skip places that don't fit.")}
            </span>
          </div>
          <div className="chip-row" role="group" aria-label={t('Diet')} style={{ flexWrap: 'wrap' }}>
            {MEMBER_NEEDS.map((n) => {
              const myDiet = me?.diet ?? [];
              const on = myDiet.includes(n.key);
              return (
                <button
                  key={n.key}
                  type="button"
                  className="chip press"
                  aria-pressed={on}
                  disabled={!me}
                  onClick={() => save({ diet: on ? myDiet.filter((d) => d !== n.key) : [...myDiet, n.key] })}
                >
                  {t(n.label)}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span id="budget-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('Budget per meal')}</span>
            <div className="segmented" role="group" aria-labelledby="budget-label" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {BUDGETS.map((b) => (
                <button key={b.label} type="button" aria-pressed={(me?.budget ?? null) === b.value} disabled={!me} onClick={() => me && me.budget !== b.value && save({ budget: b.value })}>
                  {t(b.label)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="section-label">{t('How kaki can pay you')}</span>
          {!me && (
            <div className="card" style={{ padding: 16, fontSize: 14, color: 'var(--muted)' }}>
              {mine === null ? t('Loading…') : t('Join or create a room first.')}
            </div>
          )}
          {me && (
            <PayDetailsCard
              key={`${me.pay_duitnow}|${me.pay_bank}`}
              me={me}
              onSave={(patch) => save(patch, t('Payment details saved in all your rooms.'))}
            />
          )}
        </section>

        <PhoneSettings onToast={onToast} />
      </main>
    </div>
  );
}
