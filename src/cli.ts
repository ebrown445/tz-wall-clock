#!/usr/bin/env node
import { convertWallTime, formatWall, parseWallTime, resolveZoneName } from "./convert.js";

function usage(): string {
  return (
    'usage: tz-wall-clock "<YYYY-MM-DD HH:MM>" <from-zone> <to-zone>\n' +
    'example: tz-wall-clock "2026-03-08 02:30" America/New_York Europe/London\n' +
    '     or: tz-wall-clock "2026-03-08 02:30" EST BST\n' +
    "       tz-wall-clock --list-zones\n"
  );
}

function main(argv: string[]): number {
  if (argv[0] === "--list-zones") {
    for (const zone of Intl.supportedValuesOf("timeZone")) {
      process.stdout.write(`${zone}\n`);
    }
    return 0;
  }

  const [datetime, fromZone, toZone] = argv;
  if (!datetime || !fromZone || !toZone) {
    process.stderr.write(usage());
    return 1;
  }

  try {
    const from = resolveZoneName(fromZone);
    const to = resolveZoneName(toZone);
    const wall = parseWallTime(datetime);
    const result = convertWallTime(from, wall, to);

    process.stdout.write(`${to}: ${formatWall(result.wall)} ${result.zoneName}\n`);

    if (result.status === "gap") {
      process.stdout.write(
        `note: ${datetime} does not exist in ${from} (spring-forward gap); ` +
          "treated as the first valid instant after the gap.\n"
      );
    }
    if (result.status === "ambiguous" && result.alternateWall) {
      process.stdout.write(
        `note: ${datetime} occurs twice in ${from} (fall-back overlap); ` +
          `shown is the earlier instant (${result.zoneName}), the later one converts to ` +
          `${formatWall(result.alternateWall)} ${result.alternateZoneName}.\n`
      );
    }
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
