import Link from "next/link";
import { StatusBadge, Flag, fmtDate, daysAgo } from "./ui";
import { fullName, type ContactWithCompany } from "@/lib/types";

export function ContactTable({ contacts, showCompany = true }: { contacts: ContactWithCompany[]; showCompany?: boolean }) {
  if (!contacts.length) return <p className="py-6 text-center text-sm text-zinc-500">No contacts.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-3 font-medium">Name</th>
            {showCompany && <th className="py-2 pr-3 font-medium">Company</th>}
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium text-right">Touches</th>
            <th className="py-2 pr-3 font-medium">Last touch</th>
            <th className="py-2 pr-3 font-medium">Requested</th>
            <th className="py-2 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="py-2 pr-3">
                <Link href={`/contacts/${c.id}`} className="font-medium text-zinc-900 hover:underline">
                  {fullName(c)}
                </Link>
                {c.title && <div className="text-xs text-zinc-500">{c.title}</div>}
              </td>
              {showCompany && (
                <td className="py-2 pr-3 text-zinc-700">
                  {c.company ? (
                    <Link href={`/companies/${c.company.id}`} className="hover:underline">
                      {c.company.name}
                    </Link>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
              )}
              <td className="py-2 pr-3 text-zinc-600">{c.type ?? <span className="text-zinc-400">—</span>}</td>
              <td className="py-2 pr-3"><StatusBadge status={c.status} /></td>
              <td className="py-2 pr-3 text-right tabular-nums text-zinc-700">{c.touch_count}</td>
              <td className="py-2 pr-3 text-zinc-600" title={c.last_touch_at ?? ""}>{daysAgo(c.last_touch_at) || <span className="text-zinc-400">never</span>}</td>
              <td className="py-2 pr-3 text-zinc-600">{fmtDate(c.date_requested)}</td>
              <td className="py-2">
                <div className="flex gap-1">
                  <Flag on={c.best_fit} label="best fit" />
                  <Flag on={c.asu_tie} label="ASU" />
                  <Flag on={c.email_verified} label="email ✓" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
