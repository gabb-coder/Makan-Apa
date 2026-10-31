import { useEffect, useState } from 'react';
import { spotSuitability, suitsEveryone, type Needs } from '../lib/diet';
import { formatTag } from '../lib/foods';
import { dayHoursLabel, WEEKDAYS, weekdayLabel } from '../lib/hours';
import { t, tk } from '../lib/i18n';
import { distanceKm, formatDistance, mapsNearUrl, type LatLng } from '../lib/geo';
import { turnOffLocation, turnOnLocation, type LocationState } from '../lib/location';
import {
  AREA_CENTRES,
  byDistance,
  isNearSunway,
  NEAR_YOU_SEARCHES,
  NEARBY_LABEL,
  priceLabel,
  spotArea,
  spotDetails,
  spotDistanceIsRough,
  spotDistanceKm,
  spotKnownFor,
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
      {diet === 'halal' ? t('Halal') : t('Serves pork')}
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
      {short ? (now.open ? t('Open now') : t('Closed now')) : now.label}
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
              {here ? `${distanceText(s, here)} · ${spotArea(s)}` : spotArea(s)}
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
            {spotKnownFor(s)}
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
      <span className="section-label">{here ? t('Near you') : t('Near {place}', { place: NEARBY_LABEL })}</span>
      {shown.map((s) => (
        <a key={s.id} href={spotMapsUrl(s)} target="_blank" rel="noreferrer" className="press" style={listRow}>
          <FoodTile food={s} size={32} />
          <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {here ? `${distanceText(s, here)} · ` : ''}
              {spotArea(s)} · {priceLabel(s.price)}
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
          <span style={{ fontSize: 14, fontWeight: 800 }}>{t(q.label)}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {PIN(12)} {t('Near you')}
          </span>
        </a>
      ))}
    </div>
  );
}

