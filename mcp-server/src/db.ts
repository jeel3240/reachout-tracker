import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load mcp-server/.env if present. Claude Code can also pass env via its MCP config.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "..", ".env") });

export const STATUSES = [
  "requested", "accepted", "messaged", "replied", "live",
  "soft_no", "hard_decline", "signed", "closed", "skipped",
] as const;
export const TYPES = ["client", "hiring", "network", "recruiter"] as const;
export const DIRECTIONS = ["outbound", "inbound"] as const;
export const CHANNELS = ["email", "linkedin", "call", "meeting"] as const;

export type Status = (typeof STATUSES)[number];
export type ContactType = (typeof TYPES)[number];

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string | null;
  linkedin_url: string | null;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  title: string | null;
  type: ContactType | null;
  status: Status;
  date_requested: string | null;
  date_accepted: string | null;
  last_touch_at: string | null;
  touch_count: number;
  best_fit: boolean;
  asu_tie: boolean;
  recontact_after: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Touch {
  id: string;
  contact_id: string;
  direction: (typeof DIRECTIONS)[number];
  channel: (typeof CHANNELS)[number];
  sent_at: string;
  subject: string | null;
  hook: string | null;
  body: string | null;
  created_at: string;
}

export interface ContactDetail {
  contact: Contact;
  company: Company | null;
  touches: Touch[];
}

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (mcp-server/.env or the MCP config env block)."
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false },
    // supabase-js needs a WebSocket implementation on Node < 22 even though we never use realtime.
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
  return client;
}

/** Normalise a LinkedIn URL the same way the DB trigger does, for pre-insert lookups. */
export function normalizeLinkedin(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  let s = url.trim().toLowerCase().replace(/^[a-z]+:\/\//, "");
  s = s.replace(/^(www\.)?linkedin\.com\//, "");
  s = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
  return `https://www.linkedin.com/${s}`;
}

export function normalizeDomain(d: string | null | undefined): string | null {
  if (!d || !d.trim()) return null;
  let s = d.trim().toLowerCase().replace(/^[a-z]+:\/\//, "");
  s = s.replace(/^www\./, "").replace(/[/?#].*$/, "");
  return s || null;
}

export function fail(error: { message: string } | null | undefined, ctx: string): never {
  throw new Error(`${ctx}: ${error?.message ?? "unknown error"}`);
}

export async function contactDetail(contactId: string): Promise<ContactDetail | null> {
  const { data, error } = await db().rpc("contact_detail", { p_contact_id: contactId });
  if (error) fail(error, "contact_detail");
  return (data as ContactDetail | null) ?? null;
}

/**
 * Find an existing contact by linkedin_url or email. Returns the first hit.
 * Used by add_contact so duplicates are reported instead of silently erroring.
 */
export async function findDuplicate(opts: {
  linkedin_url?: string | null;
  email?: string | null;
}): Promise<{ by: "linkedin_url" | "email"; contact: Contact } | null> {
  const li = normalizeLinkedin(opts.linkedin_url);
  if (li) {
    const { data, error } = await db().from("contacts").select("*").eq("linkedin_url", li).maybeSingle();
    if (error) fail(error, "findDuplicate(linkedin)");
    if (data) return { by: "linkedin_url", contact: data as Contact };
  }
  const em = opts.email?.trim().toLowerCase();
  if (em) {
    const { data, error } = await db().from("contacts").select("*").eq("email", em).limit(1);
    if (error) fail(error, "findDuplicate(email)");
    if (data && data.length) return { by: "email", contact: data[0] as Contact };
  }
  return null;
}

/** Find a company by domain, then exact name, then create it. */
export async function findOrCreateCompany(input: {
  name: string;
  domain?: string | null;
  industry?: string | null;
  location?: string | null;
  notes?: string | null;
}): Promise<{ company: Company; created: boolean }> {
  const domain = normalizeDomain(input.domain);
  if (domain) {
    const { data, error } = await db().from("companies").select("*").eq("domain", domain).maybeSingle();
    if (error) fail(error, "findOrCreateCompany(domain)");
    if (data) return { company: data as Company, created: false };
  }
  const name = input.name.trim();
  if (name) {
    const { data, error } = await db().from("companies").select("*").ilike("name", name).limit(1);
    if (error) fail(error, "findOrCreateCompany(name)");
    if (data && data.length) {
      const existing = data[0] as Company;
      // Backfill a missing domain if we learned it now.
      if (domain && !existing.domain) {
        const { data: upd, error: e2 } = await db()
          .from("companies").update({ domain }).eq("id", existing.id).select("*").single();
        if (e2) fail(e2, "findOrCreateCompany(backfill domain)");
        return { company: upd as Company, created: false };
      }
      return { company: existing, created: false };
    }
  }
  const { data, error } = await db()
    .from("companies")
    .insert({ name, domain, industry: input.industry ?? null, location: input.location ?? null, notes: input.notes ?? null })
    .select("*")
    .single();
  if (error) fail(error, "findOrCreateCompany(insert)");
  return { company: data as Company, created: true };
}
