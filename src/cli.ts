#!/usr/bin/env node
import { convertWallTime, formatWall, parseWallTime, resolveZoneName } from "./convert.js";

function usage(): string {
  return (
    'usage: tz-wall-clock "<YYYY-MM-DD HH:MM>" <from-zone> <to-zone> [--json]\n' +
    'example: tz-wall-clock "2026-03-08 02:30" America/New_York Europe/London\n' +
    '     or: tz-wall-clock "2026-03-08 02:30" EST BST\n' +
    "       tz-wall-clock --list-zones\n" +
    "       add --json to any of the above for machine-readable output\n"
  );
}

/** Note text describing a gap or ambiguity, or undefined for a unique result. */
function noteFor(
  status: "unique" | "ambiguous" | "gap",
  datetime: string,
  from: string,
  result: ReturnType<typeof convertWallTime>
): string | undefined {
  if (status === "gap") {
    return (
      `${datetime} does not exist in ${from} (spring-forward gap); ` +
      "treated as the first valid instant after the gap."
    );
  }
  if (status === "ambiguous" && result.alternateWall) {
    return (
      `${datetime} occurs twice in ${from} (fall-back overlap); ` +
      `shown is the earlier instant (${result.zoneName}), the later one converts to ` +
      `${formatWall(result.alternateWall)} ${result.alternateZoneName}.`
    );
  }
  return undefined;
}

function main(argv: string[]): number {
  const jsonMode = argv.includes("--json");
  const args = argv.filter((a) => a !== "--json");

  if (args[0] === "--list-zones") {
    const zones = Intl.supportedValuesOf("timeZone");
    if (jsonMode) {
      process.stdout.write(`${JSON.stringify(zones)}\n`);
    } else {
      for (const zone of zones) {
        process.stdout.write(`${zone}\n`);
      }
    }
    return 0;
  }

  const [datetime, fromZone, toZone] = args;
  if (!datetime || !fromZone || !toZone) {
    process.stderr.write(usage());
    return 1;
  }

  try {
    const from = resolveZoneName(fromZone);
    const to = resolveZoneName(toZone);
    const wall = parseWallTime(datetime);
    const result = convertWallTime(from, wall, to);
    const note = noteFor(result.status, datetime, from, result);

    if (jsonMode) {
      process.stdout.write(
        `${JSON.stringify({
          input: datetime,
          from,
          to,
          status: result.status,
          wall: formatWall(result.wall),
          zoneName: result.zoneName,
          alternateWall: result.alternateWall ? formatWall(result.alternateWall) : null,
          alternateZoneName: result.alternateZoneName ?? null,
          note: note ?? null,
        })}\n`
      );
      return 0;
    }

    process.stdout.write(`${to}: ${formatWall(result.wall)} ${result.zoneName}\n`);
    if (note) {
      process.stdout.write(`note: ${note}\n`);
    }
    return 0;
  } catch (err) {
    const message = (err as Error).message;
    if (jsonMode) {
      process.stdout.write(`${JSON.stringify({ error: message })}\n`);
    } else {
      process.stderr.write(`error: ${message}\n`);
    }
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
