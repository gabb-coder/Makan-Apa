import { useState } from 'react';
import { joinNames } from '../lib/foods';
import { t } from '../lib/i18n';
import type { Attendance, Meal, MemberRow } from '../lib/supabase';
import { Avatar } from './Avatar';

const CHOICES: { key: Attendance; label: () => string }[] = [
  { key: 'in', label: () => t("I'm in") },
  { key: 'late', label: () => t('Late') },
  { key: 'out', label: () => t("I'm out") },
];

/**
 * "Who's in for lunch?": your answer, and everyone else's. Nobody has to answer; no answer
 * counts as in.
 */
export function WhosInCard({
  me,
  members,
  meal,
  statusOf,
  onSet,
}: {
  me: MemberRow;
  members: MemberRow[];
  meal: Meal;
  statusOf: (memberId: string) => Attendance;
  onSet: (status: Attendance) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const mine = statusOf(me.id);
  const others = members.filter((m) => m.id !== me.id);
  const out = others.filter((m) => statusOf(m.id) === 'out');
  const late = others.filter((m) => statusOf(m.id) === 'late');
  const inCount = members.filter((m) => statusOf(m.id) !== 'out').length;

  const summary = [
    out.length ? (out.length === 1 ? t('{names} is out', { names: out[0].name }) : t('{names} are out', { names: joinNames(out.map((m) => m.name)) })) : null,
    late.length
      ? late.length === 1
        ? t('{names} is coming late', { names: late[0].name })
        : t('{names} are coming late', { names: joinNames(late.map((m) => m.name)) })
      : null,
  ].filter(Boolean);

  return (
    <section className="card fade-up" aria-labelledby="whos-in" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 id="whos-in" className="section-label" style={{ margin: 0 }}>
          {meal === 'dinner' ? t("Who's in for dinner?") : t("Who's in for lunch?")}
        </h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{t('{n} of {total} in', { n: inCount, total: members.length })}</span>
      </div>
      <div className="segmented" role="group" aria-label={t('Are you joining?')} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={mine === c.key}
            disabled={busy}
            onClick={async () => {
              if (mine === c.key) return;
              setBusy(true);
              try {
                await onSet(c.key);
              } finally {
                setBusy(false);
              }
            }}
          >
            {c.label()}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden="true" style={{ display: 'flex' }}>
          {members.slice(0, 6).map((m, i) => (
            <span key={m.id} style={{ marginLeft: i ? -6 : 0, opacity: statusOf(m.id) === 'out' ? 0.35 : 1 }}>
              <Avatar name={m.name} color={m.color} size={26} style={{ boxShadow: '0 0 0 2px var(--surface)' }} />
            </span>
          ))}
        </span>
        <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4 }}>
          {summary.length ? summary.join(' · ') : t("Everyone's in so far.")}
          {mine === 'out' && ` ${t("You won't be the decider or on the bill.")}`}
        </span>
      </div>
    </section>
  );
}
