#!/usr/bin/env node
import { convertWallTime, formatWall, parseWallTime } from "./convert.js";

function usage(): string {
  return (
    'usage: tz-wall-clock "<YYYY-MM-DD HH:MM>" <from-zone> <to-zone>\n' +
    'example: tz-wall-clock "2026-03-08 02:30" America/New_York Europe/London\n'
  );
}

function main(argv: string[]): number {
  const [datetime, fromZone, toZone] = argv;
  if (!datetime || !fromZone || !toZone) {
    process.stderr.write(usage());
    return 1;
  }

  try {
    const wall = parseWallTime(datetime);
    const result = convertWallTime(fromZone, wall, toZone);

    process.stdout.write(`${toZone}: ${formatWall(result.wall)}\n`);

    if (result.status === "gap") {
      process.stdout.write(
        `note: ${datetime} does not exist in ${fromZone} (spring-forward gap); ` +
          "treated as the first valid instant after the gap.\n"
      );
    }
    if (result.status === "ambiguous" && result.alternateWall) {
      process.stdout.write(
        `note: ${datetime} occurs twice in ${fromZone} (fall-back overlap); ` +
          `shown is the earlier instant, the later one converts to ${formatWall(result.alternateWall)}.\n`
      );
    }
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
