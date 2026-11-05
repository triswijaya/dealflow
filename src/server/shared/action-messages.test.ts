import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_MESSAGES } from "./action";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [readFileSync(path, "utf8")] : [];
  });
}

// The table turns English service messages into Indonesian by pattern. If a service message is
// reworded, its pattern goes dead and the user silently gets the generic text, so every pattern
// must still match some message in the code.

describe("KNOWN_MESSAGES", () => {
  const code = sources(join(process.cwd(), "src/server")).join("\n");

  it.each(KNOWN_MESSAGES.map(([pattern]) => [String(pattern), pattern] as const))("still matches a message thrown in the code: %s", (_label, pattern) => {
    expect(pattern.test(code)).toBe(true);
  });
});
