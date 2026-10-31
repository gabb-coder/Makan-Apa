import { useEffect, useState } from 'react';
import { spotSuitability, suitsEveryone, type Needs } from '../lib/diet';
import { formatTag } from '../lib/foods';
import { dayHoursLabel, WEEKDAYS } from '../lib/hours';
import { distanceKm, formatDistance, mapsNearUrl, type LatLng } from '../lib/geo';
import { turnOffLocation, turnOnLocation, type LocationState } from '../lib/location';
import {
  AREA_CENTRES,
  byDistance,
  isNearSunway,
  NEAR_YOU_SEARCHES,
  NEARBY_LABEL,
  priceLabel,
  spotDetails,
  spotDistanceIsRough,
  spotDistanceKm,
  spotOpenNow,
  spotMapsUrl,
  SUNWAY_CENTRE,
  type Spot,
} from '../lib/nearby';
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

/** "~1.2 km" when the pin is only the street or area, "1.2 km" when it's the shop. */
function distanceText(spot: Spot, here: LatLng): string {
  return `${spotDistanceIsRough(spot) ? '~' : ''}${formatDistance(spotDistanceKm(spot, here))}`;
}

/** Green "Open · till 10pm" or grey "Closed · opens 11am"; nothing when hours are unknown. */
function OpenText({ spot, short = false }: { spot: Spot; short?: boolean }) {
  const now = spotOpenNow(spot);
  if (!now) return null;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: now.open ? 'var(--success)' : 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {short ? (now.open ? 'Open now' : 'Closed now') : now.label}
    </span>
  );
}

/** Horizontal strip of spot cards for Today. */
export function NearbyStrip({ spots, here, onOpen }: { spots: Spot[]; here?: LatLng; onOpen: (spot: Spot) => void }) {
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
            <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {here ? `${distanceText(s, here)} · ${s.area}` : s.area}
            </span>
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
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)', whiteSpace: 'nowrap' }}>{priceLabel(s.price)}</span>
            <OpenText spot={s} short />
          </span>
        </button>
      ))}
    </div>
  );
}

const ARROW = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--muted)', flexShrink: 0 }}>
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

const PIN = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

const listRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 44,
  padding: '6px 10px',
  borderRadius: 14,
  background: 'var(--bg)',
  color: 'var(--ink)',
  textDecoration: 'none',
} as const;

/**
 * Compact list for the "It's decided" card: where to get today's food near campus. With location
 * on, sorted by distance, and left out when you're far from Sunway.
 */
export function NearbyList({ spots, here }: { spots: Spot[]; here?: LatLng }) {
  const shown = !here ? spots : isNearSunway(here) ? byDistance(spots, here) : [];
  if (!shown.length) return null;
  return (
    <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
      <span className="section-label">{here ? 'Near you' : `Near ${NEARBY_LABEL}`}</span>
      {shown.map((s) => (
        <a key={s.id} href={spotMapsUrl(s)} target="_blank" rel="noreferrer" className="press" style={listRow}>
          <FoodTile food={s} size={32} />
          <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {here ? `${distanceText(s, here)} · ` : ''}
              {s.area} · {priceLabel(s.price)}
            </span>
            <OpenText spot={s} />
          </span>
          {ARROW}
        </a>
      ))}
    </div>
  );
}

