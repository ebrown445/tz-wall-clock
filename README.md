# tz-wall-clock

One question: given a wall-clock date and time in one IANA timezone, what is
the wall-clock date and time in another zone?

That sounds trivial until the source time lands on a daylight-saving
transition. Twice a year, in every zone that observes DST, one of two things
happens to a stretch of local clock time:

- **Spring forward**: a range of times (in the US, typically 2:00am-2:59am)
  never happens. The clocks jump straight from 1:59am to 3:00am.
- **Fall back**: a range of times happens twice. In the US, 1:00am-1:59am
  occurs once before the clocks are set back, and again after.

Most "convert this timestamp" tools quietly pick an answer for these cases,
or crash. This one resolves them explicitly and tells you which case you hit,
using only the timezone data your JS runtime already ships via `Intl`.

## Usage

### CLI

```
npm run build
node dist/src/cli.js "2026-03-08 02:30" America/New_York Europe/London
```

```
Europe/London: 2026-03-08 07:15 GMT
note: 2026-03-08 02:30 does not exist in America/New_York (spring-forward gap); treated as the first valid instant after the gap.
```

```
node dist/src/cli.js "2026-11-01 01:30" America/New_York UTC
```

```
UTC: 2026-11-01 05:30 UTC
note: 2026-11-01 01:30 occurs twice in America/New_York (fall-back overlap); shown is the earlier instant (UTC), the later one converts to 2026-11-01 06:30 UTC.
```

To see the IANA zone names your runtime recognizes (useful for spelling one
correctly before you type it):

```
node dist/src/cli.js --list-zones
```

### Library

```ts
import { convertWallTime, parseWallTime, formatWall } from "./src/convert.js";

const result = convertWallTime(
  "America/New_York",
  parseWallTime("2026-11-01 01:30"),
  "Europe/Berlin"
);

console.log(result.status); // "ambiguous"
console.log(formatWall(result.wall)); // the earlier instant, in Berlin's local time
console.log(result.zoneName); // the named offset Berlin uses at that instant, e.g. "CET"
console.log(result.alternateWall && formatWall(result.alternateWall)); // the later one
```

`resolveWallTime(timeZone, wall)` does the underlying work: it returns the
best UTC instant for a wall-clock time in a single zone, along with a
`status` of `"unique"`, `"ambiguous"`, or `"gap"`.

## How it works

To resolve a wall-clock time in a zone, the offset is sampled a day before
and a day after the requested time. If they match, there's no nearby
transition and the answer is unique. If they differ, both offsets are used
to build a candidate UTC instant, and each candidate is checked by asking
the zone what its own offset is at that instant:

- Both candidates round-trip back to the offset that produced them: the wall
  time is ambiguous (fall-back), and both instants are returned.
- Neither does: the wall time was skipped (spring-forward gap), and the
  first valid instant after it is returned.
- Exactly one does: that's the unique answer.

## Development

```
npm install
npm run build
npm test
```

The test suite in `test/convert.test.ts` is table-driven: each row is a real
DST transition (US and EU, which change on different dates and at different
local times) plus a non-DST, non-hour UTC offset zone for good measure.

## Status

Early skeleton. See the repository's open issues for what's next.
