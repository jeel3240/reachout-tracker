import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CHANNELS, DIRECTIONS, STATUSES, TYPES,
  contactDetail, db, fail, findDuplicate, findOrCreateCompany,
  type Contact, type ContactDetail,
} from "./db";

/**
 * Build a fully-registered MCP server. One implementation, two transports:
 * stdio (index.ts, for local Claude Code) and HTTP (web/src/app/api/mcp, hosted on Vercel).
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "reachout-tracker", version: "0.1.0" });
  registerTools(server);
  return server;
}

export function registerTools(server: McpServer): void {


  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------
  type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

  function json(data: unknown): ToolResult {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
  function errorResult(msg: string): ToolResult {
    return { content: [{ type: "text", text: msg }], isError: true };
  }
  async function run(fn: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await fn();
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  }

  /** Compact one-line summary so the model can scan lists quickly. */
  function summarize(c: Contact, companyName?: string | null) {
    return {
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      title: c.title,
      company: companyName ?? null,
      type: c.type,
      status: c.status,
      email: c.email,
      email_verified: c.email_verified,
      linkedin_url: c.linkedin_url,
      touch_count: c.touch_count,
      last_touch_at: c.last_touch_at,
      recontact_after: c.recontact_after,
      best_fit: c.best_fit,
      asu_tie: c.asu_tie,
    };
  }

  function detailForModel(d: ContactDetail) {
    return {
      contact: d.contact,
      company: d.company,
      touches: d.touches.map((t) => ({
        id: t.id,
        sent_at: t.sent_at,
        direction: t.direction,
        channel: t.channel,
        subject: t.subject,
        hook: t.hook,
        body: t.body,
      })),
      summary: {
        status: d.contact.status,
        touch_count: d.contact.touch_count,
        last_touch_at: d.contact.last_touch_at,
        outbound: d.touches.filter((t) => t.direction === "outbound").length,
        inbound: d.touches.filter((t) => t.direction === "inbound").length,
        channels_used: [...new Set(d.touches.map((t) => t.channel))],
        messaged_on_linkedin: d.touches.some((t) => t.direction === "outbound" && t.channel === "linkedin"),
        emailed: d.touches.some((t) => t.direction === "outbound" && t.channel === "email"),
      },
    };
  }

  const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").describe("YYYY-MM-DD");

  // ---------------------------------------------------------------------------
  // search_contact
  // ---------------------------------------------------------------------------
  server.registerTool(
    "search_contact",
    {
      title: "Search contacts",
      description:
        "Call this FIRST before drafting anything to anyone. Fuzzy match across contact name, email, " +
        "LinkedIn URL, company name and company domain. Each match returns the contact record " +
        "(including status), its company, and EVERY touch ordered by date, so you can tell whether " +
        "the person was already messaged, replied, or declined.",
      inputSchema: {
        query: z.string().min(1).describe("Name, email, LinkedIn URL, company name or domain"),
        limit: z.number().int().min(1).max(25).default(10).optional(),
      },
    },
    async ({ query, limit }) =>
      run(async () => {
        const { data, error } = await db().rpc("search_contacts", { q: query, max_results: limit ?? 10 });
        if (error) fail(error, "search_contacts");
        const results = (data as ContactDetail[]) ?? [];
        if (!results.length) return json({ matches: 0, results: [], note: "No existing contact matches. Safe to add." });
        return json({ matches: results.length, results: results.map(detailForModel) });
      })
  );

  // ---------------------------------------------------------------------------
  // get_company
  // ---------------------------------------------------------------------------
  server.registerTool(
    "get_company",
    {
      title: "Get company with all its contacts",
      description:
        "Look up a company by name or domain and return it with every contact under it. " +
        "Use this before drafting to catch the second-person-at-the-same-company case.",
      inputSchema: {
        name_or_domain: z.string().min(1).describe("Company name or domain, e.g. 'HPN Global' or hpnglobal.com"),
      },
    },
    async ({ name_or_domain }) =>
      run(async () => {
        const { data, error } = await db().rpc("company_detail", { q: name_or_domain });
        if (error) fail(error, "company_detail");
        if (!data) return json({ found: false, note: "No company matches." });
        const d = data as { company: Record<string, unknown>; contacts: Contact[] };
        return json({
          found: true,
          company: d.company,
          contact_count: d.contacts.length,
          contacts: d.contacts.map((c) => summarize(c, d.company.name as string)),
        });
      })
  );

  // ---------------------------------------------------------------------------
  // add_contact
  // ---------------------------------------------------------------------------
  server.registerTool(
    "add_contact",
    {
      title: "Add a contact",
      description:
        "Create a contact (and its company if needed). Rejects duplicates: if a contact with the same " +
        "linkedin_url or email already exists, nothing is inserted and the existing record is returned " +
        "with duplicate=true. Default status is 'requested' with date_requested=today, so log people " +
        "at the moment the LinkedIn invite goes out, not when you first message them.",
      inputSchema: {
        first_name: z.string().min(1),
        last_name: z.string().optional(),
        linkedin_url: z.string().optional().describe("Primary dedupe key. Any linkedin.com/in/... form is fine."),
        email: z.string().optional(),
        email_verified: z.boolean().optional().describe("true only if found on their site / confirmed, not pattern-guessed"),
        phone: z.string().optional(),
        title: z.string().optional(),
        type: z.enum(TYPES).optional().describe("client | hiring | network | recruiter"),
        status: z.enum(STATUSES).optional().describe("Defaults to 'requested'"),
        date_requested: dateStr.optional(),
        date_accepted: dateStr.optional(),
        best_fit: z.boolean().optional(),
        asu_tie: z.boolean().optional().describe("Only true when genuinely confirmed"),
        notes: z.string().optional(),
        company: z
          .object({
            name: z.string().min(1),
            domain: z.string().optional().describe("Bare domain preferred, e.g. securemedical.com"),
            industry: z.string().optional(),
            location: z.string().optional(),
            notes: z.string().optional(),
          })
          .optional()
          .describe("Company to link. Matched by domain, then exact name; created if absent."),
        company_id: z.string().uuid().optional().describe("Alternative to `company` when you already know the id"),
      },
    },
    async (input) =>
      run(async () => {
        const dup = await findDuplicate({ linkedin_url: input.linkedin_url, email: input.email });
        if (dup) {
          const detail = await contactDetail(dup.contact.id);
          return json({
            duplicate: true,
            matched_on: dup.by,
            message: `A contact with this ${dup.by} already exists. Nothing was inserted.`,
            existing: detail ? detailForModel(detail) : dup.contact,
          });
        }

        let companyId = input.company_id ?? null;
        let companyCreated = false;
        if (!companyId && input.company) {
          const r = await findOrCreateCompany(input.company);
          companyId = r.company.id;
          companyCreated = r.created;
        }

        const { company: _c, company_id: _cid, ...fields } = input;
        const { data, error } = await db()
          .from("contacts")
          .insert({ ...fields, company_id: companyId })
          .select("*")
          .single();
        if (error) fail(error, "add_contact");
        const detail = await contactDetail((data as Contact).id);
        return json({ duplicate: false, company_created: companyCreated, ...(detail ? detailForModel(detail) : { contact: data }) });
      })
  );

  // ---------------------------------------------------------------------------
  // update_contact
  // ---------------------------------------------------------------------------
  server.registerTool(
    "update_contact",
    {
      title: "Update contact fields",
      description:
        "Patch fields on an existing contact (phone, title, email, flags, notes, dates, company...). " +
        "Use update_status to change status so the soft_no rule is applied. Only the fields you pass are changed.",
      inputSchema: {
        contact_id: z.string().uuid(),
        first_name: z.string().min(1).optional(),
        last_name: z.string().nullable().optional(),
        linkedin_url: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        email_verified: z.boolean().optional(),
        phone: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        type: z.enum(TYPES).nullable().optional(),
        date_requested: dateStr.nullable().optional(),
        date_accepted: dateStr.nullable().optional(),
        best_fit: z.boolean().optional(),
        asu_tie: z.boolean().optional(),
        recontact_after: dateStr.nullable().optional(),
        notes: z.string().nullable().optional().describe("Replaces notes. To append, use append_note instead."),
        append_note: z.string().optional().describe("Appends a dated line to notes without replacing them"),
        company_id: z.string().uuid().nullable().optional(),
        company: z
          .object({ name: z.string().min(1), domain: z.string().optional(), industry: z.string().optional(), location: z.string().optional() })
          .optional()
          .describe("Link (or create) a company by name/domain"),
      },
    },
    async ({ contact_id, append_note, company, ...patch }) =>
      run(async () => {
        const update: Record<string, unknown> = { ...patch };
        if (company) update.company_id = (await findOrCreateCompany(company)).company.id;
        if (append_note) {
          const { data: cur, error } = await db().from("contacts").select("notes").eq("id", contact_id).single();
          if (error) fail(error, "update_contact(read notes)");
          const stamp = new Date().toISOString().slice(0, 10);
          update.notes = [cur?.notes, `${stamp}: ${append_note.trim()}`].filter(Boolean).join("\n");
        }
        if (!Object.keys(update).length) return errorResult("No fields to update.");
        const { error } = await db().from("contacts").update(update).eq("id", contact_id);
        if (error) fail(error, "update_contact");
        const detail = await contactDetail(contact_id);
        if (!detail) return errorResult(`Contact ${contact_id} not found.`);
        return json(detailForModel(detail));
      })
  );

  // ---------------------------------------------------------------------------
  // log_touch
  // ---------------------------------------------------------------------------
  server.registerTool(
    "log_touch",
    {
      title: "Log a touch",
      description:
        "Record one message: your outbound send OR their inbound reply. Inserts the touch, sets " +
        "contacts.last_touch_at and increments touch_count. Store the hook so a follow-up can reference " +
        "the original angle. Does NOT change status: call update_status afterwards (e.g. accepted -> messaged, " +
        "messaged -> replied).",
      inputSchema: {
        contact_id: z.string().uuid(),
        direction: z.enum(DIRECTIONS),
        channel: z.enum(CHANNELS),
        sent_at: z.string().optional().describe("ISO timestamp; defaults to now"),
        subject: z.string().optional().describe("Email subject line"),
        hook: z.string().optional().describe("The angle / opener used"),
        body: z.string().optional().describe("Full message text"),
      },
    },
    async ({ contact_id, direction, channel, sent_at, subject, hook, body }) =>
      run(async () => {
        const { data, error } = await db().rpc("log_touch", {
          p_contact_id: contact_id,
          p_direction: direction,
          p_channel: channel,
          p_sent_at: sent_at ?? new Date().toISOString(),
          p_subject: subject ?? null,
          p_hook: hook ?? null,
          p_body: body ?? null,
        });
        if (error) fail(error, "log_touch");
        const detail = await contactDetail(contact_id);
        return json({
          touch: data,
          contact: detail ? summarize(detail.contact, detail.company?.name) : null,
          reminder: "Update status if this touch changes it (accepted -> messaged, messaged -> replied).",
        });
      })
  );

  // ---------------------------------------------------------------------------
  // update_status
  // ---------------------------------------------------------------------------
  server.registerTool(
    "update_status",
    {
      title: "Update contact status",
      description:
        "Set the pipeline status. Values: requested, accepted, messaged, replied, live, soft_no, " +
        "hard_decline, signed, closed, skipped. soft_no automatically sets recontact_after to today + 6 months. " +
        "soft_no (future lead) and hard_decline (never again) must stay separate. " +
        "An optional note is appended to the contact's notes with today's date.",
      inputSchema: {
        contact_id: z.string().uuid(),
        status: z.enum(STATUSES),
        note: z.string().optional(),
      },
    },
    async ({ contact_id, status, note }) =>
      run(async () => {
        const { data, error } = await db().rpc("set_contact_status", {
          p_contact_id: contact_id,
          p_status: status,
          p_note: note ?? null,
        });
        if (error) fail(error, "set_contact_status");
        return json({ contact: data });
      })
  );

  // ---------------------------------------------------------------------------
  // get_followups_due
  // ---------------------------------------------------------------------------
  server.registerTool(
    "get_followups_due",
    {
      title: "Follow-ups due",
      description:
        "Contacts with status 'messaged', last touch more than 7 days ago, and fewer than 2 touches " +
        "(two-touch maximum). Oldest first.",
      inputSchema: {},
    },
    async () =>
      run(async () => {
        const { data, error } = await db().from("followups_due").select("*");
        if (error) fail(error, "followups_due");
        const rows = (data ?? []) as (Contact & { company_name: string | null })[];
        return json({ count: rows.length, contacts: rows.map((c) => summarize(c, c.company_name)) });
      })
  );

  // ---------------------------------------------------------------------------
  // get_recontactable
  // ---------------------------------------------------------------------------
  server.registerTool(
    "get_recontactable",
    {
      title: "Recontactable soft-nos",
      description: "Contacts with status 'soft_no' whose recontact_after date has passed. Oldest first.",
      inputSchema: {},
    },
    async () =>
      run(async () => {
        const { data, error } = await db().from("recontactable").select("*");
        if (error) fail(error, "recontactable");
        const rows = (data ?? []) as (Contact & { company_name: string | null })[];
        return json({ count: rows.length, contacts: rows.map((c) => summarize(c, c.company_name)) });
      })
  );

  // ---------------------------------------------------------------------------
  // list_contacts
  // ---------------------------------------------------------------------------
  server.registerTool(
    "list_contacts",
    {
      title: "List contacts",
      description: "List contacts, optionally filtered by status and/or type. Compact rows, newest first.",
      inputSchema: {
        status: z.enum(STATUSES).optional(),
        type: z.enum(TYPES).optional(),
        best_fit: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, type, best_fit, limit }) =>
      run(async () => {
        let q = db()
          .from("contacts")
          .select("*, company:companies(name)")
          .order("updated_at", { ascending: false })
          .limit(limit ?? 50);
        if (status) q = q.eq("status", status);
        if (type) q = q.eq("type", type);
        if (best_fit !== undefined) q = q.eq("best_fit", best_fit);
        const { data, error } = await q;
        if (error) fail(error, "list_contacts");
        const rows = (data ?? []) as (Contact & { company: { name: string } | null })[];
        return json({ count: rows.length, contacts: rows.map((c) => summarize(c, c.company?.name)) });
      })
  );
}
