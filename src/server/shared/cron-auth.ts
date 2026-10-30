import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/**
 * OBS-05: the scheduled endpoints answer only to the shared secret, which Vercel
 * Cron sends as a bearer token. With no secret configured nobody is authorized,
 * so a deployment that forgot it exposes nothing.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
