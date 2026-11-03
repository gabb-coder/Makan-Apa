import { useEffect, useRef, useState } from 'react';
import { t, tk } from '../lib/i18n';
import { useReactions } from '../lib/useChat';
import { supabase, REACTION_EMOJIS, type MealPhotoRow, type MemberRow } from '../lib/supabase';

const REACTION_NAMES: Record<(typeof REACTION_EMOJIS)[number], string> = {
  '🔥': tk('Fire'),
  '👍': tk('Thumbs up'),
  '😋': tk('Yum'),
  '🤔': tk('Hmm'),
  '😴': tk('Sleepy'),
};

/** 🔥 👍 😋 🤔 😴 on a day's pick: tap to add yours, tap again to take it back. */
export function ReactionBar({ dayEntryId, me, members, onError }: { dayEntryId: string; me: MemberRow; members: MemberRow[]; onError: (m: string) => void }) {
  const { rows, toggle } = useReactions(dayEntryId, me.id);
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  return (
    <div role="group" aria-label={t('Reactions')} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
      {REACTION_EMOJIS.map((emoji) => {
        const who = rows.filter((r) => r.emoji === emoji);
        const mine = who.some((r) => r.member_id === me.id);
        const names = who.map((r) => nameOf(r.member_id)).join(', ');
        return (
          <button
            key={emoji}
            type="button"
            className="press"
            aria-pressed={mine}
            aria-label={who.length ? t('{reaction}: {names}', { reaction: t(REACTION_NAMES[emoji]), names }) : t(REACTION_NAMES[emoji])}
            title={names || undefined}
            onClick={() => toggle(emoji).catch((e: unknown) => onError(e instanceof Error ? e.message : t('Something went wrong. Try again.')))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              minHeight: 38,
              minWidth: 44,
              padding: '0 10px',
              borderRadius: 999,
              border: `1.5px solid ${mine ? 'var(--accent)' : 'var(--border)'}`,
              background: mine ? 'var(--accent-tint)' : 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 17,
              fontWeight: 700,
            }}
          >
            <span aria-hidden="true">{emoji}</span>
            {who.length > 0 && <span style={{ fontSize: 13, color: mine ? 'var(--accent-ink)' : 'var(--ink-2)' }}>{who.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Signed links to photos in the private bucket, kept for most of their hour.
const urls = new Map<string, { url: string; until: number }>();
export async function photoUrl(path: string): Promise<string | null> {
  const hit = urls.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  urls.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}

export function usePhotoUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? (urls.get(path)?.url ?? null) : null));
  useEffect(() => {
    let live = true;
    if (path) void photoUrl(path).then((u) => live && setUrl(u));
    else setUrl(null);
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}

export function Thumb({ photo, size, onOpen, label }: { photo: MealPhotoRow; size: number; onOpen: () => void; label: string }) {
  const url = usePhotoUrl(photo.path);
  return (
    <button
      type="button"
      className="press"
      aria-label={label}
      onClick={onOpen}
      style={{ width: size, height: size, flexShrink: 0, padding: 0, border: 'none', borderRadius: 12, overflow: 'hidden', background: 'var(--track)' }}
    >
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </button>
  );
}

/** Full-screen view of a meal photo, with who took it and a way to remove it. */
export function PhotoViewer({ photo, by, canRemove, onRemove, onClose }: { photo: MealPhotoRow; by: string; canRemove: boolean; onRemove: () => Promise<void>; onClose: () => void }) {
  const url = usePhotoUrl(photo.path);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', padding: 16, flexDirection: 'column', gap: 12 }}>
      <div role="dialog" aria-modal="true" aria-label={t('Meal photo by {name}', { name: by })} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', maxWidth: '100%' }}>
        {url ? <img src={url} alt={t('Meal photo by {name}', { name: by })} style={{ maxWidth: '100%', maxHeight: '70dvh', borderRadius: 16, objectFit: 'contain' }} /> : <span className="spinner" style={{ color: '#fff' }} />}
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{t('Taken by {name}', { name: by })}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {canRemove && (
            <button
              type="button"
              className="btn btn--secondary press"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRemove();
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              style={{ color: 'var(--danger)', padding: '0 18px' }}
            >
              {t('Remove photo')}
            </button>
          )}
          <button type="button" className="btn btn--primary press" onClick={onClose} style={{ padding: '0 22px' }}>
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A meal's photos, with a button to add one (shrunk on the phone before uploading). */
export function MealPhotos({
  photos,
  me,
  members,
  isHost,
  onAdd,
  onRemove,
  onError,
  compact = false,
}: {
  photos: MealPhotoRow[];
  me: MemberRow;
  members: MemberRow[];
  isHost: boolean;
  onAdd?: (file: File) => Promise<void>;
  onRemove: (photo: MealPhotoRow) => Promise<void>;
  onError: (m: string) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<MealPhotoRow | null>(null);
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  const size = compact ? 56 : 72;

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'center', padding: '2px 0', justifyContent: photos.length ? 'flex-start' : 'center' }} data-no-swipe={photos.length > 3 ? '' : undefined}>
      {photos.map((p) => (
        <Thumb key={p.id} photo={p} size={size} onOpen={() => setOpen(p)} label={t('Meal photo by {name}', { name: nameOf(p.member_id) })} />
      ))}
      {onAdd && (
        <>
          <input
            ref={input}
            type="file"
            data-testid="meal-photo-input"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBusy(true);
              try {
                await onAdd(file);
              } catch (err) {
                onError(err instanceof Error ? err.message : t('Could not add the photo.'));
              } finally {
                setBusy(false);
              }
            }}
          />
          <button
            type="button"
            className="press"
            disabled={busy}
            onClick={() => input.current?.click()}
            aria-label={photos.length ? t('Add another photo of the meal') : undefined}
            style={
              photos.length
                ? { width: size, height: size, flexShrink: 0, borderRadius: 12, border: '1.5px dashed var(--border-strong)', background: 'none', color: 'var(--ink-2)', fontSize: 24, display: 'grid', placeItems: 'center' }
                : { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 14px', borderRadius: 999, border: '1.5px dashed var(--border-strong)', background: 'none', color: 'var(--ink-2)', fontSize: 14, fontWeight: 700 }
            }
          >
            {busy ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
            {!photos.length && (busy ? t('Adding photo…') : t('Add a photo of the meal'))}
          </button>
        </>
      )}
      {open && (
        <PhotoViewer
          photo={open}
          by={nameOf(open.member_id)}
          canRemove={open.member_id === me.id || isHost}
          onRemove={() => onRemove(open).catch((e: unknown) => onError(e instanceof Error ? e.message : t('Something went wrong. Try again.')))}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** A month's meal photos as a grid, newest first; tap one to see it big. */
export function PhotoGrid({ photos, me, members, isHost, onRemove, onError, captionFor }: {
  photos: MealPhotoRow[];
  me: MemberRow;
  members: MemberRow[];
  isHost: boolean;
  onRemove: (photo: MealPhotoRow) => Promise<void>;
  onError: (m: string) => void;
  /** "Nasi lemak, Tue 3", for each photo's label. */
  captionFor: (photo: MealPhotoRow) => string;
}) {
  const [open, setOpen] = useState<MealPhotoRow | null>(null);
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
      {photos.map((p) => (
        <GridThumb key={p.id} photo={p} label={captionFor(p)} onOpen={() => setOpen(p)} />
      ))}
      {open && (
        <PhotoViewer
          photo={open}
          by={nameOf(open.member_id)}
          canRemove={open.member_id === me.id || isHost}
          onRemove={() => onRemove(open).catch((e: unknown) => onError(e instanceof Error ? e.message : t('Something went wrong. Try again.')))}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function GridThumb({ photo, label, onOpen }: { photo: MealPhotoRow; label: string; onOpen: () => void }) {
  const url = usePhotoUrl(photo.path);
  return (
    <button type="button" className="press" aria-label={label} onClick={onOpen} style={{ position: 'relative', aspectRatio: '1', padding: 0, border: 'none', borderRadius: 14, overflow: 'hidden', background: 'var(--track)' }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}
