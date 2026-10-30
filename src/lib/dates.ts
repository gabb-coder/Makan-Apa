const TZ = 'Asia/Kuala_Lumpur';

/** e.g. "Fri 30 Oct". */
export function shortDate(d: Date, timeZone = TZ): string {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}
