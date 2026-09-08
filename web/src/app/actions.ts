"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/supabase";
import { AUTH_COOKIE, sessionToken } from "@/lib/auth";
import { CHANNELS, DIRECTIONS, SOURCES, STATUSES, TYPES } from "@/lib/types";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const oneOf = <T extends readonly string[]>(v: string | null, allowed: T): T[number] | null =>
  v && (allowed as readonly string[]).includes(v) ? (v as T[number]) : null;

async function resolveCompany(fd: FormData): Promise<string | null> {
  const existing = str(fd, "company_id");
  if (existing) return existing;
  const name = str(fd, "company_name");
  const domainRaw = str(fd, "company_domain");
  if (!name && !domainRaw) return null;
  const supabase = await db();
  if (domainRaw) {
    const domain = domainRaw.toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
    const { data } = await supabase.from("companies").select("id").eq("domain", domain).maybeSingle();
    if (data) return data.id;
  }
  if (name) {
    const { data } = await supabase.from("companies").select("id").ilike("name", name).limit(1);
    if (data?.length) return data[0].id;
  }
  const { data, error } = await supabase
    .from("companies")
    .insert({ name: name ?? domainRaw, domain: domainRaw, industry: str(fd, "company_industry"), location: str(fd, "company_location") })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

function contactFields(fd: FormData) {
  return {
    first_name: str(fd, "first_name"),
    last_name: str(fd, "last_name"),
    linkedin_url: str(fd, "linkedin_url"),
    email: str(fd, "email"),
    email_verified: bool(fd, "email_verified"),
    phone: str(fd, "phone"),
    title: str(fd, "title"),
    type: oneOf(str(fd, "type"), TYPES),
    source: oneOf(str(fd, "source"), SOURCES),
    date_requested: str(fd, "date_requested"),
    date_accepted: str(fd, "date_accepted"),
    best_fit: bool(fd, "best_fit"),
    asu_tie: bool(fd, "asu_tie"),
    recontact_after: str(fd, "recontact_after"),
    notes: str(fd, "notes"),
  };
}

export async function createContact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const fields = contactFields(fd);
  if (!fields.first_name) return { error: "First name is required." };
  const status = oneOf(str(fd, "status"), STATUSES) ?? "requested";
  const supabase = await db();

  // Duplicate check: return the existing record's page instead of inserting twice.
  if (fields.linkedin_url) {
    const norm = normalizeLinkedin(fields.linkedin_url);
    const { data } = await supabase.from("contacts").select("id, first_name, last_name").eq("linkedin_url", norm).maybeSingle();
    if (data) return { error: `Already exists: ${data.first_name} ${data.last_name ?? ""} has this LinkedIn URL (/contacts/${data.id}).` };
  }
  if (fields.email) {
    const { data } = await supabase.from("contacts").select("id, first_name, last_name").eq("email", fields.email.toLowerCase()).limit(1);
    if (data?.length) return { error: `Already exists: ${data[0].first_name} ${data[0].last_name ?? ""} has this email (/contacts/${data[0].id}).` };
  }

  let company_id: string | null;
  try {
    company_id = await resolveCompany(fd);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const { data, error } = await supabase.from("contacts").insert({ ...fields, status, company_id }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/");
  redirect(`/contacts/${data.id}`);
}

export async function updateContact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  if (!id) return { error: "Missing id." };
  const fields = contactFields(fd);
  if (!fields.first_name) return { error: "First name is required." };
  let company_id: string | null;
  try {
    company_id = await resolveCompany(fd);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const supabase = await db();
  const { error } = await supabase.from("contacts").update({ ...fields, company_id }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function logTouch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const contact_id = str(fd, "contact_id");
  const direction = oneOf(str(fd, "direction"), DIRECTIONS);
  const channel = oneOf(str(fd, "channel"), CHANNELS);
  if (!contact_id || !direction || !channel) return { error: "Direction and channel are required." };
  const sentRaw = str(fd, "sent_at");
  const sent_at = sentRaw ? new Date(sentRaw).toISOString() : new Date().toISOString();
  const supabase = await db();
  const { error } = await supabase.rpc("log_touch", {
    p_contact_id: contact_id,
    p_direction: direction,
    p_channel: channel,
    p_sent_at: sent_at,
    p_subject: str(fd, "subject"),
    p_hook: str(fd, "hook"),
    p_body: str(fd, "body"),
  });
  if (error) return { error: error.message };

  // Optional status change in the same submit (e.g. accepted -> messaged).
  const newStatus = oneOf(str(fd, "new_status"), STATUSES);
  if (newStatus) {
    const { error: e2 } = await supabase.rpc("set_contact_status", { p_contact_id: contact_id, p_status: newStatus, p_note: null });
    if (e2) return { error: e2.message };
  }
  revalidatePath(`/contacts/${contact_id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function setStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const contact_id = str(fd, "contact_id");
  const status = oneOf(str(fd, "status"), STATUSES);
  if (!contact_id || !status) return { error: "Status is required." };
  const supabase = await db();
  const { error } = await supabase.rpc("set_contact_status", { p_contact_id: contact_id, p_status: status, p_note: str(fd, "note") });
  if (error) return { error: error.message };
  revalidatePath(`/contacts/${contact_id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function updateCompany(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!id || !name) return { error: "Name is required." };
  const supabase = await db();
  const { error } = await supabase
    .from("companies")
    .update({ name, domain: str(fd, "domain"), industry: str(fd, "industry"), location: str(fd, "location"), notes: str(fd, "notes") })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/companies/${id}`);
  revalidatePath("/companies");
  return { ok: true };
}

export async function deleteContact(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  const supabase = await db();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  redirect("/contacts");
}

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const password = process.env.APP_PASSWORD;
  if (!password) redirect("/");
  const given = str(fd, "password") ?? "";
  if (given !== password) return { error: "Wrong password." };
  const jar = await cookies();
  jar.set(AUTH_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  const next = str(fd, "next");
  redirect(next && next.startsWith("/") ? next : "/");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  redirect("/login");
}

function normalizeLinkedin(url: string): string {
  let s = url.trim().toLowerCase().replace(/^[a-z]+:\/\//, "");
  s = s.replace(/^(www\.)?linkedin\.com\//, "");
  s = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
  return `https://www.linkedin.com/${s}`;
}
