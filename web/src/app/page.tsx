import Link from "next/link";
import { ContactTable } from "@/components/ContactTable";
import { Card, Empty, StatusBadge, daysAgo, fmtDate } from "@/components/ui";
import { getAcceptedNotMessaged, getFollowupsDue, getNeedsAction, getRecontactable, getStatusCounts } from "@/lib/queries";
import { STATUSES, fullName, type Status } from "@/lib/types";

export default async function TodayPage() {
  const [counts, followups, recontact, needsAction, accepted] = await Promise.all([
    getStatusCounts(), getFollowupsDue(), getRecontactable(), getNeedsAction(), getAcceptedNotMessaged(),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Link href="/contacts" className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50">
          <span className="font-semibold tabular-nums">{total}</span> <span className="text-zinc-500">total</span>
        </Link>
        {STATUSES.filter((s) => counts[s]).map((s) => (
          <Link key={s} href={`/contacts?status=${s}`} className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50">
            <StatusBadge status={s as Status} />
            <span className="font-semibold tabular-nums">{counts[s]}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Needs action · ${needsAction.length}`}>
          {needsAction.length ? <ContactTable contacts={needsAction} /> : <Empty>Nothing replied or live.</Empty>}
        </Card>

        <Card title={`Follow-ups due · ${followups.length}`}>
          <p className="mb-3 text-xs text-zinc-500">Messaged, no reply in 7+ days, fewer than 2 touches.</p>
          {followups.length ? (
            <ul className="divide-y divide-zinc-100">
              {followups.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{fullName(c)}</Link>
                    {c.company_name && <span className="text-zinc-500"> · {c.company_name}</span>}
                  </div>
                  <span className="text-xs text-zinc-500">last touch {daysAgo(c.last_touch_at)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>No follow-ups due.</Empty>}
        </Card>

        <Card title={`Accepted, not yet messaged · ${accepted.length}`}>
          {accepted.length ? <ContactTable contacts={accepted} /> : <Empty>Everyone who accepted has been messaged.</Empty>}
        </Card>

        <Card title={`Recontactable soft-nos · ${recontact.length}`}>
          <p className="mb-3 text-xs text-zinc-500">Soft no with a recontact date that has passed.</p>
          {recontact.length ? (
            <ul className="divide-y divide-zinc-100">
              {recontact.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{fullName(c)}</Link>
                    {c.company_name && <span className="text-zinc-500"> · {c.company_name}</span>}
                  </div>
                  <span className="text-xs text-zinc-500">since {fmtDate(c.recontact_after)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>None due.</Empty>}
        </Card>
      </div>
    </div>
  );
}
