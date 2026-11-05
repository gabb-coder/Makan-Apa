import { useEffect, useState } from 'react';
import { FoodTile } from './FoodTile';
import { rowToFood, type Food, type FoodDraft } from '../lib/foods';
import { foodsLink } from '../lib/foodShare';
import { t } from '../lib/i18n';
import { knownRoomTitle, knownRooms } from '../lib/session';
import { supabase, type FoodOptionRow, type RoomSpotRow } from '../lib/supabase';

const draftOf = (f: Pick<Food, 'name' | 'tags' | 'icon' | 'color' | 'diet' | 'price'>): FoodDraft => ({ name: f.name, tags: f.tags, icon: f.icon, color: f.color, diet: f.diet ?? [], price: f.price ?? null });

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/**
 * Copy another room's food list (and its own places) into this one. Foods and places it already
 * has, by name, are skipped.
 */
export function CopyFromRoomSheet({ roomId, onImport, onDone, onClose }: { roomId: string; onImport: (foods: FoodDraft[]) => Promise<number>; onDone: (message: string) => void; onClose: () => void }) {
  useEscape(onClose);
  const rooms = knownRooms().filter((r) => r.roomId !== roomId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = async (fromId: string) => {
    setBusy(fromId);
    setError(null);
    try {
      const [foods, spots, mine] = await Promise.all([
        supabase.from('food_options').select('*').eq('room_id', fromId).eq('is_active', true),
        supabase.from('room_spots').select('*').eq('room_id', fromId),
        supabase.from('room_spots').select('name').eq('room_id', roomId),
      ]);
      if (foods.error) throw new Error(foods.error.message);
      const added = await onImport(((foods.data ?? []) as FoodOptionRow[]).map((r) => draftOf(rowToFood(r, null))));
      // The other room's own places too, unless this room has them already.
      const have = new Set(((mine.data ?? []) as { name: string }[]).map((s) => s.name.toLowerCase()));
      const newSpots = ((spots.data ?? []) as RoomSpotRow[]).filter((s) => !have.has(s.name.toLowerCase()));
      if (newSpots.length) {
        const me = knownRooms().find((r) => r.roomId === roomId)?.memberId ?? null;
        const { error: spotError } = await supabase
          .from('room_spots')
          .insert(newSpots.map(({ name, area, note, price, diet, lat, lng }) => ({ room_id: roomId, name, area, note, price, diet, lat, lng, added_by: me })));
        if (spotError) throw new Error(spotError.message);
      }
      onDone(
        added || newSpots.length
          ? (() => {
              const foodsText = added === 1 ? t('1 food') : t('{n} foods', { n: added });
              const placesText = newSpots.length === 1 ? t('1 place') : t('{n} places', { n: newSpots.length });
              return !newSpots.length ? t('Added {what}.', { what: foodsText }) : !added ? t('Added {what}.', { what: placesText }) : t('Added {foods} and {places}.', { foods: foodsText, places: placesText });
            })()
          : t('Nothing new: this room has all of them already.'),
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="copy-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="copy-title" className="title title--sm" style={{ fontSize: 22 }}>
          {t('Copy from another room')}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>{t('Its foods and its own places come here too. Ones this room already has are skipped.')}</p>
        {rooms.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{t('This is your only room on this phone.')}</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rooms.map((r) => (
              <li key={r.roomId}>
                <button type="button" className="btn btn--secondary press" disabled={busy !== null} onClick={() => copy(r.roomId)} style={{ width: '100%', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{knownRoomTitle(r)}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>{busy === r.roomId ? t('Copying…') : t('Copy')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>
            {error}
          </p>
        )}
        <button type="button" className="btn btn--secondary press" onClick={onClose}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}

/** Share this room's food list as a link: whoever opens it can add the foods to one of their rooms. */
export async function shareFoodList(foods: Food[], roomTitle: string): Promise<string | null> {
  const url = foodsLink(foods.map(draftOf));
  const text = t('Our food list on Makan apa? ({n} foods). Add it to your room:', { n: foods.length });
  if (navigator.share) {
    try {
      await navigator.share({ title: roomTitle, text, url });
      return null;
    } catch {
      return null;
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return t('Link copied. Paste it to your group.');
}

/** Someone shared a food list: add it to this room? */
export function IncomingFoodsSheet({
  foods,
  have,
  roomName,
  onAdd,
  onClose,
  onLater,
}: {
  foods: FoodDraft[];
  have: Set<string>;
  roomName: string;
  onAdd: () => Promise<void>;
  /** Not wanted: forget the list. */
  onClose: () => void;
  /** It's for another room on this phone: keep it for when that room opens. */
  onLater?: () => void;
}) {
  useEscape(onLater ?? onClose);
  const [busy, setBusy] = useState(false);
  const fresh = foods.filter((f) => !have.has(f.name.toLowerCase()));
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="incoming-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="incoming-title" className="title title--sm" style={{ fontSize: 22 }}>
          {t('A shared food list')}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          {fresh.length
            ? t('{n} of its {total} foods are new to {room}.', { n: fresh.length, total: foods.length, room: roomName })
            : t('{room} has all of these already.', { room: roomName })}
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {foods.map((f) => (
            <li key={f.name} className="chip" style={{ gap: 6, opacity: have.has(f.name.toLowerCase()) ? 0.5 : 1 }}>
              <FoodTile food={f} size={22} />
              {f.name}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--secondary press" onClick={onClose} style={{ flex: 1 }}>
            {t('Discard')}
          </button>
          <button
            type="button"
            className="btn btn--primary press"
            disabled={busy || !fresh.length}
            onClick={async () => {
              setBusy(true);
              try {
                await onAdd();
              } finally {
                setBusy(false);
              }
            }}
            style={{ flex: 2 }}
          >
            {fresh.length === 1 ? t('Add 1 food') : t('Add {n} foods', { n: fresh.length })}
          </button>
        </div>
        {onLater && (
          <button type="button" onClick={onLater} style={{ alignSelf: 'center', minHeight: 40, border: 'none', background: 'none', color: 'var(--accent-text)', fontWeight: 700, fontSize: 14 }}>
            {t('It’s for another room')}
          </button>
        )}
      </div>
    </div>
  );
}
