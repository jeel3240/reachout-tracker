"use client";

import Link from "next/link";
import { useState } from "react";
import { ChannelTag, StatusBadge, TouchStatusBadge, daysAgo, fmtDate, fmtDateTime } from "./ui";
import { TouchActions } from "./forms";
import { QuickMarks } from "./QuickMarks";
import { CopyButton, MessageBody } from "./contact-detail";
import { SOURCE_LABEL, fullName, type ContactRow } from "@/lib/types";

const AVATAR = ["bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800", "bg-indigo-100 text-indigo-800"];

function Avatar({ c }: { c: ContactRow }) {
  const initials = ((c.first_name[0] ?? "") + (c.last_name?.[0] ?? "")).toUpperCase();
  const tone = AVATAR[(c.first_name.charCodeAt(0) + (c.last_name?.charCodeAt(0) ?? 0)) % AVATAR.length];
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`}>{initials}</span>;
}

function CopyEmail({ email, verified }: { email: string | null; verified: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!email) return <span className="text-xs text-zinc-300">no email</span>;
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(email);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy email:", email);
        }
      }}
      title={`${email} · ${verified ? "verified" : "unverified"} · click to copy`}
      className={`inline-flex max-w-[230px] items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-left text-xs transition ${
        copied ? "bg-emerald-50 text-emerald-800" : "text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${verified ? "bg-emerald-500" : "bg-amber-400"}`} aria-hidden />
      <span className="truncate font-mono">{copied ? "Copied!" : email}</span>
    </button>
  );
}

function LinkedInLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-xs text-zinc-300">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={url}
      className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
    >
      <span className="rounded-sm bg-sky-700 px-0.5 text-[9px] font-bold leading-none text-white">in</span>
      Profile ↗
    </a>
  );
}

function Preview({ row }: { row: ContactRow }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Email</div>
          {row.email ? (
            <div className="mt-0.5 flex items-center gap-2">
              <span className="truncate font-mono text-xs">{row.email}</span>
              <CopyButton text={row.email} />
            </div>
          ) : <span className="text-zinc-400">none</span>}
        </div>
        {row.phone && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-400">Phone</div>
            <div className="mt-0.5 flex items-center gap-2">
              <a href={`tel:${row.phone}`} className="font-mono text-xs hover:underline">{row.phone}</a>
              <CopyButton text={row.phone} />
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          {row.date_requested && <span>Requested {fmtDate(row.date_requested)}</span>}
          {row.date_accepted && <span>Accepted {fmtDate(row.date_accepted)}</span>}
          {row.recontact_after && <span>Recontact {fmtDate(row.recontact_after)}</span>}
        </div>
        <Link href={`/contacts/${row.id}`} className="inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
          Open contact →
        </Link>
      </div>
      <div className="min-w-0">
        {row.touches.length ? (
          <ol className="space-y-3">
            {row.touches.map((t) => {
              const inbound = t.direction === "inbound";
              const draft = t.status === "drafted";
              return (
                <li
                  key={t.id}
                  className={`rounded-xl border p-3 ${inbound ? "border-violet-200 bg-violet-50/50" : draft ? "border-dashed border-amber-300 bg-amber-50/40" : "border-zinc-200 bg-white"}`}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span className={`font-semibold ${inbound ? "text-violet-900" : "text-zinc-900"}`}>{inbound ? "They replied" : draft ? "Draft" : "You sent"}</span>
                    <ChannelTag channel={t.channel} />
                    {!inbound && <TouchStatusBadge status={t.status} />}
                    <span>{draft ? `written ${fmtDateTime(t.created_at)}` : fmtDateTime(t.sent_at)}</span>
                    <span className="text-zinc-400">· by {t.created_by}</span>
                    <TouchActions touch={t} />
                  </div>
                  {t.subject && <div className="mb-1 text-sm font-medium text-zinc-900">Subject: {t.subject}</div>}
                  {t.body ? <MessageBody body={t.body.replace(/^"|"$/g, "")} tone={inbound ? "inbound" : "outbound"} /> : <p className="text-xs italic text-zinc-400">No message text stored.</p>}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400">No messages yet.</p>
        )}
      </div>
    </div>
  );
}

export function ContactTable({ contacts, showCompany = true }: { contacts: ContactRow[]; showCompany?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!contacts.length) {
    return <p className="py-16 text-center text-sm text-zinc-400">No contacts match these filters.</p>;
  }
  const cols = 7 + (showCompany ? 1 : 0);
  const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1150px] text-sm">
        <thead className="bg-zinc-50/80">
          <tr>
            <th className={`${th} pl-5`}>Contact</th>
            {showCompany && <th className={th}>Company</th>}
            <th className={th}>Status</th>
            <th className={th}>Sent</th>
            <th className={th}>Email</th>
            <th className={th}>LinkedIn</th>
            <th className={th}>Last touch</th>
            <th className={`${th} pr-5`}>Tags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {contacts.map((c) => {
            const isOpen = open === c.id;
            const replies = c.touches.filter((t) => t.direction === "inbound").length;
            return [
              <tr
                key={c.id}
                onClick={() => setOpen(isOpen ? null : c.id)}
                className={`cursor-pointer transition ${isOpen ? "bg-zinc-50" : "hover:bg-zinc-50/70"}`}
              >
                <td className="py-3 pl-5 pr-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] text-zinc-400 transition ${isOpen ? "rotate-90" : ""}`} aria-hidden>▶</span>
                    <Avatar c={c} />
                    <div className="min-w-0">
                      <Link href={`/contacts/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-zinc-900 hover:underline">
                        {fullName(c)}
                      </Link>
                      {c.title && <div className="max-w-[260px] truncate text-xs text-zinc-500" title={c.title}>{c.title}</div>}
                    </div>
                  </div>
                </td>
                {showCompany && (
                  <td className="max-w-[220px] px-3 py-3">
                    {c.company ? (
                      <Link href={`/companies/${c.company.id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-zinc-700 hover:underline" title={c.company.name}>
                        {c.company.name}
                      </Link>
                    ) : <span className="text-zinc-300">—</span>}
                  </td>
                )}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <StatusBadge status={c.status} />
                    {replies > 0 && <span className="rounded-full bg-violet-100 px-1.5 text-[11px] font-medium text-violet-800" title={`${replies} repl${replies === 1 ? "y" : "ies"}`}>↩ {replies}</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3"><QuickMarks contactId={c.id} touches={c.touches} compact /></td>
                <td className="px-3 py-3"><CopyEmail email={c.email} verified={c.email_verified} /></td>
                <td className="px-3 py-3"><LinkedInLink url={c.linkedin_url} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-600" title={c.last_touch_at ? fmtDateTime(c.last_touch_at) : ""}>
                  {daysAgo(c.last_touch_at) || <span className="text-zinc-300">never</span>}
                </td>
                <td className="py-3 pl-3 pr-5">
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    {c.type && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">{c.type}</span>}
                    {c.source && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500">{SOURCE_LABEL[c.source]}</span>}
                    {c.best_fit && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">★ fit</span>}
                    {c.asu_tie && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">ASU</span>}
                  </div>
                </td>
              </tr>,
              isOpen && (
                <tr key={`${c.id}-open`} className="bg-zinc-50">
                  <td colSpan={cols} className="px-5 pb-5 pt-1">
                    <Preview row={c} />
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
