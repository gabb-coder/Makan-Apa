import { useMemo, useState } from 'react';
import { FoodSheet } from '../components/FoodSheet';
import { FoodTile } from '../components/FoodTile';
import { formatTag, isRecent, lastEatenLabel, popularTags, type Food, type FoodDraft } from '../lib/foods';
import { nextColor } from '../lib/palette';
import type { useFoods } from '../lib/useFoods';

type FoodsApi = ReturnType<typeof useFoods>;

interface Props {
  foods: Food[];
  api: Pick<FoodsApi, 'addFood' | 'updateFood' | 'deleteFood' | 'loadStarterPack'>;
  onError: (message: string) => void;
}

type Editing = { mode: 'add' } | { mode: 'edit'; food: Food } | null;

export function PoolScreen({ foods, api, onError }: Props) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [loadingPack, setLoadingPack] = useState(false);

  const active = useMemo(() => foods.filter((f) => f.isActive), [foods]);
  const archived = useMemo(() => foods.filter((f) => !f.isActive), [foods]);
  const tags = useMemo(() => popularTags(active, 8), [active]);
  const allTags = useMemo(() => popularTags(foods), [foods]);

  const q = query.trim().toLowerCase();
  const matches = (f: Food) =>
    (!tag || f.tags.includes(tag)) && (!q || f.name.toLowerCase().includes(q) || f.tags.some((t) => t.includes(q)));
  const shown = active.filter(matches);
  const shownArchived = archived.filter(matches);

  const countText =
    active.length === 0
      ? 'No foods yet'
      : tag || q
      ? `${shown.length} of ${active.length}${tag ? ` · ${formatTag(tag)}` : ''}`
      : `${active.length} option${active.length === 1 ? '' : 's'} · Recent = less likely on the wheel`;

  const loadPack = async () => {
    setLoadingPack(true);
    try {
      await api.loadStarterPack();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not load the starter pack.');
    } finally {
      setLoadingPack(false);
    }
  };

  const newDraft: FoodDraft = { name: '', tags: tag ? [tag] : [], icon: 'rice', color: nextColor(foods.length) };

  return (
    <main className="screen" style={{ gap: 14 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="eyebrow">{countText}</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h1 className="title">Food list</h1>
        <button
          type="button"
          className="press add-btn"
          onClick={() => setEditing({ mode: 'add' })}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 44,
            flexShrink: 0,
            padding: '0 16px 0 12px',
            border: 'none',
            borderRadius: 999,
            background: 'var(--accent)',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 800,
            boxShadow: '0 6px 14px rgba(204, 63, 23, 0.28)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add
        </button>
        </div>
      </header>

      {active.length < 2 && (
        <section
          className="fade-up"
          style={{
            background: 'var(--accent-tint)',
            borderRadius: 18,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--accent-ink)' }}>
              The wheel needs at least 2 foods
            </span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              Add your usual spots, or start with 8 Malaysian favourites and edit from there.
            </span>
          </div>
          <button type="button" className="btn btn--primary press" disabled={loadingPack} onClick={loadPack}>
            {loadingPack ? 'Loading…' : 'Load starter pack'}
          </button>
        </section>
      )}

      {active.length > 0 && (
        <>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <label htmlFor="food-search" className="sr-only">Search food</label>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#66666D"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              style={{ position: 'absolute', left: 16, top: 15 }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              id="food-search"
              type="search"
              className="input"
              placeholder="Search food or tags"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 44, fontSize: 15 }}
            />
          </div>

          {tags.length > 0 && (
            <div className="chip-row" role="group" aria-label="Filter by tag">
              <button type="button" className="chip press" aria-pressed={!tag} onClick={() => setTag(null)}>
                All
              </button>
              {tags.map((t) => (
                <button key={t} type="button" className="chip press" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  {formatTag(t)}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {shown.length > 0 && <FoodRows foods={shown} onOpen={(food) => setEditing({ mode: 'edit', food })} />}

      {active.length > 0 && shown.length === 0 && (
        <p style={{ margin: '8px 0', textAlign: 'center', fontSize: 14, color: 'var(--muted)' }}>
          Nothing matches. Try another search or tag.
        </p>
      )}

      {archived.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((s) => !s)}
            style={{
              alignSelf: 'flex-start',
              minHeight: 44,
              padding: 0,
              border: 'none',
              background: 'none',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--muted)',
            }}
          >
            {showArchived ? 'Hide' : 'Show'} archived · {archived.length}
          </button>
          {showArchived && shownArchived.length > 0 && (
            <div style={{ opacity: 0.7 }}>
              <FoodRows foods={shownArchived} onOpen={(food) => setEditing({ mode: 'edit', food })} />
            </div>
          )}
        </section>
      )}

      {editing && (
        <FoodSheet
          key={editing.mode === 'edit' ? editing.food.id : 'new'}
          food={editing.mode === 'edit' ? editing.food : null}
          initial={
            editing.mode === 'edit'
              ? { name: editing.food.name, tags: editing.food.tags, icon: editing.food.icon, color: editing.food.color, diet: editing.food.diet, price: editing.food.price }
              : newDraft
          }
          suggestedTags={allTags}
          onClose={() => setEditing(null)}
          onSave={(draft) => (editing.mode === 'edit' ? api.updateFood(editing.food.id, draft) : api.addFood(draft))}
          onArchive={editing.mode === 'edit' ? (archive) => api.updateFood(editing.food.id, { is_active: !archive }) : undefined}
          onDelete={editing.mode === 'edit' ? () => api.deleteFood(editing.food.id) : undefined}
        />
      )}
    </main>
  );
}

function FoodRows({ foods, onOpen }: { foods: Food[]; onOpen: (food: Food) => void }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      {foods.map((f, i) => (
        <button
          key={f.id}
          type="button"
          className="row"
          onClick={() => onOpen(f)}
          style={{ animation: `slideIn 0.45s ${(i * 0.05).toFixed(2)}s cubic-bezier(0.2, 0.8, 0.2, 1) both` }}
        >
          <FoodTile food={f} size={42} />
          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.name}
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.tags.length ? f.tags.map(formatTag).join(' · ') : 'No tags'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            {f.isActive && isRecent(f) && <span className="badge badge--recent">Recent</span>}
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{lastEatenLabel(f.daysSinceEaten)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
