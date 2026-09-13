"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusBadge, Flag, TouchStatusBadge, ChannelTag, fmtDate, fmtDateTime, daysAgo } from "./ui";
import { TouchActions } from "./forms";
import { QuickMarks } from "./QuickMarks";
import { SOURCE_LABEL, fullName, type ContactRow } from "@/lib/types";

function CopyEmail({ email, verified }: { email: string | null; verified: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!email) return <span className="text-zinc-400">—</span>;
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy email:", email);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`${verified ? "Verified" : "Unverified"} · click to copy`}
      className="inline-flex max-w-[260px] items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 text-left font-mono text-xs text-zinc-700 hover:bg-zinc-100"
    >
      <span className="truncate">{email}</span>
      <span className={`shrink-0 text-[10px] ${copied ? "text-emerald-700" : "text-zinc-400"}`}>{copied ? "copied" : verified ? "✓" : "?"}</span>
    </button>
  );
}

function LinkedInLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-zinc-400">—</span>;
  const slug = url.replace(/^https?:\/\/(www\.)?linkedin\.com\//, "").replace(/^in\//, "");
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open LinkedIn profile in a new tab"
      className="inline-block max-w-[160px] truncate align-middle text-xs text-sky-700 hover:underline"
    >
      {slug} ↗
    </a>
  );
}

function TouchList({ row }: { row: ContactRow }) {
  if (!row.touches.length) return <p className="text-sm text-zinc-500">No touches logged.</p>;
  return (
    <ol className="space-y-2">
      {row.touches.map((t) => (
        <li key={t.id} className={`rounded-md border p-3 ${t.direction === "inbound" ? "border-violet-200 bg-violet-50/40" : "border-zinc-200 bg-white"}`}>
          <div className="flex flex-wrap items-center gap-2 whitespace-nowrap text-xs text-zinc-600">
            <span className={`font-medium ${t.direction === "inbound" ? "text-violet-800" : "text-zinc-800"}`}>{t.direction === "inbound" ? "← They wrote" : "→ Outbound"}</span>
            <ChannelTag channel={t.channel} />
            {t.direction === "outbound" && <TouchStatusBadge status={t.status} />}
            <span>{t.status === "sent" ? fmtDateTime(t.sent_at) : `drafted ${fmtDateTime(t.created_at)}`}</span>
            <span className="text-zinc-400">by {t.created_by}</span>
            <TouchActions touch={t} />
          </div>
          {t.subject && <div className="mt-1 text-sm font-medium text-zinc-900">{t.subject}</div>}
          {t.hook && <div className="mt-1 text-xs text-zinc-600"><span className="font-medium">Hook:</span> {t.hook}</div>}
          {t.body ? (
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-zinc-800 select-all">{t.body}</pre>
          ) : (
            <p className="mt-2 text-xs italic text-zinc-400">No body stored.</p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ContactTable({ contacts, showCompany = true }: { contacts: ContactRow[]; showCompany?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!contacts.length) return <p className="py-6 text-center text-sm text-zinc-500">No contacts.</p>;
  const cols = 10 + (showCompany ? 1 : 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-3 font-medium">Name</th>
            {showCompany && <th className="py-2 pr-3 font-medium">Company</th>}
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 font-medium">Source</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Email</th>
            <th className="py-2 pr-3 font-medium">LinkedIn</th>
            <th className="py-2 pr-3 font-medium">Sent</th>
            <th className="py-2 pr-3 font-medium">Last touch</th>
            <th className="py-2 pr-3 font-medium">Requested</th>
            <th className="py-2 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => {
            const isOpen = open === c.id;
            return [
              <tr
                key={c.id}
                onClick={() => setOpen(isOpen ? null : c.id)}
                className={`cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 ${isOpen ? "bg-zinc-50" : ""}`}
              >
                <td className="min-w-[200px] py-2 pr-3">
                  <span className="mr-1 inline-block w-3 text-xs text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                  <Link href={`/contacts/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-zinc-900 hover:underline">
                    {fullName(c)}
                  </Link>
                  {c.title && <div className="max-w-[260px] truncate pl-4 text-xs text-zinc-500" title={c.title}>{c.title}</div>}
                </td>
                {showCompany && (
                  <td className="py-2 pr-3 text-zinc-700">
                    {c.company ? (
                      <Link href={`/companies/${c.company.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {c.company.name}
                      </Link>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap py-2 pr-3 text-zinc-600">{c.type ?? <span className="text-zinc-400">—</span>}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-zinc-600">{c.source ? SOURCE_LABEL[c.source] : <span className="text-zinc-400">—</span>}</td>
                <td className="py-2 pr-3"><StatusBadge status={c.status} /></td>
                <td className="py-2 pr-3"><CopyEmail email={c.email} verified={c.email_verified} /></td>
                <td className="py-2 pr-3"><LinkedInLink url={c.linkedin_url} /></td>
                <td className="whitespace-nowrap py-2 pr-3"><QuickMarks contactId={c.id} touches={c.touches} /></td>
                <td className="whitespace-nowrap py-2 pr-3 text-zinc-600" title={c.last_touch_at ?? ""}>{daysAgo(c.last_touch_at) || <span className="text-zinc-400">never</span>}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-zinc-600">{fmtDate(c.date_requested)}</td>
                <td className="py-2">
                  <div className="flex gap-1 whitespace-nowrap">
                    <Flag on={c.best_fit} label="best fit" />
                    <Flag on={c.asu_tie} label="ASU" />
                    <Flag on={!!c.email} label="has email" />
                  </div>
                </td>
              </tr>,
              isOpen && (
                <tr key={`${c.id}-detail`} className="border-b border-zinc-100 bg-zinc-50/60">
                  <td colSpan={cols} className="px-4 py-3">
                    <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-zinc-600">
                      <span className="flex items-center gap-1"><span className="font-medium text-zinc-500">Email</span> <CopyEmail email={c.email} verified={c.email_verified} /></span>
                      <span className="flex items-center gap-1"><span className="font-medium text-zinc-500">LinkedIn</span> <LinkedInLink url={c.linkedin_url} /></span>
                      {c.phone && <span><span className="font-medium text-zinc-500">Phone</span> <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="font-mono hover:underline">{c.phone}</a></span>}
                      <Link href={`/contacts/${c.id}`} onClick={(e) => e.stopPropagation()} className="ml-auto text-zinc-500 hover:underline">open full page →</Link>
                    </div>
                    <TouchList row={c} />
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
