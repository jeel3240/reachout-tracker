/**
 * One-off importer for the Google Sheet export.
 *
 *   npm run import -- path/to/sheet.csv            # dry run: prints what would happen
 *   npm run import -- path/to/sheet.csv --commit   # actually inserts
 *
 * Column headers are matched loosely (case/spacing/punctuation insensitive) against the
 * aliases below. Unrecognised columns are appended to the contact's notes so nothing is lost.
 * Duplicates (same linkedin_url or email) are skipped and reported.
 */
import fs from "node:fs";
import { STATUSES, TYPES, db, fail, findDuplicate, findOrCreateCompany, normalizeDomain } from "./db";

// ---------------------------------------------------------------------------
// tiny RFC-4180 CSV parser (handles quotes, embedded commas and newlines)
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Field =
  | "name" | "first_name" | "last_name" | "email" | "email_verified" | "linkedin_url" | "phone" | "title"
  | "type" | "status" | "date_requested" | "date_accepted" | "best_fit" | "asu_tie" | "recontact_after" | "notes"
  | "company" | "domain" | "industry" | "location";

const ALIASES: Record<Field, string[]> = {
  name: ["name", "fullname", "contact", "contactname", "person"],
  first_name: ["firstname", "first"],
  last_name: ["lastname", "last", "surname"],
  email: ["email", "emailaddress", "mail"],
  email_verified: ["emailverified", "verified", "verifiedemail"],
  linkedin_url: ["linkedin", "linkedinurl", "linkedinprofile", "profile", "url", "link"],
  phone: ["phone", "phonenumber", "mobile", "cell", "number"],
  title: ["title", "jobtitle", "role", "position"],
  type: ["type", "contacttype", "category", "segment"],
  status: ["status", "stage", "state"],
  date_requested: ["daterequested", "requested", "requestdate", "invitesent", "datesent", "sent", "connectionrequested"],
  date_accepted: ["dateaccepted", "accepted", "acceptdate", "connected", "dateconnected"],
  best_fit: ["bestfit", "fit", "tier", "priority"],
  asu_tie: ["asutie", "asu", "sundevil", "asuconnection"],
  recontact_after: ["recontactafter", "recontact", "followupafter", "revisit"],
  notes: ["notes", "note", "comments", "comment", "research", "context"],
  company: ["company", "companyname", "organization", "organisation", "org", "employer"],
  domain: ["domain", "website", "site", "companydomain", "companywebsite", "web"],
  industry: ["industry", "sector", "vertical"],
  location: ["location", "city", "region", "geo", "where"],
};

function mapHeaders(headers: string[]): (Field | null)[] {
  return headers.map((h) => {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (aliases.includes(n)) return field;
    }
    return null;
  });
}

const STATUS_ALIASES: Record<string, (typeof STATUSES)[number]> = {
  requested: "requested", pending: "requested", invited: "requested", invitesent: "requested", sent: "requested",
  accepted: "accepted", connected: "accepted", connection: "accepted",
  messaged: "messaged", messagesent: "messaged", emailed: "messaged", noresponse: "messaged", noreply: "messaged", waiting: "messaged",
  replied: "replied", reply: "replied", responded: "replied", response: "replied",
  live: "live", active: "live", inconversation: "live", conversation: "live", meeting: "live",
  softno: "soft_no", soft: "soft_no", notnow: "soft_no", later: "soft_no", maybe: "soft_no",
  harddecline: "hard_decline", hard: "hard_decline", declined: "hard_decline", decline: "hard_decline", no: "hard_decline", never: "hard_decline",
  signed: "signed", won: "signed", client: "signed", paid: "signed",
  closed: "closed", done: "closed", finished: "closed",
  skipped: "skipped", skip: "skipped", ignore: "skipped", notworth: "skipped",
};

const TYPE_ALIASES: Record<string, (typeof TYPES)[number]> = {
  client: "client", prospect: "client", lead: "client", customer: "client",
  hiring: "hiring", employer: "hiring", job: "hiring", hiringmanager: "hiring",
  network: "network", networking: "network", node: "network", peer: "network", connector: "network",
  recruiter: "recruiter", recruiting: "recruiter", staffing: "recruiter", agency: "recruiter",
};

