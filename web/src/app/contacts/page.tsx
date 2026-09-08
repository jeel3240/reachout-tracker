import { ContactTable } from "@/components/ContactTable";
import { inputCls } from "@/components/ui";
import { listContacts } from "@/lib/queries";
import { STATUSES, STATUS_LABEL, TYPES, type Status } from "@/lib/types";

type Search = { q?: string; status?: string; type?: string; best_fit?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as Status) : "";
  const type = (TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : "";
  const bestFit = sp.best_fit === "1";
  const contacts = await listContacts({ q: sp.q, status, type, bestFit });

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="min-w-64 flex-1">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, email, LinkedIn, company…" className={inputCls} />
        </div>
        <select name="status" defaultValue={status} className={`${inputCls} w-auto`}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select name="type" defaultValue={type} className={`${inputCls} w-auto`}>
          <option value="">Any type</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-zinc-700">
          <input type="checkbox" name="best_fit" value="1" defaultChecked={bestFit} className="h-4 w-4" /> best fit
        </label>
        <button className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">Filter</button>
      </form>
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="mb-2 text-xs text-zinc-500">{contacts.length} contact{contacts.length === 1 ? "" : "s"}</p>
        <ContactTable contacts={contacts} />
      </div>
    </div>
  );
}
