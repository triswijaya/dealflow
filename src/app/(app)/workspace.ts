import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/lib/labels";
import { getWorkspaceState, type Workspace } from "@/server/workspace/workspace";

// One session + membership read per request, shared by the layout and the
// page it wraps (React cache is request-scoped on the server).
export const loadWorkspaceState = cache(async () => getWorkspaceState(await headers()));

/** For pages under (app): the layout already routed every other state away. */
export async function requireWorkspace(allowed?: Role[]): Promise<Workspace> {
  const state = await loadWorkspaceState();
  if (state.status !== "active") {
    redirect("/login");
  }
  if (allowed && !allowed.includes(state.workspace.role)) {
    redirect("/forbidden");
  }
  return state.workspace;
}

/**
 * Runs a service read for a page. TENANT-04: a missing or cross-tenant
 * record renders the same 404; a permission denial goes to the 403 page.
 */
export async function load<T>(read: (requestHeaders: Headers) => Promise<T>): Promise<T> {
  try {
    return await read(await headers());
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof APIError) {
      if (error.status === "NOT_FOUND") notFound();
      if (error.status === "FORBIDDEN") redirect("/forbidden");
    }
    throw error;
  }
}