/** The line under the Today ideas: turn location on, see that it's on, or why it can't be. */
export function LocationLine({ location, nearSunway }: { location: LocationState; nearSunway: boolean }) {
  const link = { padding: '10px 0', border: 'none', background: 'none', fontSize: 13, fontWeight: 700, color: 'var(--accent-text)' } as const;
  const note = { fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' } as const;
  if (location.status === 'off')
    return (
      <button type="button" className="press" onClick={() => void turnOnLocation()} style={{ ...link, display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
        {PIN(15)} {t("Use my location to find what's closest")}
      </button>
    );
  if (location.status === 'locating') return <span style={{ ...note, padding: '10px 0' }}>{t('Finding where you are…')}</span>;
  if (location.status === 'denied')
    return (
      <span style={{ ...note, padding: '6px 0' }}>
        {t('Location is blocked for this app. To use it, allow location for this site in your browser or phone settings, then turn it on in Settings.')}
      </span>
    );
  if (location.status === 'unavailable')
    return (
      <span style={{ ...note, padding: '6px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 8px' }}>
        {t("Couldn't get your location.")}
        <button type="button" className="press" onClick={() => void turnOnLocation()} style={link}>
          {t('Try again')}
        </button>
      </span>
    );
  return (
    <span style={{ ...note, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 8px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {PIN(13)}
        {nearSunway
          ? t('Closest to you first')
          : t("You're {distance} from {place}", { distance: formatDistance(distanceKm(location.here, SUNWAY_CENTRE)), place: NEARBY_LABEL })}
      </span>
      <button type="button" className="press" onClick={turnOffLocation} style={link}>
        {t('Stop using location')}
      </button>
    </span>
  );
}

interface SheetProps {
  spot: Spot;
  here?: LatLng;
  /** Who added a room spot, and removing it. */
  addedBy?: string;
  onRemove?: () => void;
  inList: boolean;
  /** Present when it's my turn and today isn't decided. */
  pickLabel?: string;
  onClose: () => void;
  onAdd: () => void;
  onPick?: () => void;
}

export function SpotSheet({ spot, here, addedBy, onRemove, inList, pickLabel, onClose, onAdd, onPick }: SheetProps) {
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
            <span className="eyebrow">
              {spot.room
                ? addedBy
                  ? t("Your room's spot · added by {name}", { name: addedBy })
                  : t("Your room's spot")
                : t('Near {place} · {area}', { place: NEARBY_LABEL, area: spot.area })}
            </span>
            <h2 id="spot-title" className="title title--sm" style={{ fontSize: 24, overflowWrap: 'anywhere' }}>
              {spot.name}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{spotKnownFor(spot)}.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {here && (
            <span className="badge" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
              {spotDistanceIsRough(spot)
                ? t('About {distance} away', { distance: formatDistance(spotDistanceKm(spot, here)) })
                : t('{distance} away', { distance: formatDistance(spotDistanceKm(spot, here)) })}
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
        {spot.room ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>{spotArea(spot)}</span> : <SpotHours spot={spot} />}
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
            {t('Open in Google Maps')}
          </a>
          <button type="button" className="btn btn--secondary press" disabled={inList} onClick={onAdd}>
            {inList ? t('Already in your food list') : t('Add to food list')}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
          {spot.room ? t('Added by someone in your room.') : t('From local food guides and map listings. Hours change, so check Google Maps before a special trip.')}
        </p>
        {onRemove && (
          <button type="button" className="btn btn--danger press" onClick={onRemove} style={{ height: 44 }}>
            {t("Remove from your room's spots")}
          </button>
        )}
      </div>
    </div>
  );
}

// Labels stay English as filter ids and are shown with t().
const FILTERS: { label: string; test: (s: Spot) => boolean }[] = [
  { label: tk('All'), test: () => true },
  { label: tk('Open now'), test: (s) => spotOpenNow(s)?.open === true },
  { label: tk('Halal'), test: (s) => s.diet === 'halal' },
  { label: tk('Under RM15'), test: (s) => s.price === 1 },
  { label: tk('Late night'), test: (s) => s.tags.includes('late night') },
  { label: tk('Rice'), test: (s) => s.tags.includes('rice') },
  { label: tk('Noodles'), test: (s) => s.tags.includes('noodles') },
  { label: tk('Korean'), test: (s) => s.tags.includes('korean') },
  { label: tk('Dessert'), test: (s) => s.tags.includes('dessert') },
];

/** Today's hours with the whole week behind a tap. */
function SpotHours({ spot }: { spot: Spot }) {
  const [open, setOpen] = useState(false);
  const { hours, mallHours } = spotDetails(spot);
  if (!hours) return <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Opening hours not listed.')}</span>;
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
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{mallHours ? t('(mall hours)') : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--accent-text)' }}>{open ? t('Hide hours') : t('All hours')}</span>
      </button>
      {open && (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '48px 1fr', rowGap: 4, fontSize: 13 }}>
          {WEEKDAYS.map((d, i) => (
            <div key={d} style={{ display: 'contents' }}>
              <dt style={{ fontWeight: 700 }}>{weekdayLabel(i)}</dt>
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
  /** Places the room added, listed first. */
  roomSpots?: Spot[];
  onAddSpot?: () => void;
  here?: LatLng;
  /** People in the room: with any diet or budget needs, "Suits everyone" is offered first. */
  members?: Needs[];
  onClose: () => void;
  onOpen: (spot: Spot) => void;
}

export function NearbyAllSheet({ spots: allSpots, roomSpots = [], onAddSpot, here, members = [], onClose, onOpen }: AllProps) {
  const needs = members.some((m) => (m.diet?.length ?? 0) > 0 || m.budget);
  const filters = needs ? [FILTERS[0], { label: tk('Suits everyone'), test: (s: Spot) => suitsEveryone(spotSuitability(s), members) }, ...FILTERS.slice(1)] : FILTERS;
  const [filter, setFilter] = useState(needs ? 'Suits everyone' : 'All');
  const test = (filters.find((f) => f.label === filter) ?? filters[0]).test;
  const spots = allSpots.filter(test);
  const ours = roomSpots.filter((s) => test(s) || filter === 'Open now');
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
            <span className="eyebrow">{t('{n} places from local food guides', { n: allSpots.length })}</span>
            <h2 id="nearby-title" className="title title--sm" style={{ fontSize: 24 }}>
              {t('Near {place}', { place: NEARBY_LABEL })}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="chip-row" role="group" aria-label={t('Filter places')} style={{ flexShrink: 0 }}>
          {filters.map((f) => (
            <button key={f.label} type="button" className="chip press" aria-pressed={filter === f.label} onClick={() => setFilter(f.label)}>
              {t(f.label)}
            </button>
          ))}
        </div>
        {filter === 'Halal' && (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
            {t('Only places a source describes as halal. Others may be halal too; check before you go.')}
          </p>
        )}
        {(ours.length > 0 || onAddSpot) && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="section-label">{t("Your room's spots")}</span>
            {ours.length > 0 && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {ours.map((s) => (
                  <button key={s.id} type="button" className="row" onClick={() => onOpen(s)}>
                    <FoodTile food={s} size={40} />
                    <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {here && s.details?.at ? `${distanceText(s, here)} · ` : ''}
                        {spotKnownFor(s)}
                      </span>
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <DietBadge diet={s.diet} />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{priceLabel(s.price)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {onAddSpot && (
              <button type="button" className="btn btn--secondary press" onClick={onAddSpot}>
                {t('Add a place')}
              </button>
            )}
          </section>
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

interface AddSpotProps {
  here?: LatLng;
  onSave: (spot: { name: string; area: string | null; note: string | null; price: number | null; diet: 'halal' | 'pork' | null; lat: number | null; lng: number | null }) => Promise<void>;
  onClose: () => void;
}

/** Add a place for the whole room: name, where, what it's known for, price, and optionally a pin. */
export function AddSpotSheet({ here, onSave, onClose }: AddSpotProps) {
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [note, setNote] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [diet, setDiet] = useState<'halal' | 'pork' | null>(null);
  const [pinHere, setPinHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        area: area.trim() || null,
        note: note.trim() || null,
        price,
        diet,
        lat: pinHere && here ? here.lat : null,
        lng: pinHere && here ? here.lng : null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not add that place.'));
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-spot-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center' }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="add-spot-title" className="title title--sm" style={{ fontSize: 24 }}>
            {t('Add a place')}
          </h2>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="spot-name" className="field-label">{t('Name')}</label>
          <input id="spot-name" className="input" maxLength={60} autoFocus placeholder={t('e.g. Restoran Yong')} value={name} onChange={(e) => setName(e.target.value)} style={{ height: 50 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="spot-area" className="field-label">{t('Where')} <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{t('(optional)')}</span></label>
          <input id="spot-area" className="input" maxLength={60} placeholder={t('e.g. SS15, or Sunway Pyramid LG2')} value={area} onChange={(e) => setArea(e.target.value)} style={{ height: 50 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="spot-note" className="field-label">{t('Known for')} <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{t('(optional)')}</span></label>
          <input id="spot-note" className="input" maxLength={200} placeholder={t('e.g. Claypot chicken rice, closed Mondays')} value={note} onChange={(e) => setNote(e.target.value)} style={{ height: 50 }} />
        </div>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 8 }}>{t('Price per person')}</legend>
          <div className="segmented" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {([[null, tk('Not sure')], [1, tk('Under RM15')], [2, 'RM15–50'], [3, 'RM50+']] as const).map(([v, label]) => (
              <button key={label} type="button" aria-pressed={price === v} onClick={() => setPrice(v)} style={{ fontSize: 13 }}>
                {t(label)}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 8 }}>{t('Diet')}</legend>
          <div className="segmented" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {([[null, tk('Not sure')], ['halal', tk('Halal')], ['pork', tk('Serves pork')]] as const).map(([v, label]) => (
              <button key={label} type="button" aria-pressed={diet === v} onClick={() => setDiet(v)} style={{ fontSize: 13 }}>
                {t(label)}
              </button>
            ))}
          </div>
        </fieldset>
        {here && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
            <input type="checkbox" checked={pinHere} onChange={(e) => setPinHere(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 14 }}>{t("I'm there now: pin it where I am")}</span>
          </label>
        )}
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary press" disabled={busy || !name.trim()} style={{ height: 52 }}>
          {busy ? t('Adding…') : t('Add for the whole room')}
        </button>
      </form>
    </div>
  );
}
