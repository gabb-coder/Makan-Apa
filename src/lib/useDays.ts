import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from './i18n';
import { deciderFor, rotationOf } from './rotation';
import { isEatingDay } from './calendar';
import { maskMystery, useNow } from './mystery';
import { supabase, type DayEntryRow, type Meal, type MemberRow, type RoomRow, type SecretPickRow, type SwipeRow, type VetoRow, type VoteRow } from './supabase';

/** What the decider is proposing: a pool food, or a name typed in. */
export type Pick = { foodId: string; name: string } | { foodId: null; name: string };

interface VetoWithEntry extends VetoRow {
  day_entries?: unknown;
}

function upsertEntry(rows: DayEntryRow[], row: DayEntryRow): DayEntryRow[] {
  const next = rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];
  return next.sort((a, b) => b.entry_date.localeCompare(a.entry_date));
}

function stripJoin({ day_entries: _, ...veto }: VetoWithEntry): VetoRow {
  return veto;
}

/**
 * The room's day entries and vetoes, kept live, plus the propose / accept / veto actions
 * for today (SPEC.md section 6, day entry lifecycle).
 */
export function useDays(room: RoomRow, members: MemberRow[], meId: string, today: string, meal: Meal = 'lunch', away?: ReadonlySet<string>, anyway = false) {
  const [entries, setEntries] = useState<DayEntryRow[] | null>(null);
  const [vetoes, setVetoes] = useState<VetoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const entryIds = useRef(new Set<string>());

  const load = useCallback(async () => {
    const [e, v] = await Promise.all([
      supabase.from('day_entries').select('*').eq('room_id', room.id).order('entry_date', { ascending: false }).limit(500),
      supabase.from('vetoes').select('*, day_entries!inner(room_id)').eq('day_entries.room_id', room.id).order('created_at'),
    ]);
    if (e.error || v.error) {
      setError((e.error ?? v.error)!.message);
      return;
    }
    setError(null);
    setEntries(e.data as DayEntryRow[]);
    setVetoes((v.data as VetoWithEntry[]).map(stripJoin));
  }, [room.id]);

  useEffect(() => {
    entryIds.current = new Set((entries ?? []).map((e) => e.id));
  }, [entries]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`days:${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'day_entries', filter: `room_id=eq.${room.id}` }, (p) =>
        setEntries((cur) => (cur ? upsertEntry(cur, p.new as DayEntryRow) : cur)),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'day_entries', filter: `room_id=eq.${room.id}` }, (p) =>
        setEntries((cur) => (cur ? upsertEntry(cur, p.new as DayEntryRow) : cur)),
      )
      // A day cleared because it became a day off (Settings). Deletes carry only the id.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'day_entries' }, (p) => {
        const id = (p.old as { id?: string }).id;
        setEntries((cur) => (cur && id ? cur.filter((e) => e.id !== id) : cur));
      })
      // vetoes has no room_id, so keep only those for this room's entries.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vetoes' }, (p) => {
        const veto = p.new as VetoRow;
        if (entryIds.current.has(veto.day_entry_id)) {
          setVetoes((cur) => (cur.some((x) => x.id === veto.id) ? cur : [...cur, veto]));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'vetoes' }, (p) => {
        const id = (p.old as { id?: string }).id;
        setVetoes((cur) => cur.filter((x) => x.id !== id));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, load]);

  // A mystery pick stays hidden on this phone until it's revealed (or the meet-up time comes).
  const now = useNow(30_000);
  const shown = useMemo(() => entries?.map((e) => maskMystery(e, meId, today, now)) ?? null, [entries, meId, today, now]);
  const todayEntry = shown?.find((e) => e.entry_date === today && (e.meal ?? 'lunch') === meal) ?? null;
  const todayVetoes = useMemo(
    () => (todayEntry ? vetoes.filter((v) => v.day_entry_id === todayEntry.id) : []),
    [vetoes, todayEntry],
  );
  // Whoever's out today is skipped; until the day has a pick, the turn follows them coming and going.
  // On a day off (weekend, public holiday) nobody's turn comes up, unless this phone chose to
  // eat together anyway: then it decides.
  const rot = rotationOf(room);
  const computedDecider = anyway ? (members.find((m) => m.id === meId) ?? null) : isEatingDay(today, rot.cal) ? deciderFor(members, rot, today, meal, away) : null;

  // Secret picks for today, live. Every phone holds them all, but the UI only shows
  // other people's picks once everyone is in (the room code is the only lock).
  const [secretPicks, setSecretPicks] = useState<SecretPickRow[]>([]);
  const todayId = todayEntry?.id ?? null;
  useEffect(() => {
    setSecretPicks([]);
    if (!todayId) return;
    const loadPicks = () =>
      supabase
        .from('secret_picks')
        .select('*')
        .eq('day_entry_id', todayId)
        .then(({ data }) => data && setSecretPicks(data as SecretPickRow[]));
    const upsertPick = (row: SecretPickRow) =>
      setSecretPicks((cur) => [...cur.filter((x) => x.member_id !== row.member_id), row]);
    loadPicks();
    const channel = supabase
      .channel(`picks:${todayId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'secret_picks', filter: `day_entry_id=eq.${todayId}` }, (p) =>
        upsertPick(p.new as SecretPickRow),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'secret_picks', filter: `day_entry_id=eq.${todayId}` }, (p) =>
        upsertPick(p.new as SecretPickRow),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') loadPicks();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [todayId]);

  // A fixed day ("Friday is mamak"): lunch decides itself and nobody has to choose.
  const fixedFood = meal === 'lunch' ? (room.fixed_days?.[String(new Date(`${today}T00:00:00Z`).getUTCDay())] ?? null) : null;

  // Step 1: the first visit of the day creates the entry. Both phones may race; the unique
  // (room_id, entry_date, meal) constraint keeps one row.
  useEffect(() => {
    if (!entries || todayEntry || !computedDecider) return;
    supabase
      .from('day_entries')
      .upsert(
        fixedFood
          ? { room_id: room.id, entry_date: today, meal, decider_id: computedDecider.id, status: 'accepted', custom_food: fixedFood, method: 'direct' }
          : { room_id: room.id, entry_date: today, meal, decider_id: computedDecider.id, status: 'pending' },
        { onConflict: 'room_id,entry_date,meal', ignoreDuplicates: true },
      )
      .then(({ error: err }) => (err ? setError(err.message) : load()));
  }, [entries, todayEntry, computedDecider, room.id, today, meal, load, fixedFood]);

  // Until the day has a pick or a veto, follow changes to the member order or rotation start.
  useEffect(() => {
    if (!todayEntry || !computedDecider) return;
    const untouched = todayEntry.status === 'pending' && !todayEntry.food_option_id && !todayEntry.custom_food && todayVetoes.length === 0;
    // Today's decider was removed from the room: hand the day to whoever the rotation says now.
    if (todayEntry.decider_id === null && todayEntry.status !== 'accepted') {
      supabase
        .from('day_entries')
        .update({ decider_id: computedDecider.id, status: 'pending', food_option_id: null, custom_food: null, method: null })
        .eq('id', todayEntry.id)
        .is('decider_id', null)
        .neq('status', 'accepted')
        .then(({ error: err }) => err && setError(err.message));
      return;
    }
    // The day became a fixed day after it started, before anyone picked.
    if (untouched && fixedFood) {
      supabase
        .from('day_entries')
        .update({ status: 'accepted', custom_food: fixedFood, method: 'direct' })
        .eq('id', todayEntry.id)
        .eq('status', 'pending')
        .is('food_option_id', null)
        .is('custom_food', null)
        .then(({ error: err }) => err && setError(err.message));
      return;
    }
    if (untouched && todayEntry.decider_id !== computedDecider.id) {
      supabase
        .from('day_entries')
        .update({ decider_id: computedDecider.id })
        .eq('id', todayEntry.id)
        .eq('status', 'pending')
        .is('food_option_id', null)
        .is('custom_food', null)
        .then(({ error: err }) => err && setError(err.message));
    }
  }, [todayEntry, computedDecider, todayVetoes.length, fixedFood]);

  // Quick vote: everyone's votes for today, live.
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const votingId = todayEntry?.vote_options ? todayEntry.id : null;
  useEffect(() => {
    setVotes([]);
    if (!votingId) return;
    const loadVotes = () =>
      supabase
        .from('votes')
        .select('*')
        .eq('day_entry_id', votingId)
        .then(({ data }) => data && setVotes(data as VoteRow[]));
    void loadVotes();
    const channel = supabase
      .channel(`votes:${votingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `day_entry_id=eq.${votingId}` }, () => void loadVotes())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void loadVotes();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [votingId]);

  // Swipe to match: everyone's swipes on today's deal, live.
  const [swipes, setSwipes] = useState<SwipeRow[]>([]);
  const swipingId = todayEntry?.swipe_options ? todayEntry.id : null;
  const swipeRound = todayEntry?.swipe_round ?? 0;
  useEffect(() => {
    setSwipes([]);
    if (!swipingId) return;
    const load = () =>
      supabase
        .from('swipes')
        .select('*')
        .eq('day_entry_id', swipingId)
        .eq('round', swipeRound)
        .then(({ data }) => data && setSwipes(data as SwipeRow[]));
    void load();
    const channel = supabase
      .channel(`swipes:${swipingId}:${swipeRound}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swipes', filter: `day_entry_id=eq.${swipingId}` }, () => void load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [swipingId, swipeRound]);

  /** Run an update on today's entry; returns false if `guard` no longer matched (someone got there first). */
  const updateToday = async (patch: Partial<DayEntryRow>, guard: (q: any) => any = (q) => q): Promise<boolean> => {
    if (!todayEntry) throw new Error(t('Today isn’t ready yet. Try again in a moment.'));
    const { data, error: err } = await guard(supabase.from('day_entries').update(patch).eq('id', todayEntry.id)).select();
    if (err) throw new Error(err.message);
    const rows = data as DayEntryRow[];
    if (rows.length) setEntries((cur) => (cur ? upsertEntry(cur, rows[0]) : cur));
    return rows.length > 0;
  };

  // Nobody else in today: there's nobody to ask, so a pick is final.
  const soloRoom = members.filter((m) => !away?.has(m.id)).length < 2;
  const myVetoesToday = todayVetoes.filter((v) => v.member_id === meId).length;

  /** Step 2: the decider picks or spins. In a room of one there's nobody to ask, so it's final. */
  const propose = async (pick: Pick, method: 'direct' | 'wheel') => {
    const ok = await updateToday(
      {
        food_option_id: pick.foodId,
        custom_food: pick.foodId ? null : pick.name,
        method,
        status: soloRoom ? 'accepted' : 'proposed',
      },
      // Only today's decider may pick, even if this phone's view of the rotation is a moment stale.
      (q) => q.neq('status', 'accepted').eq('decider_id', meId),
    );
    if (!ok) throw new Error(t('It’s not your turn right now, or today’s already decided.'));
  };

  /** Decider takes back a proposal nobody has answered yet. */
  const retract = async () => {
    await updateToday(
      { food_option_id: null, custom_food: null, method: null, status: 'pending' },
      (q) => q.eq('status', 'proposed').eq('decider_id', meId),
    );
  };

  /** Step 3: a non-decider accepts. */
  const accept = async () => {
    const ok = await updateToday({ status: 'accepted' }, (q) => q.eq('status', 'proposed'));
    if (!ok) throw new Error(t('That pick changed. Have another look.'));
  };

  const undoAccept = async () => {
    await updateToday({ status: 'proposed' }, (q) => q.eq('status', 'accepted'));
  };

  /** Step 4: a non-decider vetoes, if they have vetoes left. Returns the veto so it can be undone. */
  const veto = async (foodName: string): Promise<{ veto: VetoRow; previous: DayEntryRow }> => {
    if (!todayEntry) throw new Error(t('Today isn’t ready yet.'));
    if (myVetoesToday >= room.veto_limit) throw new Error(t('No vetoes left today, so this pick stands.'));
    const previous = todayEntry;
    const ok = await updateToday(
      { food_option_id: null, custom_food: null, method: null, status: 'pending' },
      (q) => q.eq('status', 'proposed'),
    );
    if (!ok) throw new Error(t('That pick changed. Have another look.'));
    const { data, error: err } = await supabase
      .from('vetoes')
      .insert({ day_entry_id: todayEntry.id, member_id: meId, rejected_food: foodName })
      .select()
      .single();
    if (err) throw new Error(err.message);
    const row = data as VetoRow;
    setVetoes((cur) => (cur.some((x) => x.id === row.id) ? cur : [...cur, row]));
    return { veto: row, previous };
  };

  /** Put a vetoed pick back, as long as the decider hasn't moved on. */
  const undoVeto = async (vetoRow: VetoRow, previous: DayEntryRow) => {
    const ok = await updateToday(
      {
        food_option_id: previous.food_option_id,
        custom_food: previous.custom_food,
        method: previous.method,
        status: 'proposed',
      },
      (q) => q.eq('status', 'pending').is('food_option_id', null).is('custom_food', null),
    );
    if (!ok) throw new Error(t("Too late, there's a new pick."));
    const { error: err } = await supabase.from('vetoes').delete().eq('id', vetoRow.id);
    if (err) throw new Error(err.message);
    setVetoes((cur) => cur.filter((x) => x.id !== vetoRow.id));
  };

  /** Secret picks mode: set or change my pick for today. */
  const submitSecretPick = async (foodText: string) => {
    if (!todayEntry) throw new Error(t('Today isn’t ready yet. Try again in a moment.'));
    const { data, error: err } = await supabase
      .from('secret_picks')
      .upsert({ day_entry_id: todayEntry.id, member_id: meId, food_text: foodText }, { onConflict: 'day_entry_id,member_id' })
      .select()
      .single();
    if (err) throw new Error(err.message);
    const row = data as SecretPickRow;
    setSecretPicks((cur) => [...cur.filter((x) => x.member_id !== row.member_id), row]);
  };

  /**
   * Secret picks mode: save the wheel's result as today's meal. Only the first spin counts;
   * returns false if someone else's spin got there first.
   */
  const settleSecretSpin = async (pick: Pick) =>
    updateToday(
      { food_option_id: pick.foodId, custom_food: pick.foodId ? null : pick.name, method: 'wheel', status: 'accepted' },
      (q) => q.eq('status', 'pending'),
    );

  /** The decider puts 2–3 options to a vote that closes in `minutes`. */
  const startVote = async (options: string[], minutes: number) => {
    const ok = await updateToday(
      { vote_options: options, vote_ends_at: new Date(Date.now() + minutes * 60_000).toISOString(), food_option_id: null, custom_food: null, method: null, status: 'pending' },
      (q) => q.neq('status', 'accepted').eq('decider_id', meId),
    );
    if (!ok) throw new Error(t('It’s not your turn right now, or today’s already decided.'));
  };
  /** The decider calls the vote off. */
  const cancelVote = async () => {
    await updateToday({ vote_options: null, vote_ends_at: null }, (q) => q.neq('status', 'accepted'));
    await supabase.from('votes').delete().eq('day_entry_id', todayEntry?.id ?? '');
  };
  const castVote = async (choice: number) => {
    if (!todayEntry) return;
    const row = { day_entry_id: todayEntry.id, member_id: meId, choice };
    setVotes((cur) => [...cur.filter((v) => v.member_id !== meId), { ...row, created_at: new Date().toISOString() }]);
    const { error: err } = await supabase.from('votes').upsert(row);
    if (err) throw new Error(err.message);
  };
  /** The vote is over: lock in the winner. Only the first phone to get here counts. */
  const settleVote = (pick: Pick) =>
    updateToday({ food_option_id: pick.foodId, custom_food: pick.foodId ? null : pick.name, method: 'direct', status: 'accepted' }, (q) => q.neq('status', 'accepted'));

  /** The decider deals out foods for everyone to swipe on; dealing again starts a new round. */
  const startSwipe = async (options: string[]) => {
    const ok = await updateToday(
      { swipe_options: options, swipe_round: (todayEntry?.swipe_round ?? 0) + 1, vote_options: null, vote_ends_at: null, food_option_id: null, custom_food: null, method: null, status: 'pending' },
      (q) => q.neq('status', 'accepted').eq('decider_id', meId),
    );
    if (!ok) throw new Error(t('It’s not your turn right now, or today’s already decided.'));
  };
  /** Yes or no on one card. */
  const swipe = async (choice: number, yes: boolean) => {
    if (!todayEntry) return;
    const row = { day_entry_id: todayEntry.id, member_id: meId, round: todayEntry.swipe_round ?? 0, choice, yes };
    setSwipes((cur) => [...cur.filter((x) => !(x.member_id === meId && x.choice === choice && x.round === row.round)), { ...row, created_at: new Date().toISOString() }]);
    const { error: err } = await supabase.from('swipes').upsert(row);
    if (err) throw new Error(err.message);
  };
  /** The decider calls it off. */
  const cancelSwipe = async () => {
    await updateToday({ swipe_options: null }, (q) => q.neq('status', 'accepted'));
  };
  /** The decider goes with one of the matches: everyone's had their say, so it's agreed. */
  const settleSwipe = (pick: Pick) =>
    updateToday(
      { food_option_id: pick.foodId, custom_food: pick.foodId ? null : pick.name, method: 'direct', status: 'accepted', swipe_options: null },
      (q) => q.neq('status', 'accepted').eq('decider_id', meId),
    );

  /** When to head out and where to meet, once decided; null clears it. */
  const setMeetup = async (meetAt: string | null, place: string | null) => {
    const ok = await updateToday({ meet_at: meetAt, meet_place: place?.trim().slice(0, 60) || null });
    if (!ok) throw new Error(t('Could not save.'));
  };

  /** The decider picks a mystery: agreed at once (no vetoes), hidden from the others for now. */
  const proposeMystery = async (pick: Pick) => {
    const ok = await updateToday(
      { food_option_id: pick.foodId, custom_food: pick.foodId ? null : pick.name, method: 'direct', status: 'accepted', mystery: true, mystery_revealed: false },
      (q) => q.neq('status', 'accepted').eq('decider_id', meId),
    );
    if (!ok) throw new Error(t('It’s not your turn right now, or today’s already decided.'));
  };
  const revealMystery = async () => {
    await updateToday({ mystery_revealed: true }, (q) => q.eq('decider_id', meId));
  };

  return {
    entries: shown,
    proposeMystery,
    revealMystery,
    votes,
    swipes,
    startSwipe,
    swipe,
    cancelSwipe,
    settleSwipe,
    startVote,
    cancelVote,
    castVote,
    settleVote,
    setMeetup,
    fixedFood,
    secretPicks,
    submitSecretPick,
    settleSecretSpin,
    vetoes,
    error,
    todayEntry,
    todayVetoes,
    myVetoesToday,
    propose,
    retract,
    accept,
    undoAccept,
    veto,
    undoVeto,
  };
}
