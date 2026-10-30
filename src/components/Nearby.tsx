import { useEffect, useState } from 'react';
import { formatTag } from '../lib/foods';
import { NEARBY_LABEL, priceLabel, spotMapsUrl, type Spot } from '../lib/nearby';
import { FoodTile } from './FoodTile';

function DietBadge({ diet }: { diet: Spot['diet'] }) {
  if (!diet) return null;
  return (
    <span
      className="badge"
      style={diet === 'halal' ? { background: '#DDEFD8', color: '#2F6B2A' } : { background: 'var(--bar-track)', color: 'var(--ink-2)' }}
    >
      {diet === 'halal' ? 'Halal' : 'Serves pork'}
    </span>
  );
}

/** Horizontal strip of spot cards for Today. */
export function NearbyStrip({ spots, onOpen }: { spots: Spot[]; onOpen: (spot: Spot) => void }) {
  return (
    <div className="chip-row" style={{ gap: 10, paddingBottom: 4 }}>
      {spots.map((s) => (
        <button
          key={s.id}
          type="button"
          className="card lift"
          onClick={() => onOpen(s)}
          style={{
            width: 168,
            flexShrink: 0,
            padding: 12,
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            textAlign: 'left',
            color: 'inherit',
          }}
        >
          <FoodTile food={s} size={36} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.area}</span>
          </span>
          <span
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              color: 'var(--ink-2)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: 34,
            }}
          >
            {s.knownFor}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)' }}>{priceLabel(s.price)}</span>
        </button>
      ))}
    </div>
  );
}

/** Compact list for the "It's decided" card: where to get today's food near campus. */
export function NearbyList({ spots }: { spots: Spot[] }) {
  if (!spots.length) return null;
  return (
    <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
      <span className="section-label">Near {NEARBY_LABEL}</span>
      {spots.map((s) => (
        <a
          key={s.id}
          href={spotMapsUrl(s)}
          target="_blank"
          rel="noreferrer"
          className="press"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minHeight: 44,
            padding: '6px 10px',
            borderRadius: 14,
            background: 'var(--bg)',
            color: 'var(--ink)',
            textDecoration: 'none',
          }}
        >
          <FoodTile food={s} size={32} />
          <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {s.area} · {priceLabel(s.price)}
            </span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--muted)', flexShrink: 0 }}>
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </a>
      ))}
    </div>
  );
}

interface SheetProps {
  spot: Spot;
  inList: boolean;
  /** Present when it's my turn and today isn't decided. */
  pickLabel?: string;
  onClose: () => void;
  onAdd: () => void;
  onPick?: () => void;
}

export function SpotSheet({ spot, inList, pickLabel, onClose, onAdd, onPick }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="spot-title" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center' }} />
        <header style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <FoodTile food={spot} size={56} style={{ borderRadius: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexGrow: 1 }}>
            <span className="eyebrow">Near {NEARBY_LABEL} · {spot.area}</span>
            <h2 id="spot-title" className="title title--sm" style={{ fontSize: 24, overflowWrap: 'anywhere' }}>
              {spot.name}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{spot.knownFor}.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span className="badge" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
            {priceLabel(spot.price)}
          </span>
          <DietBadge diet={spot.diet} />
          {spot.tags.map((t) => (
            <span key={t} className="badge" style={{ background: 'var(--bar-track)', color: 'var(--ink-2)' }}>
              {formatTag(t)}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {onPick && pickLabel && (
            <button type="button" className="btn btn--primary press" style={{ height: 52 }} onClick={onPick}>
              {pickLabel}
            </button>
          )}
          <a
            href={spotMapsUrl(spot)}
            target="_blank"
            rel="noreferrer"
            className="btn press"
            style={{ height: 52, background: 'var(--ink)', color: 'var(--on-ink)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            Open in Google Maps
          </a>
          <button type="button" className="btn btn--secondary press" disabled={inList} onClick={onAdd}>
            {inList ? 'Already in your food list' : 'Add to food list'}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
          From local food guides. Check Google Maps for current hours before you go.
        </p>
      </div>
    </div>
  );
}

/** Every spot, grouped by area. */
const FILTERS: { label: string; test: (s: Spot) => boolean }[] = [
  { label: 'All', test: () => true },
  { label: 'Halal', test: (s) => s.diet === 'halal' },
  { label: 'Under RM15', test: (s) => s.price === 1 },
  { label: 'Late night', test: (s) => s.tags.includes('late night') },
  { label: 'Rice', test: (s) => s.tags.includes('rice') },
  { label: 'Noodles', test: (s) => s.tags.includes('noodles') },
  { label: 'Korean', test: (s) => s.tags.includes('korean') },
  { label: 'Dessert', test: (s) => s.tags.includes('dessert') },
];

export function NearbyAllSheet({ spots: allSpots, onClose, onOpen }: { spots: Spot[]; onClose: () => void; onOpen: (spot: Spot) => void }) {
  const [filter, setFilter] = useState('All');
  const spots = allSpots.filter((FILTERS.find((f) => f.label === filter) ?? FILTERS[0]).test);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const areas = [...new Set(spots.map((s) => s.area))];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="nearby-title" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center' }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">{allSpots.length} places from local food guides</span>
            <h2 id="nearby-title" className="title title--sm" style={{ fontSize: 24 }}>
              Near {NEARBY_LABEL}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="chip-row" role="group" aria-label="Filter places" style={{ flexShrink: 0 }}>
          {FILTERS.map((f) => (
            <button key={f.label} type="button" className="chip press" aria-pressed={filter === f.label} onClick={() => setFilter(f.label)}>
              {f.label}
            </button>
          ))}
        </div>
        {filter === 'Halal' && (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
            Only places a source describes as halal. Others may be halal too; check before you go.
          </p>
        )}
        {areas.map((area) => (
          <section key={area} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="section-label">{area}</span>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {spots
                .filter((s) => s.area === area)
                .map((s) => (
                  <button key={s.id} type="button" className="row" onClick={() => onOpen(s)}>
                    <FoodTile food={s} size={40} />
                    <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.knownFor}</span>
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <DietBadge diet={s.diet} />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{priceLabel(s.price)}</span>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
