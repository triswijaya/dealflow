"use server";

import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/server/shared/action";
import { globalSearch, type SearchResults } from "@/server/search/search";

/** The topbar dropdown: a few matches per group for what has been typed so far. */
export async function globalSearchAction(input: { query: string }): Promise<ActionResult<SearchResults>> {
  return runAction(async () => globalSearch({ headers: await headers(), query: input.query, limit: 5 }));
}
