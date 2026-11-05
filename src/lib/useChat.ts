import { t } from './i18n';
import { useCallback, useEffect, useState } from 'react';
import { storage } from './storage';
import { supabase, type MessageRow, type PollRow, type PollVoteRow, type ReactionEmoji, type ReactionRow } from './supabase';

const SEEN_KEY = 'makan.chatSeen';

function seenMap(): Record<string, string> {
  try {
    const v = JSON.parse(storage.get(SEEN_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** When this phone last read the room's chat. */
export function chatSeenAt(roomId: string): string | null {
  return seenMap()[roomId] ?? null;
}

export function markChatSeen(roomId: string, at = new Date().toISOString()) {
  storage.set(SEEN_KEY, JSON.stringify({ ...seenMap(), [roomId]: at }));
}

/** Messages from others since this phone last read the chat. */
export function unreadCount(messages: MessageRow[], meId: string, seenAt: string | null): number {
  return messages.filter((m) => m.member_id !== meId && (!seenAt || m.created_at > seenAt)).length;
}

const PAGE = 200;

/** The room's chat, newest last, kept live. */
export function useChat(roomId: string, meId: string) {
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [seenAt, setSeenAt] = useState(() => chatSeenAt(roomId));

  const load = useCallback(async () => {
    const { data } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(PAGE);
    if (data) setMessages((data as MessageRow[]).reverse());
  }, [roomId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`chat:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (p) => {
        const row = p.new as MessageRow;
        setMessages((cur) => (cur && !cur.some((m) => m.id === row.id) ? [...cur, row].slice(-PAGE) : cur));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
        const id = (p.old as { id?: string }).id;
        setMessages((cur) => cur?.filter((m) => m.id !== id) ?? cur);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  const send = async (body: string) => {
    const text = body.trim().slice(0, 500);
    if (!text) return;
    const { data, error } = await supabase.from('messages').insert({ room_id: roomId, member_id: meId, body: text }).select().single();
    if (error) throw new Error(error.message);
    const row = data as MessageRow;
    setMessages((cur) => (cur && !cur.some((m) => m.id === row.id) ? [...cur, row] : cur));
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setMessages((cur) => cur?.filter((m) => m.id !== id) ?? cur);
  };

  const markRead = () => {
    const last = messages?.at(-1)?.created_at;
    const at = last && last > new Date().toISOString() ? last : new Date().toISOString();
    markChatSeen(roomId, at);
    setSeenAt(at);
  };

  return { messages, send, remove, markRead, unread: messages ? unreadCount(messages, meId, seenAt) : 0 };
}

export type Chat = ReturnType<typeof useChat>;

/** Emoji reactions on one day's pick, kept live. */
export function useReactions(dayEntryId: string | null, meId: string) {
  const [rows, setRows] = useState<ReactionRow[]>([]);

  const load = useCallback(async () => {
    if (!dayEntryId) return setRows([]);
    const { data } = await supabase.from('reactions').select('*').eq('day_entry_id', dayEntryId);
    if (data) setRows(data as ReactionRow[]);
  }, [dayEntryId]);

  useEffect(() => {
    void load();
    if (!dayEntryId) return;
    const channel = supabase
      .channel(`reactions:${dayEntryId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions', filter: `day_entry_id=eq.${dayEntryId}` }, () => void load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dayEntryId, load]);

  const toggle = async (emoji: ReactionEmoji) => {
    if (!dayEntryId) return;
    const mine = rows.some((r) => r.member_id === meId && r.emoji === emoji);
    // Show it straight away; the live update or a reload corrects it.
    setRows((cur) =>
      mine ? cur.filter((r) => !(r.member_id === meId && r.emoji === emoji)) : [...cur, { day_entry_id: dayEntryId, member_id: meId, emoji, created_at: new Date().toISOString() }],
    );
    const { error } = mine
      ? await supabase.from('reactions').delete().eq('day_entry_id', dayEntryId).eq('member_id', meId).eq('emoji', emoji)
      : await supabase.from('reactions').insert({ day_entry_id: dayEntryId, member_id: meId, emoji });
    if (error) {
      void load();
      throw new Error(error.message);
    }
  };

  return { rows, toggle };
}

/** The room's polls and their votes, kept live (polls show in the chat). */
export function usePolls(roomId: string, meId: string) {
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [votes, setVotes] = useState<PollVoteRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('polls').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(50);
    const list = (data ?? []) as PollRow[];
    setPolls(list);
    if (!list.length) return setVotes([]);
    const v = await supabase.from('poll_votes').select('*').in('poll_id', list.map((p) => p.id));
    setVotes((v.data ?? []) as PollVoteRow[]);
  }, [roomId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`polls:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls', filter: `room_id=eq.${roomId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  /** A poll, posted to the chat as a message. */
  const ask = async (question: string, options: string[]) => {
    const q = question.trim().slice(0, 120);
    let opts = options.map((o) => o.trim().slice(0, 40)).filter(Boolean).slice(0, 4);
    // Just a question, with the Yes / No boxes left as they show: it's a yes-or-no poll.
    if (!opts.length) opts = [t('Yes'), t('No')];
    if (!q) throw new Error(t('Type a question to ask.'));
    if (opts.length < 2) throw new Error(t('A poll needs at least 2 options.'));
    const { data, error } = await supabase.from('polls').insert({ room_id: roomId, member_id: meId, question: q, options: opts }).select().single();
    if (error) throw new Error(error.message);
    const poll = data as PollRow;
    const { error: msgError } = await supabase.from('messages').insert({ room_id: roomId, member_id: meId, body: `📊 ${q}`, poll_id: poll.id });
    if (msgError) throw new Error(msgError.message);
    await load();
  };

  /** Your vote; tapping your current choice takes it back. */
  const vote = async (pollId: string, choice: number) => {
    const mine = votes.find((v) => v.poll_id === pollId && v.member_id === meId);
    setVotes((cur) => [...cur.filter((v) => !(v.poll_id === pollId && v.member_id === meId)), ...(mine?.choice === choice ? [] : [{ poll_id: pollId, member_id: meId, choice, created_at: new Date().toISOString() }])]);
    const { error } =
      mine?.choice === choice
        ? await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('member_id', meId)
        : await supabase.from('poll_votes').upsert({ poll_id: pollId, member_id: meId, choice });
    if (error) {
      void load();
      throw new Error(error.message);
    }
  };

  return { polls, votes, ask, vote };
}
