import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteContact } from "@/app/actions";
import { ContactForm, StatusForm, TouchForm } from "@/components/forms";
import { Card, ChannelTag, Flag, StatusBadge, fmtDate, fmtDateTime } from "@/components/ui";
import { getContactDetail, listCompanyOptions } from "@/lib/queries";
import { STATUS_HINT, fullName } from "@/lib/types";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, companies] = await Promise.all([getContactDetail(id), listCompanyOptions()]);
  if (!detail) notFound();
  const { contact: c, company, touches } = detail;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{fullName(c)}</h1>
          <p className="text-sm text-zinc-600">
            {c.title}
            {c.title && company && " · "}
            {company && <Link href={`/companies/${company.id}`} className="hover:underline">{company.name}</Link>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            <span className="text-xs text-zinc-500">{STATUS_HINT[c.status]}</span>
            {c.type && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700">{c.type}</span>}
            <Flag on={c.best_fit} label="best fit" />
            <Flag on={c.asu_tie} label="ASU tie" />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-600 sm:grid-cols-3">
          <dt>Requested</dt><dd className="font-medium text-zinc-800">{fmtDate(c.date_requested) || "—"}</dd>
          <dt>Accepted</dt><dd className="font-medium text-zinc-800">{fmtDate(c.date_accepted) || "—"}</dd>
          <dt>Touches</dt><dd className="font-medium text-zinc-800">{c.touch_count}</dd>
          <dt>Last touch</dt><dd className="font-medium text-zinc-800">{fmtDateTime(c.last_touch_at) || "never"}</dd>
          {c.recontact_after && (<><dt>Recontact after</dt><dd className="font-medium text-zinc-800">{fmtDate(c.recontact_after)}</dd></>)}
        </dl>
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
          <div className="text-xs text-zinc-500">Email {c.email_verified ? <span className="text-emerald-700">· verified</span> : c.email ? <span className="text-amber-700">· unverified</span> : null}</div>
          <div>{c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : <span className="text-zinc-400">—</span>}</div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
          <div className="text-xs text-zinc-500">LinkedIn</div>
          <div className="truncate">{c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="hover:underline">{c.linkedin_url.replace("https://www.linkedin.com/", "")}</a> : <span className="text-zinc-400">—</span>}</div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
          <div className="text-xs text-zinc-500">Phone</div>
          <div>{c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : <span className="text-zinc-400">—</span>}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title={`Touches · ${touches.length}`}>
            {touches.length ? (
              <ol className="space-y-3">
                {touches.map((t) => (
                  <li key={t.id} className={`rounded-md border p-3 ${t.direction === "inbound" ? "border-violet-200 bg-violet-50/40" : "border-zinc-200 bg-zinc-50/60"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                      <span className={`font-medium ${t.direction === "inbound" ? "text-violet-800" : "text-zinc-800"}`}>{t.direction === "inbound" ? "← They wrote" : "→ You sent"}</span>
                      <ChannelTag channel={t.channel} />
                      <span>{fmtDateTime(t.sent_at)}</span>
                    </div>
                    {t.subject && <div className="mt-1 text-sm font-medium text-zinc-900">{t.subject}</div>}
                    {t.hook && <div className="mt-1 text-xs text-zinc-600"><span className="font-medium">Hook:</span> {t.hook}</div>}
                    {t.body && <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-zinc-800">{t.body}</pre>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-zinc-500">No touches logged. Nothing has been sent to this person yet.</p>
            )}
          </Card>

          <Card title="Log a touch">
            <TouchForm contact={c} />
          </Card>

          {c.notes && (
            <Card title="Notes">
              <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800">{c.notes}</pre>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Status">
            <StatusForm contact={c} />
          </Card>
          {company && (
            <Card title="Company" action={<Link href={`/companies/${company.id}`} className="text-xs text-zinc-600 hover:underline">open</Link>}>
              <div className="text-sm">
                <div className="font-medium">{company.name}</div>
                <div className="text-zinc-600">{[company.domain, company.industry, company.location].filter(Boolean).join(" · ")}</div>
                {company.notes && <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-zinc-700">{company.notes}</pre>}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Card title="Edit details">
        <ContactForm contact={c} company={company} companies={companies} />
      </Card>

      <form action={deleteContact} className="flex justify-end">
        <input type="hidden" name="id" value={c.id} />
        <button className="text-xs text-rose-700 hover:underline">Delete this contact and all touches</button>
      </form>
    </div>
  );
}
