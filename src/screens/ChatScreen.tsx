import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { locale, t } from '../lib/i18n';
import { roomTitle } from '../lib/session';
import { usePolls, type Chat } from '../lib/useChat';
import type { MemberRow, MessageRow, PollRow, PollVoteRow, RoomRow } from '../lib/supabase';

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
  const polls = usePolls(room.id, me.id);
  const [asking, setAsking] = useState(false);
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
    // Clear the box straight away, so typing the next message while this one sends isn't lost.
    setDraft('');
    try {
      await chat.send(text);
    } catch (e) {
      setDraft((cur) => (cur ? cur : text));
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
    const poll = m.poll_id ? polls.polls.find((p) => p.id === m.poll_id) : undefined;
    if (poll) {
      rows.push(
        <PollBubble
          key={m.id}
          poll={poll}
          votes={polls.votes.filter((v) => v.poll_id === poll.id)}
          author={memberById.get(m.member_id)}
          mine={m.member_id === me.id}
          meId={me.id}
          members={members}
          time={clock(m.created_at)}
          onVote={(choice) => polls.vote(poll.id, choice).catch((e: unknown) => onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.')))}
        />,
      );
      lastAuthor = '';
      continue;
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
        <button type="button" className="icon-btn press" aria-label={t('Start a poll')} onClick={() => setAsking(true)} style={{ width: 48, height: 48, flexShrink: 0, fontSize: 20 }}>
          📊
        </button>
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
      {asking && (
        <PollSheet
          onClose={() => setAsking(false)}
          onAsk={async (q, opts) => {
            await polls.ask(q, opts);
            setAsking(false);
          }}
        />
      )}
    </main>
  );
}

/** A poll in the chat: tap an option to vote (tap it again to take your vote back). */
function PollBubble({
  poll,
  votes,
  author,
  mine,
  meId,
  members,
  time,
  onVote,
}: {
  poll: PollRow;
  votes: PollVoteRow[];
  author: MemberRow | undefined;
  mine: boolean;
  meId: string;
  members: MemberRow[];
  time: string;
  onVote: (choice: number) => void;
}) {
  const myChoice = votes.find((v) => v.member_id === meId)?.choice;
  const total = votes.length;
  const nameOf = (id: string) => (id === meId ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  return (
    <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', width: 'min(86%, 340px)', marginTop: 8 }}>
      <div role="group" aria-label={t('Poll by {name}: {question}', { name: author?.name ?? t('Someone'), question: poll.question })} className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
          📊 {mine ? t('Your poll') : t('Poll by {name}', { name: author?.name ?? t('Someone') })} · {time}
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, overflowWrap: 'anywhere' }}>{poll.question}</span>
        {poll.options.map((opt, i) => {
          const who = votes.filter((v) => v.choice === i);
          const pct = total ? Math.round((who.length / total) * 100) : 0;
          return (
            <button
              key={i}
              type="button"
              className="press"
              aria-pressed={myChoice === i}
              onClick={() => onVote(i)}
              style={{
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'left',
                minHeight: 44,
                padding: '8px 12px',
                borderRadius: 12,
                border: `1.5px solid ${myChoice === i ? 'var(--accent)' : 'var(--border)'}`,
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'var(--accent-tint)', transition: 'width 0.4s var(--ease-out)' }} />
              <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ overflowWrap: 'anywhere' }}>
                  {myChoice === i ? '✓ ' : ''}
                  {opt}
                </span>
                <span style={{ flexShrink: 0, color: 'var(--ink-2)' }}>{who.length}</span>
              </span>
              {who.length > 0 && <span style={{ position: 'relative', display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>{who.map((v) => nameOf(v.member_id)).join(', ')}</span>}
            </button>
          );
        })}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{total === 1 ? t('1 vote') : t('{n} votes', { n: total })}</span>
      </div>
    </div>
  );
}

function PollSheet({ onClose, onAsk }: { onClose: () => void; onAsk: (question: string, options: string[]) => Promise<void> }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = question.trim() && options.filter((o) => o.trim()).length >= 2;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setBusy(true);
          setError(null);
          try {
            await onAsk(question, options);
          } catch (err) {
            setError(err instanceof Error ? err.message : t('Something went wrong. Try again.'));
            setBusy(false);
          }
        }}
      >
        <h2 id="poll-title" className="title title--sm" style={{ fontSize: 22 }}>
          {t('Start a poll')}
        </h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="field-label">{t('Question')}</span>
          <input id="poll-question" className="input" maxLength={120} placeholder={t('e.g. Mamak after dinner?')} value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus />
        </label>
        {options.map((o, i) => (
          <label key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="field-label">{t('Option {n}', { n: i + 1 })}</span>
            <input
              className="input"
              maxLength={40}
              placeholder={i === 0 ? t('Yes') : i === 1 ? t('No') : ''}
              value={o}
              onChange={(e) => setOptions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </label>
        ))}
        {options.length < 4 && (
          <button type="button" className="press" onClick={() => setOptions((cur) => [...cur, ''])} style={{ alignSelf: 'flex-start', minHeight: 40, padding: 0, border: 'none', background: 'none', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700 }}>
            {t('+ Add an option')}
          </button>
        )}
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--secondary press" onClick={onClose} style={{ flex: 1 }}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary press" disabled={busy || !ready} style={{ flex: 2 }}>
            {t('Post poll')}
          </button>
        </div>
      </form>
    </div>
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
