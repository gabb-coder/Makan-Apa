import { useEffect, useState } from 'react';
import { formatTag, normalizeTag, type Food, type FoodDraft } from '../lib/foods';
import { COLOR_KEYS, FOOD_COLORS, ICONS } from '../lib/palette';
import { FoodIcon } from './FoodIcon';
import { FoodTile } from './FoodTile';

interface Props {
  /** The food being edited, or null when adding. */
  food: Food | null;
  initial: FoodDraft;
  suggestedTags: string[];
  onClose: () => void;
  onSave: (draft: FoodDraft) => Promise<void>;
  onArchive?: (archived: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function FoodSheet({ food, initial, suggestedTags, onClose, onSave, onArchive, onDelete }: Props) {
  const [draft, setDraft] = useState<FoodDraft>(initial);
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof FoodDraft>(key: K, value: FoodDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw.replace(/,/g, ''));
    if (tag && !draft.tags.includes(tag)) set('tags', [...draft.tags, tag]);
    setTagInput('');
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const name = draft.name.trim();
  const save = () => {
    const pending = normalizeTag(tagInput);
    const tags = pending && !draft.tags.includes(pending) ? [...draft.tags, pending] : draft.tags;
    return act(() => onSave({ ...draft, name, tags }));
  };

  const unusedSuggestions = suggestedTags.filter((t) => !draft.tags.includes(t)).slice(0, 8);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center' }} />

        <header style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <FoodTile food={draft} size={56} style={{ borderRadius: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexGrow: 1 }}>
            <span className="eyebrow">{food ? (food.isActive ? 'Edit food' : 'Archived food') : 'New food'}</span>
            <h2 id="food-sheet-title" className="title title--sm" style={{ fontSize: 24, overflowWrap: 'anywhere' }}>
              {name || 'Untitled'}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <form
          id="food-form"
          style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (name && !busy) save();
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="food-name" className="field-label">Name</label>
            <input
              id="food-name"
              className="input"
              value={draft.name}
              maxLength={40}
              placeholder="e.g. Banana Leaf"
              autoFocus={!food}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="food-tag" className="field-label">Tags</label>
            {draft.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {draft.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="chip press"
                    aria-pressed="true"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => set('tags', draft.tags.filter((x) => x !== t))}
                  >
                    {formatTag(t)}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
            <input
              id="food-tag"
              className="input"
              value={tagInput}
              maxLength={24}
              placeholder="Add a tag, then press Enter"
              enterKeyHint="done"
              onChange={(e) => (e.target.value.endsWith(',') ? addTag(e.target.value) : setTagInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
            />
            {unusedSuggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {unusedSuggestions.map((t) => (
                  <button key={t} type="button" className="chip chip--ghost press" onClick={() => addTag(t)}>
                    + {formatTag(t)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend className="field-label" style={{ padding: 0, marginBottom: 8 }}>Icon</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
              {ICONS.map((icon) => {
                const on = draft.icon === icon;
                return (
                  <button
                    key={icon}
                    type="button"
                    className="press"
                    aria-pressed={on}
                    aria-label={icon}
                    onClick={() => set('icon', icon)}
                    style={{
                      height: 48,
                      borderRadius: 14,
                      border: `2px solid ${on ? 'var(--ink)' : 'transparent'}`,
                      background: FOOD_COLORS[draft.color].tile,
                      color: FOOD_COLORS[draft.color].ink,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FoodIcon icon={icon} />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend className="field-label" style={{ padding: 0, marginBottom: 8 }}>Colour</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 6 }}>
              {COLOR_KEYS.map((c) => {
                const on = draft.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    className="press"
                    aria-pressed={on}
                    aria-label={c}
                    onClick={() => set('color', c)}
                    style={{
                      height: 44,
                      padding: 0,
                      borderRadius: 999,
                      border: 'none',
                      background: FOOD_COLORS[c].slice,
                      boxShadow: on ? 'inset 0 0 0 3px var(--surface), 0 0 0 2px var(--ink)' : 'none',
                    }}
                  />
                );
              })}
            </div>
          </fieldset>
        </form>

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: '#b42318' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="submit" form="food-form" className="btn btn--primary press" style={{ height: 52 }} disabled={!name || busy}>
            {food ? 'Save changes' : 'Add to list'}
          </button>
          {food && onArchive && (
            <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => act(() => onArchive(food.isActive))}>
              {food.isActive ? 'Archive (hide from wheel)' : 'Restore to list'}
            </button>
          )}
          {food && onDelete && (
            <button
              type="button"
              className="btn btn--danger press"
              data-armed={confirmDelete}
              disabled={busy}
              onClick={() => (confirmDelete ? act(onDelete) : setConfirmDelete(true))}
            >
              {confirmDelete ? 'Tap again to delete for good' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
