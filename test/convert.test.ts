import assert from "node:assert/strict";
import test from "node:test";
import {
  convertWallTime,
  formatWall,
  parseWallTime,
  resolveZoneName,
  type ResolveStatus,
} from "../src/convert.js";

interface Case {
  desc: string;
  from: string;
  wall: string;
  to: string;
  status: ResolveStatus;
  expectedWall: string;
  expectedAlternateWall?: string;
  /** Only asserted when set: zones like London have ICU-version-dependent
   * short names ("BST" vs "GMT+1"), so most rows leave this unchecked and
   * only rely on `UTC`/`GMT`, which every ICU build names the same way. */
  expectedZoneName?: string;
  expectedAlternateZoneName?: string;
}

// Every row is a real DST edge case for the year 2026, checked against the
// published US and EU transition rules rather than against Intl output, so
// this suite fails loudly if the resolution logic drifts.
const cases: Case[] = [
  {
    desc: "ordinary conversion, both zones in DST, no transition nearby",
    from: "America/New_York",
    wall: "2026-06-15 12:00",
    to: "Europe/London",
    status: "unique",
    expectedWall: "2026-06-15 17:00",
  },
  {
    desc: "US spring-forward gap (clocks jump 2:00am to 3:00am)",
    from: "America/New_York",
    wall: "2026-03-08 02:30",
    to: "UTC",
    status: "gap",
    expectedWall: "2026-03-08 07:30",
    expectedZoneName: "UTC",
  },
  {
    desc: "US spring-forward gap carried through to a second, non-DST-that-day zone",
    from: "America/New_York",
    wall: "2026-03-08 02:15",
    to: "Europe/London",
    status: "gap",
    expectedWall: "2026-03-08 07:15",
    expectedZoneName: "GMT", // London is still on standard time in early March
  },
  {
    desc: "US fall-back overlap (1:30am happens twice)",
    from: "America/New_York",
    wall: "2026-11-01 01:30",
    to: "UTC",
    status: "ambiguous",
    expectedWall: "2026-11-01 05:30",
    expectedAlternateWall: "2026-11-01 06:30",
    expectedZoneName: "UTC",
    expectedAlternateZoneName: "UTC",
  },
  {
    desc: "EU fall-back overlap on a different transition date/time than the US",
    from: "Europe/Berlin",
    wall: "2026-10-25 02:30",
    to: "UTC",
    status: "ambiguous",
    expectedWall: "2026-10-25 00:30",
    expectedAlternateWall: "2026-10-25 01:30",
    expectedZoneName: "UTC",
    expectedAlternateZoneName: "UTC",
  },
  {
    desc: "non-hour UTC offset with no DST at all",
    from: "Asia/Kathmandu",
    wall: "2026-01-01 10:00",
    to: "UTC",
    status: "unique",
    expectedWall: "2026-01-01 04:15",
    expectedZoneName: "UTC",
  },
];

for (const c of cases) {
  test(c.desc, () => {
    const result = convertWallTime(c.from, parseWallTime(c.wall), c.to);
    assert.equal(result.status, c.status);
    assert.equal(formatWall(result.wall), c.expectedWall);
    assert.equal(typeof result.zoneName, "string");
    assert.ok(result.zoneName.length > 0);
    if (c.expectedZoneName) {
      assert.equal(result.zoneName, c.expectedZoneName);
    }
    if (c.expectedAlternateWall) {
      assert.ok(result.alternateWall, "expected an alternate wall time for an ambiguous result");
      assert.equal(formatWall(result.alternateWall!), c.expectedAlternateWall);
      if (c.expectedAlternateZoneName) {
        assert.equal(result.alternateZoneName, c.expectedAlternateZoneName);
      }
    } else {
      assert.equal(result.alternateWall, undefined);
      assert.equal(result.alternateZoneName, undefined);
    }
  });
}

test("parseWallTime rejects malformed input", () => {
  assert.throws(() => parseWallTime("not a date"));
  assert.throws(() => parseWallTime("2026-03-08"));
});

test("parseWallTime accepts an explicit seconds field", () => {
  const wall = parseWallTime("2026-03-08 02:30:45");
  assert.equal(wall.second, 45);
});

test("resolveZoneName passes IANA names and UTC through unchanged", () => {
  assert.equal(resolveZoneName("America/New_York"), "America/New_York");
  assert.equal(resolveZoneName("UTC"), "UTC");
});

test("resolveZoneName maps an unambiguous abbreviation to its IANA zone", () => {
  assert.equal(resolveZoneName("EST"), "America/New_York");
  assert.equal(resolveZoneName("edt"), "America/New_York");
  assert.equal(resolveZoneName("BST"), "Europe/London");
  assert.equal(resolveZoneName("GMT"), "UTC");
});

test("resolveZoneName rejects an abbreviation used by more than one region", () => {
  assert.throws(() => resolveZoneName("CST"), /ambiguous/);
  assert.throws(() => resolveZoneName("IST"), /ambiguous/);
});

test("resolveZoneName leaves unrecognized input alone for Intl to reject", () => {
  assert.equal(resolveZoneName("NotAZone"), "NotAZone");
});

test("convertWallTime accepts zone abbreviations end to end", () => {
  const result = convertWallTime(
    resolveZoneName("EST"),
    parseWallTime("2026-01-15 09:00"),
    resolveZoneName("GMT")
  );
  assert.equal(result.status, "unique");
  assert.equal(formatWall(result.wall), "2026-01-15 14:00");
});
