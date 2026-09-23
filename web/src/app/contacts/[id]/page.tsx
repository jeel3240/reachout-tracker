import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteContact } from "@/app/actions";
import { CopyButton, MessageBody, SaveFoundField } from "@/components/contact-detail";
import { ContactForm, StatusForm, TouchActions, TouchForm } from "@/components/forms";
import { QuickMarks } from "@/components/QuickMarks";
import { ChannelTag, StatusBadge, TouchStatusBadge, daysAgo, fmtDate, fmtDateTime } from "@/components/ui";
import { getContactDetail, listCompanyOptions } from "@/lib/queries";
import { SOURCE_LABEL, STATUS_HINT, fullName, type Touch } from "@/lib/types";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;

/** Split notes into an undated research block and dated log entries. */
function parseNotes(notes: string | null) {
  if (!notes) return { research: "", entries: [] as { date: string; text: string }[] };
  const lines = notes.split("\n");
  const research: string[] = [];
  const entries: { date: string; text: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}):\s*(?:\d{4}-\d{2}-\d{2}:\s*)?(.*)$/);
    if (m) entries.push({ date: m[1], text: m[2] });
    else if (entries.length) entries[entries.length - 1].text += "\n" + line;
    else research.push(line);
  }
  return { research: research.join("\n").trim(), entries };
}

