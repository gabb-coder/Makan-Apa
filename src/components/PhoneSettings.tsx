import { useEffect, useState } from 'react';
import { isIOS, isStandalone, useInstallPrompt } from '../lib/install';
import { getLang, LANGS, locale, setLang, t, tk, tNodes, useLang } from '../lib/i18n';
import { turnOffLocation, turnOnLocation, useLocation } from '../lib/location';
import { NEARBY_LABEL } from '../lib/nearby';
import { nearbyPref, soundPref, themePref, usePref, type ThemePref } from '../lib/prefs';
import { disableReminders, enableReminders, phoneNotifications, pushSupport, setPushPrefs, setReminderHour, setWeeklyRecap } from '../lib/push';
import { knownRooms } from '../lib/session';

const cardStyle = { padding: 16, display: 'flex', flexDirection: 'column', gap: 14 } as const;
const REMINDER_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am to 10pm

function hourLabel(h: number): string {
  // English keeps "11:00 am"; Malay and Chinese use their own clock style.
  if (getLang() !== 'en') return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, h));
  const suffix = h < 12 ? 'am' : 'pm';
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${suffix}`;
}

/** Everything that belongs to this phone rather than a room: language, look, sounds, location, notifications. */
export function PhoneSettings({ onToast }: { onToast: (message: string) => void }) {
  const theme = usePref(themePref);
  const lang = useLang();
  const sound = usePref(soundPref);
  const nearby = usePref(nearbyPref);
  const location = useLocation();
  const install = useInstallPrompt();
  const installed = isStandalone();
  return (
        <section className="card fade-up" style={cardStyle}>
          <span className="section-label">{t('This phone')}</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span id="language-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('Language')}</span>
            <div className="segmented" role="group" aria-labelledby="language-label" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {LANGS.map((l) => (
                <button key={l.key} type="button" lang={l.key === 'zh' ? 'zh-Hans' : l.key} aria-pressed={lang === l.key} onClick={() => {
                  setLang(l.key);
                  void setPushPrefs(null, l.key).catch(() => {});
                }} style={{ fontSize: 13 }}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span id="appearance-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('Appearance')}</span>
            <div className="segmented" role="group" aria-labelledby="appearance-label" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {(
                [
                  ['system', tk('System')],
                  ['light', tk('Light')],
                  ['dark', tk('Dark')],
                ] as [ThemePref, string][]
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={theme === value} onClick={() => themePref.set(value)}>
                  {t(label)}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Wheel sounds')}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('A tick per slice and a chime on landing')}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={sound === 'on'}
              onChange={(e) => soundPref.set(e.target.checked ? 'on' : 'off')}
              className="switch"
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Food ideas near {place}', { place: NEARBY_LABEL })}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Places around Bandar Sunway on Today and with each result')}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={nearby === 'on'}
              onChange={(e) => nearbyPref.set(e.target.checked ? 'on' : 'off')}
            />
          </label>

          {nearby === 'on' && (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Use my location')}</span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                  {location.status === 'denied'
                    ? t('Blocked by your browser. Allow location for this site in your phone settings, then turn this on.')
                    : location.status === 'unavailable'
                      ? t("Couldn't get your location. Turn it off and on to try again.")
                      : t('Show the closest places first, and search near you when you’re away from Sunway. Stays on this phone; never shared with the room.')}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={location.status !== 'off' && location.status !== 'denied'}
                onChange={(e) => (e.target.checked ? void turnOnLocation() : turnOffLocation())}
              />
            </label>
          )}

          <PhoneNotifications onToast={onToast} />

          {!installed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--divider)' }}>
              <span style={{ fontSize: 15, fontWeight: 700, paddingTop: 10 }}>{t('Add to Home Screen')}</span>
              {install.available ? (
                <>
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{t('Open Makan apa? like an app, full screen.')}</span>
                  <button
                    type="button"
                    className="btn btn--primary press"
                    onClick={async () => {
                      if (await install.prompt()) onToast(t('Added. Look for Makan apa? on your home screen.'));
                    }}
                  >
                    {t('Install app')}
                  </button>
                </>
              ) : isIOS() ? (
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                  {tNodes('In Safari, tap {icon} Share, then {add}.', {
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={t('Share')} style={{ verticalAlign: '-2px' }}>
                        <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" />
                        <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
                      </svg>
                    ),
                    add: <strong style={{ color: 'var(--ink)' }}>{t('Add to Home Screen')}</strong>,
                  })}
                </span>
              ) : (
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                  {tNodes('Open your browser menu and choose {install} or {add}.', {
                    install: <strong style={{ color: 'var(--ink)' }}>{t('Install app')}</strong>,
                    add: <strong style={{ color: 'var(--ink)' }}>{t('Add to Home screen')}</strong>,
                  })}
                </span>
              )}
            </div>
          )}
        </section>
  );
}

/**
 * Notifications for every room on this phone: one switch, one reminder time, the weekly recap
 * and alerts. A single room can be muted from its ⋯ on the main menu.
 */
function PhoneNotifications({ onToast }: { onToast: (m: string) => void }) {
  const support = pushSupport();
  const [status, setStatus] = useState<{ hour: number; recap: boolean; events: boolean; rooms: number } | null | 'loading'>('loading');
  const [hour, setHour] = useState(11);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    phoneNotifications().then(
      (s) => {
        if (!live) return;
        setStatus(s);
        if (s) setHour(s.hour);
      },
      () => live && setStatus(null),
    );
    return () => {
      live = false;
    };
  }, []);

  const on = status !== 'loading' && status !== null;
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Could not change reminders.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: boolean) =>
    run(
      async () => {
        if (next) {
          const first = knownRooms()[0];
          if (!first) throw new Error(t('Join or create a room first.'));
          await enableReminders(first.memberId, hour);
          setStatus(await phoneNotifications());
        } else {
          await disableReminders();
          setStatus(null);
        }
      },
      next ? t("Notifications on for all your rooms. Reminders come at {time}.", { time: hourLabel(hour) }) : t('Notifications off on this phone.'),
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: support === 'ok' ? 'pointer' : 'default' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Notifications')}</span>
          <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>
            {support === 'ok'
              ? t('For every room on this phone: a reminder when it’s your turn, plus alerts when things happen. Mute a single room from its ⋯ on the main menu.')
              : support === 'needs-install'
                ? t('On iPhone, add Makan apa? to your Home Screen first (below), then turn this on from there.')
                : t('This browser can’t show notifications.')}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={on}
          disabled={support !== 'ok' || busy || status === 'loading'}
          onChange={(e) => toggle(e.target.checked)}
        />
      </label>
      {on && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <label htmlFor="reminder-hour" style={{ fontSize: 14, fontWeight: 600 }}>
            {t('Remind me at')}
          </label>
          <select
            id="reminder-hour"
            className="input"
            value={hour}
            disabled={busy}
            onChange={(e) => {
              const h = Number(e.target.value);
              setHour(h);
              run(async () => {
                await setReminderHour(h);
                setStatus((s) => (s && s !== 'loading' ? { ...s, hour: h } : s));
              }, t('Reminder moved to {time}.', { time: hourLabel(h) }));
            }}
            style={{ width: 'auto', height: 44 }}
          >
            {REMINDER_HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      )}
      {on && typeof status === 'object' && status && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Alerts when things happen')}</span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>
                {t('A pick to answer, the meal decided, a bill with your share, a tapau run, and a nudge every few days if you owe someone.')}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={status.events}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.checked;
                run(async () => {
                  await setPushPrefs(next);
                  setStatus({ ...status, events: next });
                }, next ? t('Alerts on.') : t('Alerts off.'));
              }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Weekly recap')}</span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>{t("Sunday at 8pm: the week's meals, favourite, vetoes and who paid most.")}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={status.recap}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.checked;
                run(async () => {
                  await setWeeklyRecap(next);
                  setStatus({ ...status, recap: next });
                }, next ? t('Weekly recap on.') : t('Weekly recap off.'));
              }}
            />
          </label>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('Times are in each room’s timezone.')}</span>
        </>
      )}
    </div>
  );
}
