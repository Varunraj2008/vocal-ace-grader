/**
 * Timestamps are stored in UTC in the database. The UI always renders them in
 * India Standard Time (Asia/Kolkata) using a single, consistent format:
 *   01 Aug 2026, 09:25 AM IST
 */
export const APP_TIMEZONE = "Asia/Kolkata";
const TZ_LABEL = "IST";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "01 Aug 2026, 09:25 AM IST" */
export function formatDateTime(value: string | number | Date | null | undefined, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  return `${dateTimeFmt.format(d).replace(",", ",")} ${TZ_LABEL}`;
}

/** "01 Aug 2026" */
export function formatDate(value: string | number | Date | null | undefined, fallback = "—") {
  const d = toDate(value);
  return d ? dateFmt.format(d) : fallback;
}

/** "3 hours ago" style relative label, falling back to the absolute IST time. */
export function formatRelative(value: string | number | Date | null | undefined, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDateTime(d);
}