function initials(first: string, last: string | null) {
  return ((first[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-right text-sm text-zinc-900">{children}</dd>
    </div>
  );
}

function SideCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TouchItem({ t }: { t: Touch }) {
  const inbound = t.direction === "inbound";
  const draft = t.status === "drafted";
  return (
    <li className="relative pl-8">
      <span
        className={`absolute left-0 top-3 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-4 ring-zinc-50 ${
          inbound ? "bg-violet-600 text-white" : draft ? "bg-amber-400 text-white" : "bg-zinc-900 text-white"
        }`}
        aria-hidden
      >
        {inbound ? "←" : "→"}
      </span>
      <article
        className={`rounded-xl border p-4 ${
          inbound ? "border-violet-200 bg-violet-50/50" : draft ? "border-dashed border-amber-300 bg-amber-50/40" : "border-zinc-200 bg-white"
        }`}
      >
        <header className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className={`text-sm font-semibold ${inbound ? "text-violet-900" : "text-zinc-900"}`}>{inbound ? "They replied" : draft ? "Draft" : "You sent"}</span>
          <ChannelTag channel={t.channel} />
          {!inbound && <TouchStatusBadge status={t.status} />}
          <span title={t.sent_at ?? t.created_at}>{draft ? `written ${fmtDateTime(t.created_at)}` : fmtDateTime(t.sent_at)}</span>
          <span className="text-zinc-400">· by {t.created_by}</span>
          <TouchActions touch={t} />
        </header>
        {t.subject && <div className="mb-1 text-sm font-semibold text-zinc-900">Subject: {t.subject}</div>}
        {t.body ? <MessageBody body={t.body.replace(/^"|"$/g, "")} tone={inbound ? "inbound" : "outbound"} /> : <p className="text-sm italic text-zinc-400">No message text stored.</p>}
        {t.hook && (
          <details className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 open:pb-3">
            <summary className="cursor-pointer select-none font-medium text-zinc-500 hover:text-zinc-800">{inbound ? "Takeaways" : "Angle used"}</summary>
            <p className="mt-1.5 leading-relaxed">{t.hook}</p>
          </details>
        )}
      </article>
    </li>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, companies] = await Promise.all([getContactDetail(id), listCompanyOptions()]);
  if (!detail) notFound();
  const { contact: c, company, touches } = detail;

  const drafts = touches.filter((t) => t.status === "drafted").length;
  const { research, entries } = parseNotes(c.notes);
  const haystack = [c.notes, ...touches.flatMap((t) => [t.hook, t.body])].filter(Boolean).join("\n");
  const foundEmail = !c.email ? haystack.match(EMAIL_RE)?.[0] : undefined;
  const foundPhone = !c.phone ? haystack.match(PHONE_RE)?.[0] : undefined;
  const linkedinSlug = c.linkedin_url?.replace(/^https?:\/\/(www\.)?linkedin\.com\//, "");

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <Link href="/contacts" className="text-sm text-zinc-500 hover:text-zinc-900">← Contacts</Link>

      {/* ---------- header ---------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-lg font-semibold text-white">
            {initials(c.first_name, c.last_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{fullName(c)}</h1>
              <StatusBadge status={c.status} />
            </div>
            <p className="mt-0.5 text-sm text-zinc-600">
              {c.title}
              {c.title && company && <span className="text-zinc-400"> at </span>}
              {company && <Link href={`/companies/${company.id}`} className="font-medium text-zinc-800 hover:underline">{company.name}</Link>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-zinc-500">{STATUS_HINT[c.status]}</span>
              {c.type && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">{c.type}</span>}
              {c.source && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">via {SOURCE_LABEL[c.source]}</span>}
              {c.best_fit && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">★ best fit</span>}
              {c.asu_tie && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">ASU tie</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] uppercase tracking-wide text-zinc-400">Mark as sent</span>
            <QuickMarks contactId={c.id} touches={touches} />
          </div>
        </div>

        {/* contact channels */}
        <div className="mt-5 grid gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-3">
          <div className="min-w-0">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">
              Email {c.email && (c.email_verified ? <span className="normal-case text-emerald-600">· verified</span> : <span className="normal-case text-amber-600">· unverified</span>)}
            </div>
            {c.email ? (
              <div className="flex items-center gap-2">
                <a href={`mailto:${c.email}`} className="truncate font-mono text-sm text-zinc-900 hover:underline">{c.email}</a>
                <CopyButton text={c.email} />
              </div>
            ) : foundEmail ? (
              <SaveFoundField contactId={c.id} field="email" value={foundEmail} />
            ) : (
              <span className="text-sm text-zinc-400">none on file</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">Phone</div>
            {c.phone ? (
              <div className="flex items-center gap-2">
                <a href={`tel:${c.phone}`} className="font-mono text-sm text-zinc-900 hover:underline">{c.phone}</a>
                <CopyButton text={c.phone} />
              </div>
            ) : foundPhone ? (
              <SaveFoundField contactId={c.id} field="phone" value={foundPhone} />
            ) : (
              <span className="text-sm text-zinc-400">none on file</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">LinkedIn</div>
            {c.linkedin_url ? (
              <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-sm text-sky-700 hover:underline">
                {linkedinSlug} <span aria-hidden>↗</span>
              </a>
            ) : (
              <span className="text-sm text-zinc-400">none on file</span>
            )}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------- conversation ---------- */}
        <section className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">
              Conversation <span className="font-normal text-zinc-400">· {touches.length}</span>
              {drafts > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{drafts} draft{drafts > 1 ? "s" : ""} to send</span>}
            </h2>
          </div>

          {touches.length ? (
            <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[9px] before:top-3 before:w-px before:bg-zinc-200">
              {touches.map((t) => <TouchItem key={t.id} t={t} />)}
            </ol>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-10 text-center text-sm text-zinc-500">
              Nothing drafted or sent yet.
            </p>
          )}

          <details className="group mt-5 rounded-xl border border-zinc-200 bg-white">
            <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-700 hover:text-zinc-900">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-xs text-white group-open:rotate-45 transition">+</span>
              Log a message
            </summary>
            <div className="border-t border-zinc-100 p-4"><TouchForm contact={c} /></div>
          </details>
        </section>

        {/* ---------- sidebar ---------- */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <SideCard title="Status">
            <StatusForm contact={c} />
          </SideCard>

          <SideCard title="Timeline">
            <dl className="divide-y divide-zinc-100">
              <Fact label="Invite requested">{fmtDate(c.date_requested) || <span className="text-zinc-400">—</span>}</Fact>
              <Fact label="Accepted">{fmtDate(c.date_accepted) || <span className="text-zinc-400">—</span>}</Fact>
              <Fact label="Messages sent">
                {c.touch_count}
                {drafts > 0 && <span className="ml-1 text-xs text-amber-700">+{drafts} draft</span>}
              </Fact>
              <Fact label="Last touch">
                {c.last_touch_at ? <span title={fmtDateTime(c.last_touch_at)}>{daysAgo(c.last_touch_at)}</span> : <span className="text-zinc-400">never</span>}
              </Fact>
              {c.recontact_after && <Fact label="Recontact after">{fmtDate(c.recontact_after)}</Fact>}
            </dl>
          </SideCard>

          {company && (
            <SideCard title="Company" action={<Link href={`/companies/${company.id}`} className="text-xs text-zinc-500 hover:text-zinc-900">open →</Link>}>
              <div className="text-sm font-medium text-zinc-900">{company.name}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{[company.industry, company.location].filter(Boolean).join(" · ")}</div>
              {company.domain && (
                <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 hover:underline">
                  {company.domain} ↗
                </a>
              )}
              {company.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-600">{company.notes}</p>}
            </SideCard>
          )}

          {(research || entries.length > 0) && (
            <SideCard title="Notes">
              {research && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">{research}</p>}
              {entries.length > 0 && (
                <ul className={`space-y-2 ${research ? "mt-3 border-t border-zinc-100 pt-3" : ""}`}>
                  {entries.map((e, i) => (
                    <li key={i} className="text-[13px] leading-relaxed text-zinc-700">
                      <span className="mr-1.5 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">{fmtDate(e.date)}</span>
                      <span className="whitespace-pre-wrap">{e.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SideCard>
          )}
        </aside>
      </div>

      <details className="rounded-2xl border border-zinc-200 bg-white">
        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-zinc-700 hover:text-zinc-900">Edit contact details</summary>
        <div className="border-t border-zinc-100 p-5">
          <ContactForm contact={c} company={company} companies={companies} />
          <form action={deleteContact} className="mt-6 flex justify-end border-t border-zinc-100 pt-4">
            <input type="hidden" name="id" value={c.id} />
            <button className="text-xs text-rose-700 hover:underline">Delete this contact and all messages</button>
          </form>
        </div>
      </details>
    </div>
  );
}
