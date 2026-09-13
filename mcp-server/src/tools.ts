import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CHANNELS, CLOSED_STATUSES, DIRECTIONS, SOURCES, STATUSES, TOUCH_STATUSES, TYPES,
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
      source: c.source,
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
        status: t.status,
        sent_at: t.sent_at,
        drafted_at: t.created_at,
        created_by: t.created_by,
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
        drafts_pending: d.touches.filter((t) => t.status === "drafted").length,
        outbound_sent: d.touches.filter((t) => t.direction === "outbound" && t.status === "sent").length,
        inbound: d.touches.filter((t) => t.direction === "inbound").length,
        channels_used: [...new Set(d.touches.filter((t) => t.status === "sent").map((t) => t.channel))],
        messaged_on_linkedin: d.touches.some((t) => t.direction === "outbound" && t.channel === "linkedin" && t.status === "sent"),
        emailed: d.touches.some((t) => t.direction === "outbound" && t.channel === "email" && t.status === "sent"),
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
        "at the moment the LinkedIn invite goes out, not when you first message them. date_accepted is never " +
        "assumed: pass it only if you know it. Always set source.",
      inputSchema: {
        first_name: z.string().min(1),
        last_name: z.string().optional(),
        linkedin_url: z.string().optional().describe("Primary dedupe key. Any linkedin.com/in/... form is fine."),
        email: z.string().optional(),
        email_verified: z.boolean().optional().describe("true only if found on their site / confirmed, not pattern-guessed"),
        phone: z.string().optional(),
        title: z.string().optional(),
        type: z.enum(TYPES).optional().describe("client | hiring | network | recruiter"),
        source: z.enum(SOURCES).optional().describe("Where they came from: cold_email | linkedin | referral | cc_surfaced | inbound"),
        status: z.enum(STATUSES).optional().describe("Defaults to 'requested'. soft_no auto-sets recontact_after."),
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
        source: z.enum(SOURCES).nullable().optional(),
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
        "Record one message. Outbound messages are logged as a DRAFT by default (status='drafted'): they do not " +
        "count as a touch, do not move last_touch_at, and sit in get_pending_sends until mark_sent is called with " +
        "the real send time. Pass status='sent' only when the message has definitely gone out. Inbound replies are " +
        "always 'sent'. ALWAYS put the full message text in body so it can be copied when sending. Store the hook " +
        "so a follow-up can reference the original angle. Does NOT change contact status: call update_status " +
        "when appropriate (e.g. messaged -> replied after logging an inbound).",
      inputSchema: {
        contact_id: z.string().uuid(),
        direction: z.enum(DIRECTIONS),
        channel: z.enum(CHANNELS),
        status: z.enum(TOUCH_STATUSES).default("drafted").optional()
          .describe("drafted (default) or sent. Ignored for inbound, which is always sent."),
        body: z.string().optional().describe("Full message text. Required in practice: this is what gets copied and sent."),
        subject: z.string().optional().describe("Email subject line"),
        hook: z.string().optional().describe("The angle / opener used"),
        sent_at: z.string().optional().describe("ISO timestamp. Only meaningful with status='sent' or inbound; defaults to now then."),
        created_by: z.string().optional().describe("Who wrote it, e.g. 'jeel'. Defaults to 'jeel'."),
      },
    },
    async ({ contact_id, direction, channel, status, body, subject, hook, sent_at, created_by }) =>
      run(async () => {
        const { data, error } = await db().rpc("log_touch", {
          p_contact_id: contact_id,
          p_direction: direction,
          p_channel: channel,
          p_sent_at: sent_at ?? null,
          p_subject: subject ?? null,
          p_hook: hook ?? null,
          p_body: body ?? null,
          p_status: status ?? "drafted",
          p_created_by: created_by ?? "jeel",
        });
        if (error) fail(error, "log_touch");
        const touch = data as { id: string; status: string };
        const detail = await contactDetail(contact_id);
        return json({
          touch: data,
          contact: detail ? summarize(detail.contact, detail.company?.name) : null,
          next:
            touch.status === "drafted"
              ? `Draft saved. When it has actually been sent, call mark_sent(touch_id="${touch.id}", sent_at=<real time>).`
              : "Update contact status if this touch changes it (accepted -> messaged, messaged -> replied).",
        });
      })
  );

  // ---------------------------------------------------------------------------
  // mark_sent
  // ---------------------------------------------------------------------------
  server.registerTool(
    "mark_sent",
    {
      title: "Mark a drafted touch as sent",
      description:
        "Flip a touch from drafted to sent and record the actual send time. This is what makes it count: " +
        "contacts.last_touch_at and touch_count update here, not when the draft was written. Calling it on an " +
        "already-sent touch only corrects sent_at.",
      inputSchema: {
        touch_id: z.string().uuid().describe("From log_touch's result or get_pending_sends"),
        sent_at: z.string().optional().describe("ISO timestamp of the real send; defaults to now"),
      },
    },
    async ({ touch_id, sent_at }) =>
      run(async () => {
        const { data, error } = await db().rpc("mark_sent", {
          p_touch_id: touch_id,
          p_sent_at: sent_at ?? new Date().toISOString(),
        });
        if (error) fail(error, "mark_sent");
        const touch = data as { contact_id: string };
        const detail = await contactDetail(touch.contact_id);
        return json({
          touch: data,
          contact: detail ? summarize(detail.contact, detail.company?.name) : null,
          reminder: "If this was the first message to them, update_status to 'messaged'.",
        });
      })
  );

  // ---------------------------------------------------------------------------
  // unmark_sent
  // ---------------------------------------------------------------------------
  server.registerTool(
    "unmark_sent",
    {
      title: "Revert a sent touch to drafted",
      description:
        "Undo a wrong mark_sent: sets the touch back to status='drafted' with no send time, and recomputes " +
        "the contact's touch_count and last_touch_at from the remaining sent touches. Not allowed on inbound " +
        "touches (delete those instead).",
      inputSchema: { touch_id: z.string().uuid() },
    },
    async ({ touch_id }) =>
      run(async () => {
        const { data, error } = await db().rpc("unmark_sent", { p_touch_id: touch_id });
        if (error) fail(error, "unmark_sent");
        const touch = data as { contact_id: string };
        const detail = await contactDetail(touch.contact_id);
        return json({ touch: data, contact: detail ? summarize(detail.contact, detail.company?.name) : null });
      })
  );

  // ---------------------------------------------------------------------------
  // delete_touch
  // ---------------------------------------------------------------------------
  server.registerTool(
    "delete_touch",
    {
      title: "Delete a touch",
      description:
        "Permanently delete one touch (e.g. an accidental duplicate) and recompute the contact's touch_count " +
        "and last_touch_at. Use search_contact first to confirm the touch_id; this cannot be undone.",
      inputSchema: { touch_id: z.string().uuid() },
    },
    async ({ touch_id }) =>
      run(async () => {
        const { data, error } = await db().rpc("delete_touch", { p_touch_id: touch_id });
        if (error) fail(error, "delete_touch");
        const touch = data as { contact_id: string };
        const detail = await contactDetail(touch.contact_id);
        return json({ deleted: data, contact: detail ? summarize(detail.contact, detail.company?.name) : null });
      })
  );

  // ---------------------------------------------------------------------------
  // get_pending_sends
  // ---------------------------------------------------------------------------
  server.registerTool(
    "get_pending_sends",
    {
      title: "Pending sends (drafts)",
      description:
        "Every touch with status='drafted', grouped by contact, oldest draft first. Each entry has channel, " +
        "subject, body, who drafted it and when. This is the daily 'what do I need to send' list; copy the body " +
        "from here, then call mark_sent(touch_id, sent_at).",
      inputSchema: {},
    },
    async () =>
      run(async () => {
        const { data, error } = await db().rpc("pending_sends");
        if (error) fail(error, "pending_sends");
        const groups = (data ?? []) as { contact: unknown; touches: unknown[] }[];
        return json({
          contacts: groups.length,
          drafts: groups.reduce((n, g) => n + g.touches.length, 0),
          pending: groups,
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
        "Contacts with status 'messaged', last touch more than 7 days ago, and outbound sends on fewer than 2 distinct days " +
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
      description:
        "List contacts, optionally filtered by status, type, source or best_fit. Compact rows, newest first. " +
        "By default only pipeline contacts are returned: signed, hard_decline, closed and skipped are hidden. " +
        "Pass include_closed=true to see everyone, or filter by one of those statuses explicitly.",
      inputSchema: {
        status: z.enum(STATUSES).optional(),
        type: z.enum(TYPES).optional(),
        source: z.enum(SOURCES).optional(),
        best_fit: z.boolean().optional(),
        include_closed: z.boolean().default(false).optional()
          .describe("Include signed / hard_decline / closed / skipped. Default false."),
        limit: z.number().int().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, type, source, best_fit, include_closed, limit }) =>
      run(async () => {
        let q = db()
          .from("contacts")
          .select("*, company:companies(name)")
          .order("updated_at", { ascending: false })
          .limit(limit ?? 50);
        if (status) q = q.eq("status", status);
        else if (!include_closed) q = q.not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
        if (type) q = q.eq("type", type);
        if (source) q = q.eq("source", source);
        if (best_fit !== undefined) q = q.eq("best_fit", best_fit);
        const { data, error } = await q;
        if (error) fail(error, "list_contacts");
        const rows = (data ?? []) as (Contact & { company: { name: string } | null })[];
        return json({ count: rows.length, contacts: rows.map((c) => summarize(c, c.company?.name)) });
      })
  );
}
