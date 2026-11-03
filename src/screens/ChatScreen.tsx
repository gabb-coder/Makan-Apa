import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { locale, t } from '../lib/i18n';
import { roomTitle } from '../lib/session';
import type { Chat } from '../lib/useChat';
import type { MemberRow, MessageRow, RoomRow } from '../lib/supabase';

interface Props {
  room: RoomRow;
  me: MemberRow;
  /** Everyone who's ever been in the room, so old messages keep their names. */
  members: MemberRow[];
  today: string;
  chat: Chat;
  onBack: () => void;
  onToast: (message: string) => void;
}

/** "2026-11-04" for when the message was sent, in the room's timezone. */
function sentDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(iso));
}

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The room's group chat: who's late, "can we do Thai instead?", without leaving the app. */
export function ChatScreen({ room, me, members, today, chat, onBack, onToast }: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const messages = chat.messages;

  // Reading the chat marks it read, including messages that arrive while it's open.
  useEffect(() => {
    if (messages) chat.markRead();
  }, [messages?.length]);
  // Stay at the newest message.
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await chat.send(text);
      setDraft('');
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Could not send that.'));
    } finally {
      setSending(false);
    }
  };

  const clock = (iso: string) => new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', timeZone: room.timezone }).format(new Date(iso));
  const dayHeading = (date: string) =>
    date === today
      ? t('Today')
      : date === previousDay(today)
        ? t('Yesterday')
        : new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

  const rows: React.ReactNode[] = [];
  let lastDate = '';
  let lastAuthor = '';
  for (const m of messages ?? []) {
    const date = sentDate(m.created_at, room.timezone);
    if (date !== lastDate) {
      rows.push(
        <div key={`d-${date}`} role="separator" style={{ alignSelf: 'center', margin: '10px 0 4px', padding: '4px 10px', borderRadius: 999, background: 'var(--track)', fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
          {dayHeading(date)}
        </div>,
      );
      lastDate = date;
      lastAuthor = '';
    }
    rows.push(
      <Bubble
        key={m.id}
        message={m}
        author={memberById.get(m.member_id)}
        mine={m.member_id === me.id}
        firstOfGroup={m.member_id !== lastAuthor}
        time={clock(m.created_at)}
        selected={selected === m.id}
        onSelect={() => setSelected(selected === m.id ? null : m.id)}
        onDelete={async () => {
          try {
            await chat.remove(m.id);
            setSelected(null);
          } catch (e) {
            onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
          }
        }}
      />,
    );
    lastAuthor = m.member_id;
  }

  return (
    <main className="screen" style={{ gap: 12, paddingBottom: 12, overflowY: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" className="icon-btn press" aria-label={t('Back')} onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {roomTitle(room)}
          </span>
          <h1 className="title title--sm">{t('Chat')}</h1>
        </div>
      </header>

      <div
        ref={list}
        role="log"
        aria-label={t('Messages')}
        aria-live="polite"
        style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 2px' }}
      >
        {messages === null ? (
          <p style={{ margin: 'auto', color: 'var(--muted)' }}>{t('Loading…')}</p>
        ) : messages.length === 0 ? (
          <p style={{ margin: 'auto', maxWidth: 260, textAlign: 'center', fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
            {t('No messages yet. Say who’s running late, or suggest something else to eat.')}
          </p>
        ) : (
          rows
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}
      >
        <label htmlFor="chat-input" className="sr-only">
          {t('Message')}
        </label>
        <textarea
          id="chat-input"
          className="input"
          rows={1}
          maxLength={500}
          placeholder={t('Message {room}', { room: roomTitle(room) })}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          style={{ flexGrow: 1, height: 'auto', minHeight: 48, maxHeight: 120, padding: '12px 14px', resize: 'none', lineHeight: 1.4, fontFamily: 'inherit' }}
        />
        <button
          type="submit"
          className="press"
          aria-label={t('Send')}
          disabled={!draft.trim() || sending}
          style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 999, border: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#fff', opacity: draft.trim() ? 1 : 0.5 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </form>
    </main>
  );
}

const bubble: React.CSSProperties = {
  padding: '9px 13px',
  borderRadius: 18,
  fontSize: 15,
  lineHeight: 1.4,
  textAlign: 'left',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'inherit',
};
const stamp: React.CSSProperties = { display: 'block', marginTop: 2, fontSize: 11, textAlign: 'right', opacity: 0.8 };

function Bubble({
  message,
  author,
  mine,
  firstOfGroup,
  time,
  selected,
  onSelect,
  onDelete,
}: {
  message: MessageRow;
  author: MemberRow | undefined;
  mine: boolean;
  firstOfGroup: boolean;
  time: string;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const name = author?.name ?? t('Someone');
  return (
    <div style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginTop: firstOfGroup ? 8 : 0 }}>
      {!mine && (
        <span style={{ width: 30, flexShrink: 0 }}>{firstOfGroup && <Avatar name={name} color={author?.color ?? '#6B6B73'} size={30} />}</span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 3, maxWidth: '78%', minWidth: 0 }}>
        {!mine && firstOfGroup && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', paddingLeft: 4 }}>{name}</span>}
        {mine ? (
          <button type="button" onClick={onSelect} aria-label={t('Your message at {time}: {text}. Tap for options', { time, text: message.body })} aria-expanded={selected} style={{ ...bubble, cursor: 'pointer', border: 'none', background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 6 }}>
            {message.body}
            <span style={stamp}>{time}</span>
          </button>
        ) : (
          <div style={{ ...bubble, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', borderBottomLeftRadius: 6 }}>
            {message.body}
            <span style={stamp}>{time}</span>
          </div>
        )}
        {mine && selected && (
          <button type="button" className="press" onClick={onDelete} style={{ minHeight: 36, padding: '0 12px', border: 'none', borderRadius: 999, background: 'var(--danger-tint)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
            {t('Delete message')}
          </button>
        )}
      </div>
    </div>
  );
}
