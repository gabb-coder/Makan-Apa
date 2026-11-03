/** A calendar event (.ics) for a meet-up, so it lands in the phone's calendar app. */

function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
}

export interface MeetupEvent {
  /** Stable per meet-up, so adding it again updates rather than duplicates. */
  uid: string;
  title: string;
  start: string;
  minutes?: number;
  place?: string | null;
  description?: string;
  /** For DTSTAMP; defaults to now. */
  now?: string;
}

export function meetupIcs({ uid, title, start, minutes = 60, place, description, now = new Date().toISOString() }: MeetupEvent): string {
  const end = new Date(Date.parse(start) + minutes * 60_000).toISOString();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Makan apa//Meet-up//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@makan-apa`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(title)}`,
    ...(place ? [`LOCATION:${escape(place)}`] : []),
    ...(description ? [`DESCRIPTION:${escape(description)}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Opens the event in the calendar app (phones offer "Add to calendar" for .ics files). */
export function openIcs(ics: string, fileName = 'makan-apa-meetup.ics') {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
