# Reachout Tracker

Single-user outreach pipeline on Supabase, with a web dashboard and an MCP server so Claude Code can
search, add, and update contacts directly during a session.

```
supabase/migrations/   schema + SQL functions (the business rules live here, shared by both clients)
mcp-server/            MCP server (stdio) for Claude Code, plus the CSV importer
web/                   Next.js dashboard
.mcp.json              Claude Code picks the server up automatically in this folder
```

## 1. Database

Create a Supabase project, then apply the migration. Either:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

or paste `supabase/migrations/20260907000000_init.sql` into the SQL editor and run it.

What it creates:

- `companies`, `contacts`, `touches` with the check constraints, indexes, and unique keys from the spec
  (`contacts.linkedin_url`, `companies.domain`).
- Triggers that normalise `linkedin_url`, `email`, and `domain` on every write, so
  `LinkedIn.com/in/Name/?trk=x` and `https://www.linkedin.com/in/name` dedupe against each other.
- `search_contacts(q)`, `contact_detail(id)`, `company_detail(q)`, `log_touch(...)`,
  `set_contact_status(...)`, and the `followups_due` / `recontactable` views.
- Row Level Security on with no policies. Only the service role key can read or write.
  Both the MCP server and the web app run server-side with that key. Never put it in a browser.

## 2. MCP server for Claude Code

```bash
npm install                      # installs both workspaces
cp mcp-server/.env.example mcp-server/.env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

`.mcp.json` in the repo root registers the server (run via `tsx`, no build step), so opening Claude Code in this folder is enough.
Run `/mcp` inside Claude Code to confirm `reachout-tracker` is connected.

To use it from any other project, add it globally instead:

```bash
claude mcp add --scope user reachout-tracker -- npx tsx "/Users/jeelkakadiya/Desktop/reachout tracker/mcp-server/src/index.ts"
```

Tools:

| Tool | What it does |
|---|---|
| `search_contact(query)` | Fuzzy match on name, email, LinkedIn URL, company name, domain. Returns contact + company + every touch in one call. Call first. |
| `get_company(name_or_domain)` | Company plus all contacts under it. Catches the second-person-at-same-company case. |
| `add_contact(...)` | Creates contact and company. If `linkedin_url` or `email` already exists, inserts nothing and returns the existing record with `duplicate: true`. |
| `update_contact(contact_id, ...)` | Patch any field. `append_note` adds a dated line without replacing notes. |
| `log_touch(contact_id, direction, channel, ...)` | Inserts the touch, updates `last_touch_at`, increments `touch_count`. Does not change status. |
| `update_status(contact_id, status, note)` | Sets status. `soft_no` sets `recontact_after` to today + 6 months. |
| `get_followups_due()` | `messaged`, last touch older than 7 days, fewer than 2 touches. |
| `get_recontactable()` | `soft_no` past its `recontact_after` date. |
| `list_contacts(status?, type?, best_fit?)` | Compact list for overviews. |

Typical session: `search_contact` → draft → `log_touch` → `update_status`.

## 3. Web dashboard

```bash
cp web/.env.example web/.env.local     # same two Supabase vars, optional APP_PASSWORD
npm run dev                             # http://localhost:3000
```

- **Today**: status counts, replied/live contacts needing action, follow-ups due, accepted-but-not-messaged,
  recontactable soft-nos.
- **Contacts**: search and filter, add, edit, log touches, change status, delete.
- **Companies**: every contact per company, with a warning when there is more than one.

If `APP_PASSWORD` is set, the site asks for it once and keeps a cookie for 90 days. Leave it unset for
local use. Set it before deploying anywhere public.

## 4. Import the Google Sheet

Export the sheet (`1KS3fXtyF-zgwz5kFu8eA_h8e1BfoGKv17KqYKf2vdYQ`) as CSV, then:

```bash
npm run import -- ~/Downloads/sheet.csv            # dry run: shows column mapping and what would happen
npm run import -- ~/Downloads/sheet.csv --commit   # writes
```

Headers are matched loosely (Name, First/Last, Company, Website/Domain, Email, LinkedIn, Phone, Title,
Type, Status, Date Requested, Date Accepted, Notes, and so on). Unrecognised columns are appended to notes.
Unrecognised status values default to `requested` and are listed at the end so you can add aliases in
`mcp-server/src/import-csv.ts`. Rows whose LinkedIn URL or email already exists are skipped.

## Status values

| Status | Meaning |
|---|---|
| `requested` | invite sent, not accepted yet |
| `accepted` | connected, not messaged |
| `messaged` | message sent, awaiting reply |
| `replied` | they responded, needs triage |
| `live` | active conversation, action needed |
| `soft_no` | polite pass, recontactable after `recontact_after` |
| `hard_decline` | never contact again |
| `signed` | paid engagement |
| `closed` | finished, no action |
| `skipped` | not worth pursuing |

Small defaults added on top of the spec: a new contact gets `date_requested = today`, and the first move
from `requested` into `accepted`/`messaged`/`replied`/`live`/`signed` sets `date_accepted = today` if empty.
