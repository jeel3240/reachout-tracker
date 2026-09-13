"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusBadge, Flag, TouchStatusBadge, ChannelTag, fmtDate, fmtDateTime, fmtShort, daysAgo } from "./ui";
import { MarkSentButton } from "./forms";
import { SOURCE_LABEL, channelStates, fullName, type ContactRow } from "@/lib/types";

const CHANNEL_NAME: Record<string, string> = { email: "Email", linkedin: "LinkedIn", call: "Call", meeting: "Meeting" };

function ChannelBadges({ row }: { row: ContactRow }) {
  const states = channelStates(row.touches);
  const inbound = row.touches.filter((t) => t.direction === "inbound").length;
  if (!states.length && !inbound) return <span className="text-zinc-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {states.map((s) => (
        <span
          key={s.channel}
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
            s.status === "sent" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"
          }`}
          title={s.status === "sent" ? `${CHANNEL_NAME[s.channel]} sent ${fmtDateTime(s.at)}${s.drafts ? `, ${s.drafts} draft pending` : ""}` : `${CHANNEL_NAME[s.channel]} drafted, not sent`}
        >
          {CHANNEL_NAME[s.channel]} {s.status === "sent" ? `sent ${fmtShort(s.at)}` : "drafted"}
          {s.status === "sent" && s.drafts > 0 && <span className="ml-1 text-amber-700">+{s.drafts} draft</span>}
        </span>
      ))}
      {inbound > 0 && (
        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-inset ring-violet-200">
          {inbound} repl{inbound === 1 ? "y" : "ies"}
        </span>
      )}
    </div>
  );
}

function TouchList({ row }: { row: ContactRow }) {
  if (!row.touches.length) return <p className="text-sm text-zinc-500">No touches logged.</p>;
  return (
    <ol className="space-y-2">
      {row.touches.map((t) => (
        <li key={t.id} className={`rounded-md border p-3 ${t.direction === "inbound" ? "border-violet-200 bg-violet-50/40" : "border-zinc-200 bg-white"}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className={`font-medium ${t.direction === "inbound" ? "text-violet-800" : "text-zinc-800"}`}>{t.direction === "inbound" ? "← They wrote" : "→ Outbound"}</span>
            <ChannelTag channel={t.channel} />
            {t.direction === "outbound" && <TouchStatusBadge status={t.status} />}
            <span>{t.status === "sent" ? fmtDateTime(t.sent_at) : `drafted ${fmtDateTime(t.created_at)}`}</span>
            <span className="text-zinc-400">by {t.created_by}</span>
            {t.status === "drafted" && <span className="ml-auto"><MarkSentButton touch={t} small /></span>}
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
  const cols = 8 + (showCompany ? 1 : 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-3 font-medium">Name</th>
            {showCompany && <th className="py-2 pr-3 font-medium">Company</th>}
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 font-medium">Source</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Touches</th>
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
                <td className="py-2 pr-3">
                  <span className="mr-1 inline-block w-3 text-xs text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                  <Link href={`/contacts/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-zinc-900 hover:underline">
                    {fullName(c)}
                  </Link>
                  {c.title && <div className="pl-4 text-xs text-zinc-500">{c.title}</div>}
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
                <td className="py-2 pr-3 text-zinc-600">{c.type ?? <span className="text-zinc-400">—</span>}</td>
                <td className="py-2 pr-3 text-zinc-600">{c.source ? SOURCE_LABEL[c.source] : <span className="text-zinc-400">—</span>}</td>
                <td className="py-2 pr-3"><StatusBadge status={c.status} /></td>
                <td className="py-2 pr-3"><ChannelBadges row={c} /></td>
                <td className="py-2 pr-3 text-zinc-600" title={c.last_touch_at ?? ""}>{daysAgo(c.last_touch_at) || <span className="text-zinc-400">never</span>}</td>
                <td className="py-2 pr-3 text-zinc-600">{fmtDate(c.date_requested)}</td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <Flag on={c.best_fit} label="best fit" />
                    <Flag on={c.asu_tie} label="ASU" />
                    <Flag on={!!c.email} label="has email" />
                  </div>
                </td>
              </tr>,
              isOpen && (
                <tr key={`${c.id}-detail`} className="border-b border-zinc-100 bg-zinc-50/60">
                  <td colSpan={cols} className="px-4 py-3">
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
