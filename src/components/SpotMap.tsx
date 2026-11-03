import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '../lib/geo';
import { t } from '../lib/i18n';
import { priceLabel, spotOpenNow, spotPoint, type Spot } from '../lib/nearby';

/**
 * Every place on a map (OpenStreetMap). Pins are green when open now, grey when closed, and amber
 * when the hours aren't listed; a tap opens the place. Loaded only when the map is opened.
 */
export default function SpotMap({ spots, here, onOpen }: { spots: Spot[]; here?: LatLng; onOpen: (spot: Spot) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const opened = useRef(onOpen);
  opened.current = onOpen;

  useEffect(() => {
    if (!box.current) return;
    const map = L.map(box.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const points: L.LatLngExpression[] = [];
    for (const s of spots) {
      const p = spotPoint(s);
      const open = spotOpenNow(s);
      const color = open === null ? '#B7791F' : open.open ? '#2F8F5B' : '#6B6B73';
      const marker = L.circleMarker([p.lat, p.lng], { radius: 9, color: '#FFFFFF', weight: 2, fillColor: color, fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(`${s.name} · ${priceLabel(s.price)}`, { direction: 'top', offset: [0, -8] });
      marker.on('click', () => opened.current(s));
      points.push([p.lat, p.lng]);
    }
    if (here) {
      L.circleMarker([here.lat, here.lng], { radius: 8, color: '#FFFFFF', weight: 3, fillColor: '#2F6FD6', fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(t('You are here'), { direction: 'top', offset: [0, -8] });
      points.push([here.lat, here.lng]);
    }
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 16 });
    else map.setView([3.0673, 101.6038], 15);
    // The sheet animates open; size the map once it's settled.
    const timer = window.setTimeout(() => map.invalidateSize(), 350);
    return () => {
      window.clearTimeout(timer);
      map.remove();
    };
  }, [spots, here]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div ref={box} data-no-swipe role="application" aria-label={t('Map of places')} style={{ height: '58dvh', minHeight: 320, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
        {(
          [
            ['#2F8F5B', t('Open now')],
            ['#6B6B73', t('Closed now')],
            ['#B7791F', t('Hours not listed')],
          ] as const
        ).map(([c, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: c }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
