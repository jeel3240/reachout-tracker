"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createContact, updateContact, logTouch, markSent, unmarkSent, deleteTouch, setStatus, updateCompany, login, type ActionState } from "@/app/actions";
import { CHANNELS, SOURCES, SOURCE_LABEL, STATUSES, STATUS_HINT, STATUS_LABEL, TYPES, type Company, type Contact, type Touch } from "@/lib/types";
import { inputCls, labelCls } from "./ui";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">Saved.</p>;
  return null;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded border-zinc-300" />
      {label}
    </label>
  );
}

type CompanyOption = Pick<Company, "id" | "name" | "domain">;

export function ContactForm({
  contact,
  company,
  companies,
}: {
  contact?: Contact;
  company?: Company | null;
  companies: CompanyOption[];
}) {
  const [state, action] = useActionState(contact ? updateContact : createContact, undefined);
  const c = contact;
  return (
    <form action={action} className="space-y-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name *"><input name="first_name" required defaultValue={c?.first_name} className={inputCls} /></Field>
        <Field label="Last name"><input name="last_name" defaultValue={c?.last_name ?? ""} className={inputCls} /></Field>
        <Field label="LinkedIn URL" className="sm:col-span-2">
          <input name="linkedin_url" defaultValue={c?.linkedin_url ?? ""} placeholder="linkedin.com/in/…" className={inputCls} />
        </Field>
        <Field label="Email"><input name="email" type="email" defaultValue={c?.email ?? ""} className={inputCls} /></Field>
        <Field label="Phone"><input name="phone" defaultValue={c?.phone ?? ""} className={inputCls} /></Field>
        <Field label="Title"><input name="title" defaultValue={c?.title ?? ""} className={inputCls} /></Field>
        <Field label="Type">
          <select name="type" defaultValue={c?.type ?? ""} className={inputCls}>
            <option value="">—</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Source (where they came from)">
          <select name="source" defaultValue={c?.source ?? ""} className={inputCls}>
            <option value="">—</option>
            {SOURCES.map((sv) => <option key={sv} value={sv}>{SOURCE_LABEL[sv]}</option>)}
          </select>
        </Field>
        {!c && (
          <Field label="Status">
            <select name="status" defaultValue="requested" className={inputCls}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} — {STATUS_HINT[s]}</option>)}
            </select>
          </Field>
        )}
        <Field label="Date requested"><input name="date_requested" type="date" defaultValue={c?.date_requested ?? ""} className={inputCls} /></Field>
        <Field label="Date accepted"><input name="date_accepted" type="date" defaultValue={c?.date_accepted ?? ""} className={inputCls} /></Field>
        {c && <Field label="Recontact after"><input name="recontact_after" type="date" defaultValue={c?.recontact_after ?? ""} className={inputCls} /></Field>}
      </div>

      <div className="flex flex-wrap gap-4">
        <Check name="email_verified" label="Email verified (found, not guessed)" defaultChecked={c?.email_verified} />
        <Check name="best_fit" label="Best fit" defaultChecked={c?.best_fit} />
        <Check name="asu_tie" label="ASU tie (confirmed)" defaultChecked={c?.asu_tie} />
      </div>

      <fieldset className="rounded-md border border-zinc-200 p-3">
        <legend className="px-1 text-xs font-medium text-zinc-600">Company</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Existing company" className="sm:col-span-2">
            <select name="company_id" defaultValue={company?.id ?? c?.company_id ?? ""} className={inputCls}>
              <option value="">— none / create new below —</option>
              {companies.map((co) => (
                <option key={co.id} value={co.id}>{co.name}{co.domain ? ` (${co.domain})` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="New company name"><input name="company_name" className={inputCls} /></Field>
          <Field label="Domain"><input name="company_domain" placeholder="securemedical.com" className={inputCls} /></Field>
          <Field label="Industry"><input name="company_industry" className={inputCls} /></Field>
          <Field label="Location"><input name="company_location" className={inputCls} /></Field>
        </div>
        <p className="mt-2 text-xs text-zinc-500">If a domain matches an existing company, that company is used and nothing new is created.</p>
      </fieldset>

      <Field label="Notes (research, caveats, things to avoid)">
        <textarea name="notes" rows={5} defaultValue={c?.notes ?? ""} className={inputCls} />
      </Field>

      <div className="flex items-center gap-3">
        <Submit>{c ? "Save changes" : "Add contact"}</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function TouchForm({ contact }: { contact: Contact }) {
  const [state, action] = useActionState(logTouch, undefined);
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const local = now.toISOString().slice(0, 16);
  const suggested = contact.status === "accepted" || contact.status === "requested" ? "messaged" : "";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="contact_id" value={contact.id} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Direction">
          <select name="direction" defaultValue="outbound" className={inputCls}>
            <option value="outbound">outbound (from us)</option>
            <option value="inbound">inbound (they replied)</option>
          </select>
        </Field>
        <Field label="Channel">
          <select name="channel" defaultValue="linkedin" className={inputCls}>
            {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue="drafted" className={inputCls}>
            <option value="drafted">drafted (not sent yet)</option>
            <option value="sent">sent</option>
          </select>
        </Field>
        <Field label="Written by">
          <input name="created_by" defaultValue="jeel" className={inputCls} />
        </Field>
        <Field label="Sent at (only if status is sent, or inbound)" className="col-span-2 sm:col-span-4">
          <input name="sent_at" type="datetime-local" defaultValue={local} className={inputCls} />
        </Field>
      </div>
      <Field label="Subject (email)"><input name="subject" className={inputCls} /></Field>
      <Field label="Hook / angle"><input name="hook" placeholder="What the message leads with, so a follow-up can reference it" className={inputCls} /></Field>
      <Field label="Body (full message text, copied from here when sending)"><textarea name="body" rows={6} className={inputCls} /></Field>
      <Field label="Also set status to">
        <select name="new_status" defaultValue={suggested} className={inputCls}>
          <option value="">— leave as {STATUS_LABEL[contact.status]} —</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </Field>
      <div className="flex items-center gap-3">
        <Submit>Log touch</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function StatusForm({ contact }: { contact: Contact }) {
  const [state, action] = useActionState(setStatus, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="contact_id" value={contact.id} />
      <select name="status" defaultValue={contact.status} className={inputCls}>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} — {STATUS_HINT[s]}</option>)}
      </select>
      <input name="note" placeholder="Note (optional, dated automatically)" className={inputCls} />
      <div className="flex items-center gap-3">
        <Submit>Update</Submit>
        <Feedback state={state} />
      </div>
      <p className="text-[11px] leading-snug text-zinc-400">Soft no sets recontact to +6 months. Hard decline is permanent.</p>
    </form>
  );
}

export function CompanyForm({ company }: { company: Company }) {
  const [state, action] = useActionState(updateCompany, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={company.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name *"><input name="name" required defaultValue={company.name} className={inputCls} /></Field>
        <Field label="Domain"><input name="domain" defaultValue={company.domain ?? ""} className={inputCls} /></Field>
        <Field label="Industry"><input name="industry" defaultValue={company.industry ?? ""} className={inputCls} /></Field>
        <Field label="Location"><input name="location" defaultValue={company.location ?? ""} className={inputCls} /></Field>
      </div>
      <Field label="Notes (about the company, not a person)"><textarea name="notes" rows={4} defaultValue={company.notes ?? ""} className={inputCls} /></Field>
      <div className="flex items-center gap-3">
        <Submit>Save</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <Field label="Password"><input name="password" type="password" autoFocus className={inputCls} /></Field>
      <div className="flex items-center gap-3">
        <Submit>Sign in</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function MarkSentButton({ touch, small = false }: { touch: Pick<Touch, "id" | "contact_id">; small?: boolean }) {
  const [state, action] = useActionState(markSent, undefined);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="touch_id" value={touch.id} />
      <input type="hidden" name="contact_id" value={touch.contact_id} />
      <input name="sent_at" type="datetime-local" className={`${inputCls} w-auto ${small ? "py-0.5 text-xs" : ""}`} />
      <Submit>Mark sent</Submit>
      <Feedback state={state} />
    </form>
  );
}

function SmallSubmit({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset disabled:opacity-50 ${
        danger ? "bg-white text-rose-700 ring-rose-200 hover:bg-rose-50" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50"
      }`}
    >
      {pending ? "…" : children}
    </button>
  );
}

/** Per-touch controls: mark sent (drafts), revert to draft (sent outbound), delete (any). */
export function TouchActions({ touch }: { touch: Pick<Touch, "id" | "contact_id" | "status" | "direction"> }) {
  const [rv, revert] = useActionState(unmarkSent, undefined);
  const [dl, del] = useActionState(deleteTouch, undefined);
  const hidden = (
    <>
      <input type="hidden" name="touch_id" value={touch.id} />
      <input type="hidden" name="contact_id" value={touch.contact_id} />
    </>
  );
  return (
    <span className="ml-auto inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {touch.status === "drafted" && <MarkSentButton touch={touch} small />}
      {touch.status === "sent" && touch.direction === "outbound" && (
        <form action={revert} onSubmit={(e) => { if (!confirm("Revert this touch to a draft? It will stop counting as sent.")) e.preventDefault(); }}>
          {hidden}
          <SmallSubmit>Revert to draft</SmallSubmit>
          {rv?.error && <span className="ml-1 text-[11px] text-rose-700">{rv.error}</span>}
        </form>
      )}
      <form action={del} onSubmit={(e) => { if (!confirm("Delete this touch permanently?")) e.preventDefault(); }}>
        {hidden}
        <SmallSubmit danger>Delete</SmallSubmit>
        {dl?.error && <span className="ml-1 text-[11px] text-rose-700">{dl.error}</span>}
      </form>
    </span>
  );
}
