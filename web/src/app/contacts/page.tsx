import Link from "next/link";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { ContactTable } from "@/components/ContactTable";
import { getStatusCounts, listContactRows } from "@/lib/queries";
import { CLOSED_STATUSES, SOURCES, SOURCE_LABEL, STATUSES, STATUS_LABEL, TYPES, type Status } from "@/lib/types";

type Search = { q?: string; status?: string; type?: string; source?: string; best_fit?: string; closed?: string; sort?: string };
const SORTS = { updated: "Recently updated", last_touch: "Longest since contact", added: "Newest added", name: "Name A–Z" } as const;
type Sort = keyof typeof SORTS;

const TAB_ORDER: Status[] = ["live", "replied", "messaged", "accepted", "requested", "soft_no", "signed", "hard_decline", "closed", "skipped"];

const fieldCls =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-100";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as Status) : "";
  const type = (TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : "";
  const source = (SOURCES as readonly string[]).includes(sp.source ?? "") ? sp.source! : "";
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : "updated";
  const bestFit = sp.best_fit === "1";
  const includeClosed = sp.closed === "1";

  const [contacts, counts] = await Promise.all([
    listContactRows({ q: sp.q, status, type, source, bestFit, includeClosed, sort }),
    getStatusCounts(),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const activeTotal = total - CLOSED_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0);

  // Build a link that keeps the current filters but changes one param.
  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/contacts?${qs}` : "/contacts";
  };
  const filtered = Boolean(sp.q || type || source || bestFit);

  const tabCls = (on: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
      on ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
    }`;
  const countCls = (on: boolean) => `rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-white/20" : "bg-zinc-100 text-zinc-500"}`;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-500">{activeTotal} in the pipeline · {total} total</p>
        </div>
        <Link href="/contacts/new" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">+ Add contact</Link>
      </div>

      {/* ---------- status tabs ---------- */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <Link href={href({ status: undefined, closed: undefined })} className={tabCls(!status && !includeClosed)}>
          Active <span className={countCls(!status && !includeClosed)}>{activeTotal}</span>
        </Link>
        {TAB_ORDER.filter((s) => counts[s]).map((s) => (
          <Link key={s} href={href({ status: s, closed: undefined })} className={tabCls(status === s)}>
            {STATUS_LABEL[s]} <span className={countCls(status === s)}>{counts[s]}</span>
          </Link>
        ))}
        <Link href={href({ status: undefined, closed: "1" })} className={tabCls(!status && includeClosed)}>
          Everyone <span className={countCls(!status && includeClosed)}>{total}</span>
        </Link>
      </nav>

      {/* ---------- filters ---------- */}
      <AutoSubmitForm className="flex flex-wrap items-center gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        {includeClosed && <input type="hidden" name="closed" value="1" />}
        <div className="relative min-w-72 max-w-xl flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>⌕</span>
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search name, email, LinkedIn, company… (Enter)"
            className={`${fieldCls} w-full pl-8`}
          />
        </div>
        <select name="type" defaultValue={type} className={fieldCls} aria-label="Type">
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select name="source" defaultValue={source} className={fieldCls} aria-label="Source">
          <option value="">All sources</option>
          {SOURCES.map((sv) => <option key={sv} value={sv}>{SOURCE_LABEL[sv]}</option>)}
        </select>
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm shadow-sm ${bestFit ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-zinc-200 bg-white text-zinc-700"}`}>
          <input type="checkbox" name="best_fit" value="1" defaultChecked={bestFit} className="sr-only" />★ Best fit
        </label>
        <select name="sort" defaultValue={sort} className={`${fieldCls} ml-auto`} aria-label="Sort">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v}</option>)}
        </select>
        {filtered && (
          <Link href={href({ q: undefined, type: undefined, source: undefined, best_fit: undefined })} className="text-sm text-zinc-500 hover:text-zinc-900">
            Clear filters
          </Link>
        )}
      </AutoSubmitForm>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 text-xs text-zinc-500">
          <span>
            <span className="font-semibold text-zinc-900">{contacts.length}</span> contact{contacts.length === 1 ? "" : "s"}
            {sp.q && <> matching “{sp.q}”</>}
          </span>
          <span className="hidden sm:inline">Click a row to preview messages</span>
        </div>
        <ContactTable contacts={contacts} />
      </div>
    </div>
  );
}
