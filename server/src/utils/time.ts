/** Timezone-aware calendar helpers. Location timezones rule — never server-local time. */

export interface TzParts {
  /** YYYY-MM-DD in the target zone. */
  date: string;
  /** HH:mm (24h, zero-padded) in the target zone. */
  time: string;
  /** 0=Sun..6=Sat day of week in the target zone. */
  dow: number;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_KEY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export function partsInTz(d: Date, tz: string): TzParts {
  try {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = Object.fromEntries(dtf.formatToParts(d).map((p) => [p.type, p.value]));
    const dow = DOW.indexOf(parts.weekday as (typeof DOW)[number]);
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: parts.hour === '24' ? `00:${parts.minute}` : `${parts.hour}:${parts.minute}`,
      dow: dow === -1 ? d.getUTCDay() : dow,
    };
  } catch {
    // Invalid timezone configured — fall back to UTC rather than crashing the scan.
    return {
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 16),
      dow: d.getUTCDay(),
    };
  }
}

export function dayKey(dow: number): string {
  return DAY_KEY[dow] ?? 'MON';
}

/** Minutes between two HH:mm strings (b - a). */
export function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}
