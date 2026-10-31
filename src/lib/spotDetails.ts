import type { LatLng } from './geo';

/**
 * Where each spot is and when it's open, from Google Maps data (via Wanderlog), OpenStreetMap,
 * mall directories and food guides (October 2026). Hours are Monday first, "HH:MM-HH:MM" ranges,
 * comma separated; '' is closed; a range can run past midnight ("15:00-03:00").
 *
 * pin: 'exact' is the shop itself, 'building' the mall or campus it's in, 'street' its street
 * (within ~250 m).
 */
export interface SpotDetails {
  at?: LatLng;
  pin?: 'exact' | 'building' | 'street';
  hours?: string[];
  /** The mall's opening hours, used where the shop's own aren't published. */
  mallHours?: boolean;
}

const MALL_HOURS = Array(7).fill('10:00-22:00');

export const SPOT_DETAILS: Record<string, SpotDetails> = {
  'campus-cafeterias': { at: { lat: 3.06717, lng: 101.60386 }, pin: 'building' },
  'warung-pojok': { at: { lat: 3.0783, lng: 101.60914 }, pin: 'exact', hours: ['12:00-21:30', '12:00-21:30', '12:00-21:30', '12:00-21:30', '12:00-21:30', '12:00-21:30', '12:00-21:30'] },
  'lai-kong': { at: { lat: 3.07507, lng: 101.61041 }, pin: 'street', hours: ['00:00-24:00', '00:00-24:00', '00:00-24:00', '00:00-24:00', '00:00-24:00', '00:00-24:00', '00:00-24:00'] },
  'restoran-jaring': { at: { lat: 3.07575, lng: 101.6132 }, pin: 'exact', hours: ['07:00-17:30', '07:00-17:30', '07:00-17:30', '07:00-17:30', '07:00-17:30', '07:00-17:30', ''] },
  'garlic-chicken-rice': { at: { lat: 3.06745, lng: 101.60312 }, pin: 'exact', hours: ['07:00-15:00', '07:00-15:00', '07:00-15:00', '07:00-15:00', '07:00-15:00', '08:00-15:00', ''] },
  'powertea-lok-lok': { at: { lat: 3.0704, lng: 101.6028 }, pin: 'street', hours: ['18:00-01:00', '18:00-01:00', '18:00-01:00', '18:00-01:00', '18:00-01:00', '18:00-01:00', '18:00-01:00'] },
  'ayam-gepuk-artisan': { at: { lat: 3.06851, lng: 101.60209 }, pin: 'exact' },
  'madam-tiow': { at: { lat: 3.0756, lng: 101.61257 }, pin: 'street' },
  'food-by-fat-cat': { at: { lat: 3.06481, lng: 101.60885 }, pin: 'building', hours: ['10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00'] },
  'roast-meat-shop': { at: { lat: 3.06481, lng: 101.60885 }, pin: 'building', hours: ['', '10:30-20:30', '10:30-20:30', '10:30-20:30', '10:30-18:30', '10:30-20:30', '10:30-20:30'] },
  'lim-ko-pi': { at: { lat: 3.06481, lng: 101.60885 }, pin: 'building', hours: ['08:00-21:00', '08:00-21:00', '08:00-21:00', '08:00-21:00', '08:00-21:00', '09:00-17:00', ''] },
  'chon-dak': { at: { lat: 3.0652, lng: 101.60988 }, pin: 'exact', hours: ['10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00'] },
  'verythai-mookata': { at: { lat: 3.06459, lng: 101.60941 }, pin: 'exact', hours: ['11:00-22:00', '11:00-22:00', '11:00-22:00', '11:00-22:00', '11:00-22:00', '11:00-22:00', '11:00-22:00'] },
  'village-roast-duck': { at: { lat: 3.07282, lng: 101.60805 }, pin: 'exact', hours: ['10:00-21:00', '10:00-21:00', '10:00-21:00', '10:00-21:00', '10:00-21:00', '10:00-21:00', '10:00-21:00'] },
  'esquire-kitchen': { at: { lat: 3.07251, lng: 101.60708 }, pin: 'building', hours: MALL_HOURS, mallHours: true },
  'seminyak': { at: { lat: 3.07357, lng: 101.60816 }, pin: 'exact' },
  'dozo': { at: { lat: 3.0646, lng: 101.60579 }, pin: 'building', hours: MALL_HOURS, mallHours: true },
  'jp-and-co': { at: { lat: 3.0646, lng: 101.60579 }, pin: 'building', hours: MALL_HOURS, mallHours: true },
  'shiang-hai-vegetarian': { at: { lat: 3.07505, lng: 101.61239 }, pin: 'exact', hours: ['11:00-21:00', '11:00-21:00', '11:00-21:00', '11:00-21:00', '11:00-21:00', '11:00-21:00', '11:00-21:00'] },
  'supamala-hotpot': { at: { lat: 3.07169, lng: 101.60655 }, pin: 'exact', hours: ['11:00-23:00', '11:00-23:00', '11:00-23:00', '11:00-23:00', '11:00-23:00', '11:00-23:00', '11:00-23:00'] },
  'tea-garden': { at: { lat: 3.07219, lng: 101.60787 }, pin: 'exact', hours: ['09:30-22:00', '09:30-22:00', '09:30-22:00', '09:30-22:00', '09:30-22:00', '09:00-22:00', '09:00-22:00'] },
  'bananabro': { at: { lat: 3.07251, lng: 101.60708 }, pin: 'building', hours: MALL_HOURS, mallHours: true },
  'ayam-penyet-express': { at: { lat: 3.07208, lng: 101.60635 }, pin: 'exact', hours: ['10:30-21:30', '10:30-21:30', '10:30-21:30', '10:30-21:30', '10:30-21:30', '10:30-21:30', '10:30-21:30'] },
  'bungkus-kaw-kaw': { at: { lat: 3.07251, lng: 101.60708 }, pin: 'building', hours: MALL_HOURS, mallHours: true },
  'nak-nak': { at: { lat: 3.07251, lng: 101.60708 }, pin: 'building', hours: ['11:00-22:00', '11:00-22:00', '11:00-22:00', '11:00-22:00', '11:00-22:00', '11:00-22:00', '11:00-22:00'] },
  'cili-kampung': { at: { lat: 3.07359, lng: 101.60849 }, pin: 'exact' },
  'nasi-kandar-pelita': { at: { lat: 3.07209, lng: 101.61033 }, pin: 'exact', hours: ['00:00-24:00', '00:00-24:00', '00:00-24:00', '00:00-24:00', '00:00-24:00', '00:00-24:00', '00:00-24:00'] },
  'burger-baek': { at: { lat: 3.0758, lng: 101.60934 }, pin: 'exact', hours: ['15:00-03:00', '15:00-03:00', '15:00-03:00', '15:00-03:00', '15:00-03:00', '15:00-03:00', '15:00-03:00'] },
  'gold-chilli': { at: { lat: 3.07444, lng: 101.58677 }, pin: 'exact', hours: ['12:00-23:30', '12:00-23:30', '12:00-23:30', '12:00-23:30', '12:00-23:30', '12:00-23:30', '12:00-23:30'] },
  'super-kitchen-pan-mee': { at: { lat: 3.07406, lng: 101.58882 }, pin: 'street', hours: ['08:30-21:30', '08:30-21:30', '08:30-21:30', '08:30-21:30', '08:30-21:30', '08:30-21:30', '08:30-21:30'] },
  'lim-fried-chicken': { at: { lat: 3.07616, lng: 101.58965 }, pin: 'exact', hours: ['10:00-21:00', '10:00-21:00', '10:00-21:00', '10:00-21:00', '10:00-21:00', '10:00-21:00', '10:00-21:00'] },
  'rata': { at: { lat: 3.07959, lng: 101.59267 }, pin: 'exact', hours: ['11:30-23:30', '11:30-23:30', '11:30-23:30', '11:30-23:30', '11:30-24:00', '11:30-24:00', '11:30-24:00'] },
  'q-bistro': { at: { lat: 3.07818, lng: 101.58855 }, pin: 'exact', hours: ['07:00-01:00', '07:00-01:00', '07:00-01:00', '07:00-01:00', '07:00-02:00', '07:00-02:00', '07:00-02:00'] },
  'uncle-soon-fried-rice': { at: { lat: 3.07735, lng: 101.58993 }, pin: 'exact', hours: ['10:30-20:30', '10:30-20:30', '10:30-20:30', '10:30-20:30', '10:30-20:30', '10:30-20:30', '10:30-20:30'] },
  'xiao-yu': { at: { lat: 3.07516, lng: 101.58762 }, pin: 'street' },
  'mad-bebek': { at: { lat: 3.07632, lng: 101.5887 }, pin: 'street' },
  'warong-samad': { at: { lat: 3.07632, lng: 101.5887 }, pin: 'street' },
  'naj-and-belle': { at: { lat: 3.07795, lng: 101.58645 }, pin: 'exact', hours: ['10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00', '10:00-22:00'] },
  'fatbaby-ice-cream': { at: { lat: 3.07632, lng: 101.5887 }, pin: 'street', hours: ['', '', '13:00-22:00', '13:00-22:00', '13:00-22:00', '13:00-22:00', '13:00-22:00'] },
};
