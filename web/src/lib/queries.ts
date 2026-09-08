import "server-only";
import { db } from "./supabase";
import { CLOSED_STATUSES, type Company, type Contact, type ContactDetail, type ContactWithCompany, type Status } from "./types";

function check<T>(r: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (r.error) throw new Error(`${ctx}: ${r.error.message}`);
  return r.data as T;
}

const CONTACT_WITH_COMPANY = "*, company:companies(id, name, domain)";

export async function listContacts(opts: {
  q?: string;
  status?: Status | "";
  type?: string;
  source?: string;
  bestFit?: boolean;
  includeClosed?: boolean;
} = {}): Promise<ContactWithCompany[]> {
  const hideClosed = !opts.status && !opts.includeClosed;
  if (opts.q?.trim()) {
    const rows = check(await (await db()).rpc("search_contacts", { q: opts.q.trim(), max_results: 50 }), "search") as ContactDetail[];
    return rows
      .map((d) => ({ ...d.contact, company: d.company ? { id: d.company.id, name: d.company.name, domain: d.company.domain } : null }))
      .filter((c) => (!opts.status || c.status === opts.status) && (!opts.type || c.type === opts.type)
        && (!opts.source || c.source === opts.source) && (!opts.bestFit || c.best_fit)
        && (!hideClosed || !CLOSED_STATUSES.includes(c.status)));
  }
  let q = (await db()).from("contacts").select(CONTACT_WITH_COMPANY).order("updated_at", { ascending: false }).limit(500);
  if (opts.status) q = q.eq("status", opts.status);
  else if (hideClosed) q = q.not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.source) q = q.eq("source", opts.source);
  if (opts.bestFit) q = q.eq("best_fit", true);
  return check(await q, "listContacts") as ContactWithCompany[];
}

export async function getContactDetail(id: string): Promise<ContactDetail | null> {
  const r = await (await db()).rpc("contact_detail", { p_contact_id: id });
  if (r.error) throw new Error(`contact_detail: ${r.error.message}`);
  return (r.data as ContactDetail | null) ?? null;
}

export async function listCompanies(): Promise<(Company & { contact_count: number })[]> {
  const rows = check(await (await db()).from("companies").select("*, contacts(count)").order("name"), "listCompanies") as
    (Company & { contacts: { count: number }[] })[];
  return rows.map(({ contacts, ...c }) => ({ ...c, contact_count: contacts?.[0]?.count ?? 0 }));
}

export async function getCompany(id: string): Promise<{ company: Company; contacts: Contact[] } | null> {
  const company = check(await (await db()).from("companies").select("*").eq("id", id).maybeSingle(), "getCompany") as Company | null;
  if (!company) return null;
  const contacts = check(await (await db()).from("contacts").select("*").eq("company_id", id).order("created_at"), "getCompany.contacts") as Contact[];
  return { company, contacts };
}

export async function getFollowupsDue(): Promise<(Contact & { company_name: string | null })[]> {
  return check(await (await db()).from("followups_due").select("*"), "followups_due");
}

export async function getRecontactable(): Promise<(Contact & { company_name: string | null })[]> {
  return check(await (await db()).from("recontactable").select("*"), "recontactable");
}

export async function getStatusCounts(): Promise<Record<string, number>> {
  const rows = check(await (await db()).from("contacts").select("status"), "statusCounts") as { status: string }[];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

export async function getNeedsAction(): Promise<ContactWithCompany[]> {
  return check(
    await (await db()).from("contacts").select(CONTACT_WITH_COMPANY).in("status", ["replied", "live"]).order("updated_at", { ascending: false }),
    "needsAction"
  ) as ContactWithCompany[];
}

export async function getAcceptedNotMessaged(): Promise<ContactWithCompany[]> {
  return check(
    await (await db()).from("contacts").select(CONTACT_WITH_COMPANY).eq("status", "accepted").order("date_accepted", { ascending: true }),
    "acceptedNotMessaged"
  ) as ContactWithCompany[];
}

export async function listCompanyOptions(): Promise<Pick<Company, "id" | "name" | "domain">[]> {
  return check(await (await db()).from("companies").select("id, name, domain").order("name"), "companyOptions");
}
