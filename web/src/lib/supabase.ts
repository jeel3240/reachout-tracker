import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service role key.
 * Never import this from a client component. The tables have RLS enabled with
 * no policies, so only the service role can read or write.
 *
 * Awaiting connection() keeps every page that touches the DB out of the build-time
 * prerender, so the data is always fresh and the build works without credentials.
 */
export async function db(): Promise<SupabaseClient> {
  await connection();
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in web/.env.local");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
