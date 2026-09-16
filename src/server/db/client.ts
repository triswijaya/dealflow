import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

// prepare: false is required for compatibility with Supabase's transaction
// pooler in production (DEPLOY-02); harmless against a direct local connection.
const queryClient = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(queryClient, { schema });
