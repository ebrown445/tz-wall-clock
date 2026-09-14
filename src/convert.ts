// Converts a wall-clock date/time in one IANA timezone to the wall-clock
// date/time in another, using only the Intl data that ships with the JS
// runtime (no timezone database of our own to maintain).

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export type ResolveStatus = "unique" | "ambiguous" | "gap";

export interface ResolveResult {
  /** Best UTC instant (ms since epoch) for the requested wall time. */
  utc: number;
  offsetMinutes: number;
  status: ResolveStatus;
  /**
   * Only set when status is "ambiguous": the later of the two UTC instants
   * that both display as the requested wall time (a fall-back overlap).
   */
  alternateUtc?: number;
}

export interface ConversionResult {
  wall: WallTime;
  utc: number;
  status: ResolveStatus;
  /** Named offset the target zone uses at `utc`, e.g. "EDT" or "GMT+5:45". */
  zoneName: string;
  alternateWall?: WallTime;
  /** Named offset the target zone uses at `alternateUtc`, for ambiguous results. */
  alternateZoneName?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function wallTimeAsUtcMs(w: WallTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

/** Reads the wall-clock fields a given instant displays as in `timeZone`. */
function zonedFields(timeZone: string, instant: number): WallTime {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(instant));
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl.DateTimeFormat did not return a "${type}" part`);
    return Number(part.value);
  };
  // Some ICU builds render midnight as "24" under hourCycle "h23"; normalize it.
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * The named offset a zone displays at a given instant, e.g. "EDT", "GMT",
 * or "GMT+5:45" for zones ICU has no abbreviation for. Falls back to the
 * zone's numeric offset if the "short" form doesn't resolve to a name (some
 * ICU builds return the zone id itself in that case).
 */
function zoneAbbreviation(timeZone: string, instant: number): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
    hour: "2-digit",
  });
  const part = dtf.formatToParts(new Date(instant)).find((p) => p.type === "timeZoneName");
  return part ? part.value : timeZone;
}

function offsetMinutesAt(timeZone: string, instant: number): number {
  const fields = zonedFields(timeZone, instant);
  const asUtc = wallTimeAsUtcMs(fields);
  return Math.round((asUtc - instant) / 60000);
}

/**
 * Resolves a wall-clock time in `timeZone` to the UTC instant it refers to.
 *
 * Samples the zone's offset a day on either side of the requested time to
 * detect a nearby DST transition, then checks which of the two candidate
 * instants (one per offset) actually round-trips back to the requested
 * offset. Neither round-tripping means the time falls in a spring-forward
 * gap; both round-tripping means it falls in a fall-back overlap.
 */
export function resolveWallTime(timeZone: string, wall: WallTime): ResolveResult {
  const naive = wallTimeAsUtcMs(wall);
  const offsetBefore = offsetMinutesAt(timeZone, naive - DAY_MS);
  const offsetAfter = offsetMinutesAt(timeZone, naive + DAY_MS);

  if (offsetBefore === offsetAfter) {
    return {
      utc: naive - offsetBefore * 60000,
      offsetMinutes: offsetBefore,
      status: "unique",
    };
  }

  const candidateBefore = naive - offsetBefore * 60000;
  const candidateAfter = naive - offsetAfter * 60000;
  const validBefore = offsetMinutesAt(timeZone, candidateBefore) === offsetBefore;
  const validAfter = offsetMinutesAt(timeZone, candidateAfter) === offsetAfter;

  if (validBefore && validAfter) {
    const earlier = Math.min(candidateBefore, candidateAfter);
    const later = Math.max(candidateBefore, candidateAfter);
    return {
      utc: earlier,
      alternateUtc: later,
      offsetMinutes: offsetMinutesAt(timeZone, earlier),
      status: "ambiguous",
    };
  }
  if (validBefore) {
    return { utc: candidateBefore, offsetMinutes: offsetBefore, status: "unique" };
  }
  if (validAfter) {
    return { utc: candidateAfter, offsetMinutes: offsetAfter, status: "unique" };
  }

  // Neither candidate round-trips: the requested time was skipped by a
  // spring-forward transition. Report the first valid instant after it.
  const shifted = Math.max(candidateBefore, candidateAfter);
  return { utc: shifted, offsetMinutes: offsetMinutesAt(timeZone, shifted), status: "gap" };
}

/** Converts a wall-clock time in `fromZone` to the equivalent wall-clock time in `toZone`. */
export function convertWallTime(fromZone: string, wall: WallTime, toZone: string): ConversionResult {
  const resolved = resolveWallTime(fromZone, wall);
  const result: ConversionResult = {
    wall: zonedFields(toZone, resolved.utc),
    utc: resolved.utc,
    status: resolved.status,
    zoneName: zoneAbbreviation(toZone, resolved.utc),
  };
  if (resolved.status === "ambiguous" && resolved.alternateUtc !== undefined) {
    result.alternateWall = zonedFields(toZone, resolved.alternateUtc);
    result.alternateZoneName = zoneAbbreviation(toZone, resolved.alternateUtc);
  }
  return result;
}

const WALL_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Parses "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS" (a "T" separator also works). */
export function parseWallTime(input: string): WallTime {
  const match = WALL_TIME_PATTERN.exec(input.trim());
  if (!match) {
    throw new Error(`could not parse "${input}" as "YYYY-MM-DD HH:MM[:SS]"`);
  }
  const [, year, month, day, hour, minute, second] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: second ? Number(second) : 0,
  };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function formatWall(w: WallTime): string {
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}`;
}
