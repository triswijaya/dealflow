import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

// prepare: false is required for compatibility with Supabase's transaction
// pooler in production (DEPLOY-02); harmless against a direct local connection.
// In development every hot reload re-evaluates this module; without the global
// cache each edit would leave another pool behind until Postgres runs out of
// connections.
const globalForDb = globalThis as unknown as { dealflowQueryClient?: ReturnType<typeof postgres> };
const queryClient = globalForDb.dealflowQueryClient ?? postgres(env.DATABASE_URL, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.dealflowQueryClient = queryClient;

export const db = drizzle(queryClient, { schema });