/** Google Maps searches around you, for when you're away from Sunway. */
export function NearYouStrip({ here }: { here: LatLng }) {
  return (
    <div className="chip-row" style={{ gap: 10, paddingBottom: 4 }}>
      {NEAR_YOU_SEARCHES.map((q) => (
        <a
          key={q.label}
          href={mapsNearUrl(q.query, here)}
          target="_blank"
          rel="noreferrer"
          className="card lift"
          style={{
            width: 132,
            flexShrink: 0,
            padding: 12,
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <FoodTile food={q} size={36} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>{q.label}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {PIN(12)} Near you
          </span>
        </a>
      ))}
    </div>
  );
}

/** The line under the Today ideas: turn location on, see that it's on, or why it can't be. */
export function LocationLine({ location, nearSunway }: { location: LocationState; nearSunway: boolean }) {
  const link = { padding: '10px 0', border: 'none', background: 'none', fontSize: 13, fontWeight: 700, color: 'var(--accent)' } as const;
  const note = { fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' } as const;
  if (location.status === 'off')
    return (
      <button type="button" className="press" onClick={() => void turnOnLocation()} style={{ ...link, display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
        {PIN(15)} Use my location to find what's closest
      </button>
    );
  if (location.status === 'locating') return <span style={{ ...note, padding: '10px 0' }}>Finding where you are…</span>;
  if (location.status === 'denied')
    return (
      <span style={{ ...note, padding: '6px 0' }}>
        Location is blocked for this app. To use it, allow location for this site in your browser or phone settings, then turn it on in Settings.
      </span>
    );
  if (location.status === 'unavailable')
    return (
      <span style={{ ...note, padding: '6px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 8px' }}>
        Couldn't get your location.
        <button type="button" className="press" onClick={() => void turnOnLocation()} style={link}>
          Try again
        </button>
      </span>
    );
  return (
    <span style={{ ...note, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 8px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {PIN(13)}
        {nearSunway
          ? 'Closest to you first'
          : `You're ${formatDistance(distanceKm(location.here, SUNWAY_CENTRE))} from ${NEARBY_LABEL}`}
      </span>
      <button type="button" className="press" onClick={turnOffLocation} style={link}>
        Stop using location
      </button>
    </span>
  );
}

interface SheetProps {
  spot: Spot;
  here?: LatLng;
  inList: boolean;
  /** Present when it's my turn and today isn't decided. */
  pickLabel?: string;
  onClose: () => void;
  onAdd: () => void;
  onPick?: () => void;
}

export function SpotSheet({ spot, here, inList, pickLabel, onClose, onAdd, onPick }: SheetProps) {
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
          {here && (
            <span className="badge" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
              {spotDistanceIsRough(spot) ? 'About ' : ''}
              {formatDistance(spotDistanceKm(spot, here))} away
            </span>
          )}
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
        <SpotHours spot={spot} />
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
            {PIN(18)}
            Open in Google Maps
          </a>
          <button type="button" className="btn btn--secondary press" disabled={inList} onClick={onAdd}>
            {inList ? 'Already in your food list' : 'Add to food list'}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
          From local food guides and map listings. Hours change, so check Google Maps before a special trip.
        </p>
      </div>
    </div>
  );
}

const FILTERS: { label: string; test: (s: Spot) => boolean }[] = [
  { label: 'All', test: () => true },
  { label: 'Open now', test: (s) => spotOpenNow(s)?.open === true },
  { label: 'Halal', test: (s) => s.diet === 'halal' },
  { label: 'Under RM15', test: (s) => s.price === 1 },
  { label: 'Late night', test: (s) => s.tags.includes('late night') },
  { label: 'Rice', test: (s) => s.tags.includes('rice') },
  { label: 'Noodles', test: (s) => s.tags.includes('noodles') },
  { label: 'Korean', test: (s) => s.tags.includes('korean') },
  { label: 'Dessert', test: (s) => s.tags.includes('dessert') },
];

/** Today's hours with the whole week behind a tap. */
function SpotHours({ spot }: { spot: Spot }) {
  const [open, setOpen] = useState(false);
  const { hours, mallHours } = spotDetails(spot);
  if (!hours) return <span style={{ fontSize: 13, color: 'var(--muted)' }}>Opening hours not listed.</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, padding: 0, border: 'none', background: 'none', color: 'inherit', textAlign: 'left' }}
      >
        <span style={{ fontSize: 14 }}>
          <OpenText spot={spot} />
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{mallHours ? '(mall hours)' : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{open ? 'Hide hours' : 'All hours'}</span>
      </button>
      {open && (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '48px 1fr', rowGap: 4, fontSize: 13 }}>
          {WEEKDAYS.map((d, i) => (
            <div key={d} style={{ display: 'contents' }}>
              <dt style={{ fontWeight: 700 }}>{d}</dt>
              <dd style={{ margin: 0, color: 'var(--ink-2)' }}>{dayHoursLabel(hours[i])}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Every spot, grouped by area (nearest area first when location is on). */
interface AllProps {
  spots: Spot[];
  here?: LatLng;
  /** People in the room: with any diet or budget needs, "Suits everyone" is offered first. */
  members?: Needs[];
  onClose: () => void;
  onOpen: (spot: Spot) => void;
}

export function NearbyAllSheet({ spots: allSpots, here, members = [], onClose, onOpen }: AllProps) {
  const needs = members.some((m) => m.diet.length > 0 || m.budget);
  const filters = needs ? [FILTERS[0], { label: 'Suits everyone', test: (s: Spot) => suitsEveryone(spotSuitability(s), members) }, ...FILTERS.slice(1)] : FILTERS;
  const [filter, setFilter] = useState(needs ? 'Suits everyone' : 'All');
  const spots = allSpots.filter((filters.find((f) => f.label === filter) ?? filters[0]).test);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const areaKm = (area: string) => (here ? distanceKm(here, AREA_CENTRES[area] ?? SUNWAY_CENTRE) : 0);
  const areas = [...new Set(spots.map((s) => s.area))].sort((a, b) => areaKm(a) - areaKm(b));
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
          {filters.map((f) => (
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
            <span className="section-label">
              {area}
              {here && ` · ~${formatDistance(areaKm(area))}`}
            </span>
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
                      <OpenText spot={s} short />
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