const truthy = (v: string) => ["y", "yes", "true", "1", "x", "✓", "best", "confirmed"].includes(v.trim().toLowerCase());

function toDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); // M/D/YYYY (US sheets)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function splitName(full: string): { first: string; last: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error("usage: npm run import -- <file.csv> [--commit]");
    process.exit(1);
  }
  const commit = flags.includes("--commit");
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  if (rows.length < 2) { console.error("CSV has no data rows"); process.exit(1); }

  const headers = rows[0];
  const fields = mapHeaders(headers);
  console.log("Column mapping:");
  headers.forEach((h, i) => console.log(`  ${h.padEnd(28)} -> ${fields[i] ?? "(notes)"}`));
  console.log(commit ? "\nMODE: COMMIT\n" : "\nMODE: DRY RUN (add --commit to write)\n");

  let inserted = 0, skipped = 0, failed = 0;
  const unknownStatuses = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (f: Field) => {
      const i = fields.indexOf(f);
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    const extras: string[] = [];
    fields.forEach((f, i) => { if (!f && row[i]?.trim()) extras.push(`${headers[i]}: ${row[i].trim()}`); });

    let first = get("first_name"), last: string | null = get("last_name") || null;
    if (!first && get("name")) ({ first, last } = splitName(get("name")));
    if (!first) { console.log(`row ${r + 1}: no name, skipped`); skipped++; continue; }

    const rawStatus = norm(get("status"));
    let status = STATUS_ALIASES[rawStatus];
    if (!status) {
      if (rawStatus) unknownStatuses.add(get("status"));
      status = "requested";
    }
    const rawType = norm(get("type"));
    const type = TYPE_ALIASES[rawType] ?? null;
    if (rawType && !type) extras.push(`type: ${get("type")}`);

    const notes = [get("notes"), ...extras].filter(Boolean).join("\n") || null;
    const companyName = get("company");
    const domain = normalizeDomain(get("domain"));

    const contact = {
      first_name: first,
      last_name: last,
      linkedin_url: get("linkedin_url") || null,
      email: get("email") || null,
      email_verified: truthy(get("email_verified")),
      phone: get("phone") || null,
      title: get("title") || null,
      type,
      status,
      date_requested: toDate(get("date_requested")),
      date_accepted: toDate(get("date_accepted")),
      best_fit: truthy(get("best_fit")),
      asu_tie: truthy(get("asu_tie")),
      recontact_after: toDate(get("recontact_after")),
      notes,
    };

    const label = `${first} ${last ?? ""}`.trim() + (companyName ? ` @ ${companyName}` : "");
    try {
      const dup = await findDuplicate({ linkedin_url: contact.linkedin_url, email: contact.email });
      if (dup) { console.log(`row ${r + 1}: ${label} -> DUPLICATE (${dup.by}), skipped`); skipped++; continue; }

      if (!commit) { console.log(`row ${r + 1}: ${label} -> would insert [${status}${type ? ", " + type : ""}]`); inserted++; continue; }

      let company_id: string | null = null;
      if (companyName || domain) {
        const r2 = await findOrCreateCompany({ name: companyName || domain!, domain, industry: get("industry") || null, location: get("location") || null });
        company_id = r2.company.id;
      }
      const { error } = await db().from("contacts").insert({ ...contact, company_id });
      if (error) fail(error, "insert");
      console.log(`row ${r + 1}: ${label} -> inserted [${status}]`);
      inserted++;
    } catch (e) {
      console.log(`row ${r + 1}: ${label} -> FAILED: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log(`\n${commit ? "inserted" : "would insert"}: ${inserted}, skipped: ${skipped}, failed: ${failed}`);
  if (unknownStatuses.size) {
    console.log(`\nUnrecognised status values (defaulted to 'requested'): ${[...unknownStatuses].join(", ")}`);
    console.log("Add them to STATUS_ALIASES in src/import-csv.ts and re-run.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
