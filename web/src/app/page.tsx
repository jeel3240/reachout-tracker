import Link from "next/link";
import { CopyButton } from "@/components/contact-detail";
import { MarkSentButton } from "@/components/forms";
import { ChannelTag, StatusBadge, daysAgo, fmtDate, fmtShort } from "@/components/ui";
import {
  getAcceptedNotMessaged, getActivityStats, getFollowupsDue, getNeedsAction, getPendingSends,
  getRecentActivity, getRecontactable, getStatusCounts, withTouches,
} from "@/lib/queries";
import { STATUSES, STATUS_LABEL, fullName, type Status, type Touch } from "@/lib/types";

const TZ = "America/Phoenix";

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: TZ }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const BAR: Record<Status, string> = {
  requested: "bg-slate-300", accepted: "bg-sky-400", messaged: "bg-amber-400", replied: "bg-violet-500", live: "bg-emerald-500",
  soft_no: "bg-orange-400", hard_decline: "bg-rose-400", signed: "bg-green-700", closed: "bg-zinc-300", skipped: "bg-zinc-200",
};

function Stat({ label, value, sub, href, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; accent?: string }) {
  const body = (
    <div className={`h-full rounded-2xl border bg-white p-4 transition ${href ? "hover:border-zinc-300 hover:shadow-sm" : ""} ${accent ?? "border-zinc-200"}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Section({ title, count, hint, tone, children }: { title: string; count: number; hint?: string; tone: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white">
      <header className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3.5">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden />
        <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600">{count}</span>
        {hint && <span className="ml-auto hidden text-xs text-zinc-400 sm:inline">{hint}</span>}
      </header>
      <div className="px-5 py-3">{children}</div>
    </section>
  );
}

/** Show the first `n` items, fold the rest behind a toggle. */
function Capped({ items, n }: { items: React.ReactNode[]; n: number }) {
  return (
    <>
      <ul className="divide-y divide-zinc-100">{items.slice(0, n)}</ul>
      {items.length > n && (
        <details className="group">
          <summary className="cursor-pointer select-none border-t border-zinc-100 py-2.5 text-center text-xs font-medium text-zinc-500 hover:text-zinc-900">
            <span className="group-open:hidden">Show all {items.length}</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">{items.slice(n)}</ul>
        </details>
      )}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-zinc-400">{children}</p>;
}

function Who({ id, name, company, title }: { id: string; name: string; company?: string | null; title?: string | null }) {
  return (
    <div className="min-w-0">
      <Link href={`/contacts/${id}`} className="font-medium text-zinc-900 hover:underline">{name}</Link>
      <div className="truncate text-xs text-zinc-500">{[title, company].filter(Boolean).join(" · ")}</div>
    </div>
  );
}

function lastBy(touches: Touch[], dir: Touch["direction"]) {
  return [...touches].reverse().find((t) => t.direction === dir && t.status === "sent");
}

export default async function TodayPage() {
  const [counts, followupsRaw, recontact, needsRaw, acceptedRaw, pending, activity, stats] = await Promise.all([
    getStatusCounts(), getFollowupsDue(), getRecontactable(), getNeedsAction(), getAcceptedNotMessaged(),
    getPendingSends(), getRecentActivity(), getActivityStats(),
  ]);
  const [needs, followups, accepted] = await Promise.all([withTouches(needsRaw), withTouches(followupsRaw), withTouches(acceptedRaw)]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const active = ["requested", "accepted", "messaged", "replied", "live"].reduce((n, s) => n + (counts[s] ?? 0), 0);
  const draftCount = pending.reduce((n, g) => n + g.touches.length, 0);
  const replyRate = stats.reached ? Math.round((stats.replied / stats.reached) * 100) : 0;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });

  // Replies first where they wrote last (ball in our court), oldest waiting first.
  const needsSorted = needs
    .map((c) => {
      const inbound = lastBy(c.touches, "inbound");
      const outbound = lastBy(c.touches, "outbound");
      const waiting = inbound && (!outbound || (inbound.sent_at ?? "") > (outbound.sent_at ?? ""));
      return { c, inbound, waiting };
    })
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || (a.inbound?.sent_at ?? "").localeCompare(b.inbound?.sent_at ?? ""));
  const waitingCount = needsSorted.filter((n) => n.waiting).length;

  const todo = [
    waitingCount && `${waitingCount} repl${waitingCount === 1 ? "y" : "ies"} waiting on you`,
    draftCount && `${draftCount} draft${draftCount === 1 ? "" : "s"} to send`,
    followups.length && `${followups.length} follow-up${followups.length === 1 ? "" : "s"} due`,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* ---------- greeting ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-zinc-500">{today}</div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{greeting()}, Jeel</h1>
          <p className="mt-1 text-sm text-zinc-600">{todo.length ? todo.join(" · ") : "Inbox zero. Nothing needs you right now."}</p>
        </div>
        <Link href="/contacts/new" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">+ Add contact</Link>
      </div>

      {/* ---------- stats ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Replies waiting" value={waitingCount} sub={`${needs.length} active conversations`} href="/contacts?status=live"
          accent={waitingCount ? "border-violet-300" : undefined} />
        <Stat label="Sent this week" value={stats.sentThisWeek} sub={`${stats.repliesThisWeek} replies received`} />
        <Stat label="Reply rate" value={`${replyRate}%`} sub={`${stats.replied} of ${stats.reached} people messaged`} />
        <Stat label="Pipeline" value={active} sub={`${counts.signed ?? 0} signed · ${total} total`} href="/contacts" />
      </div>

      {/* ---------- funnel ---------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100">
          {STATUSES.filter((s) => counts[s]).map((s) => (
            <div key={s} className={BAR[s]} style={{ width: `${(counts[s] / total) * 100}%` }} title={`${STATUS_LABEL[s]}: ${counts[s]}`} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {STATUSES.filter((s) => counts[s]).map((s) => (
            <Link key={s} href={`/contacts?status=${s}`} className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-900">
              <span className={`h-2 w-2 rounded-full ${BAR[s]}`} />
              {STATUS_LABEL[s]} <span className="font-semibold tabular-nums text-zinc-900">{counts[s]}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------- queue ---------- */}
        <div className="min-w-0 space-y-5">
          <Section title="Conversations" count={needs.length} hint="replied or live · waiting on you first" tone="bg-violet-500">
            {needsSorted.length ? (
              <ul className="divide-y divide-zinc-100">
                {needsSorted.map(({ c, inbound, waiting }) => (
                  <li key={c.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <Who id={c.id} name={fullName(c)} company={c.company?.name} title={c.title} />
                      <div className="flex shrink-0 items-center gap-2">
                        {waiting ? (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800">your move · {daysAgo(inbound!.sent_at)}</span>
                        ) : (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">waiting on them</span>
                        )}
                        <StatusBadge status={c.status} />
                      </div>
                    </div>
                    {inbound?.body && (
                      <Link href={`/contacts/${c.id}`} className="mt-2 block rounded-lg border-l-2 border-violet-300 bg-violet-50/50 px-3 py-2 text-[13px] leading-relaxed text-zinc-700 hover:bg-violet-50">
                        <span className="line-clamp-2">{inbound.body.replace(/^"|"$/g, "")}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Empty>No replies or live conversations.</Empty>}
          </Section>

          <Section title="Drafts to send" count={draftCount} hint="copy, send, then mark sent" tone="bg-amber-400">
            {pending.length ? (
              <Capped n={5} items={pending.flatMap((g) =>
                  g.touches.map((t) => (
                    <li key={t.touch_id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <Who id={g.contact.id} name={g.contact.name} company={g.contact.company} title={g.contact.title} />
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <ChannelTag channel={t.channel} />
                          <span>written {daysAgo(t.drafted_at)} by {t.created_by}</span>
                        </div>
                      </div>
                      {t.subject && <div className="mt-2 text-sm font-medium text-zinc-900">Subject: {t.subject}</div>}
                      {t.body && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">{t.body}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {t.body && <CopyButton text={t.body} label="Copy message" />}
                        {t.channel === "email" && g.contact.email && <CopyButton text={g.contact.email} label="Copy address" />}
                        {t.channel === "linkedin" && g.contact.linkedin_url && (
                          <a href={g.contact.linkedin_url} target="_blank" rel="noreferrer" className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs font-medium text-sky-700 hover:border-zinc-300">Open LinkedIn ↗</a>
                        )}
                        <span className="ml-auto"><MarkSentButton touch={{ id: t.touch_id, contact_id: g.contact.id }} small /></span>
                      </div>
                    </li>
                  ))
                )} />
            ) : <Empty>No drafts waiting. Anything Claude writes as a draft shows up here.</Empty>}
          </Section>

          <Section title="Follow-ups due" count={followups.length} hint="messaged 7+ days ago, one send so far" tone="bg-amber-600">
            {followups.length ? (
              <Capped n={8} items={followups.map((c) => {
                  const last = lastBy(c.touches, "outbound");
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Who id={c.id} name={fullName(c)} company={c.company_name} title={c.title} />
                      <div className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                        {last && <ChannelTag channel={last.channel} />}
                        <span className="tabular-nums">{daysAgo(c.last_touch_at)}</span>
                      </div>
                    </li>
                  );
                })} />
            ) : <Empty>No follow-ups due.</Empty>}
          </Section>

          <Section title="Accepted, not messaged" count={accepted.length} hint="connected on LinkedIn, no message yet" tone="bg-sky-400">
            {accepted.length ? (
              <Capped n={8} items={accepted.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Who id={c.id} name={fullName(c)} company={c.company?.name} title={c.title} />
                    <span className="shrink-0 text-xs text-zinc-500">{c.date_accepted ? `accepted ${fmtShort(c.date_accepted)}` : ""}</span>
                  </li>
                ))} />
            ) : <Empty>Everyone who accepted has been messaged.</Empty>}
          </Section>
        </div>

        {/* ---------- sidebar ---------- */}
        <aside className="space-y-5 lg:sticky lg:top-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent activity</h2>
            {activity.length ? (
              <ol className="space-y-3">
                {activity.map((t) => (
                  <li key={t.id} className="flex gap-2.5">
                    <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${t.direction === "inbound" ? "bg-violet-600" : "bg-zinc-900"}`}>
                      {t.direction === "inbound" ? "←" : "→"}
                    </span>
                    <div className="min-w-0 text-[13px] leading-snug">
                      {t.contact ? (
                        <Link href={`/contacts/${t.contact.id}`} className="font-medium text-zinc-900 hover:underline">{fullName(t.contact)}</Link>
                      ) : <span>Unknown</span>}
                      <span className="text-zinc-500">{t.direction === "inbound" ? " replied on " : " · you sent via "}{t.channel === "linkedin" ? "LinkedIn" : t.channel}</span>
                      <div className="text-xs text-zinc-400">{daysAgo(t.sent_at)}{t.contact?.company ? ` · ${t.contact.company.name}` : ""}</div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <Empty>No activity yet.</Empty>}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Soft nos to revisit</h2>
            <p className="mb-2 text-xs text-zinc-400">Recontact date has passed.</p>
            {recontact.length ? (
              <ul className="space-y-2">
                {recontact.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/contacts/${c.id}`} className="truncate font-medium text-zinc-900 hover:underline">{fullName(c)}</Link>
                    <span className="shrink-0 text-xs text-zinc-500">since {fmtDate(c.recontact_after)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-zinc-400">None due yet.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
