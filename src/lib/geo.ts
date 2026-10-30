export interface LatLng {
  lat: number;
  lng: number;
}

/** Straight-line distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number): string {
  if (km < 0.95) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** A Google Maps search for `query` centred on where you are. */
export function mapsNearUrl(query: string, here: LatLng): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${here.lat.toFixed(5)},${here.lng.toFixed(5)},15z`;
}
