"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { quickMarkSent } from "@/app/actions";
import { channelStates, type Touch } from "@/lib/types";
import { fmtShort } from "./ui";

const LABEL = { email: "Email", linkedin: "LinkedIn" } as const;

function Mark({ contactId, channel, touches }: { contactId: string; channel: "email" | "linkedin"; touches: Touch[] }) {
  const [state, action] = useActionState(quickMarkSent, undefined);
  const st = channelStates(touches).find((s) => s.channel === channel);
  const sent = st?.status === "sent";
  const hasDraft = (st?.drafts ?? 0) > 0;
  const sends = touches.filter((t) => t.direction === "outbound" && t.channel === channel && t.status === "sent").length;

  const label = sent
    ? `${LABEL[channel]} sent ${fmtShort(st!.at)}${sends > 1 ? ` (×${sends})` : ""}${hasDraft ? " · draft ready" : ""}`
    : hasDraft
      ? `${LABEL[channel]} draft ready`
      : LABEL[channel];
  const title = sent
    ? hasDraft
      ? `A ${LABEL[channel]} draft is waiting. Click to mark it sent.`
      : `Already sent. Expand the row to revert or delete, or use "Log a touch" for a follow-up.`
    : hasDraft
      ? `Mark the ${LABEL[channel]} draft as sent now`
      : `Log that you sent a ${LABEL[channel]} message now`;

  const inert = sent && !hasDraft;
  if (inert) {
    return (
      <span
        title={title}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-300"
      >
        <span aria-hidden>☑</span>
        {label}
      </span>
    );
  }

  return (
    <form action={action} onClick={(e) => e.stopPropagation()} className="inline-flex items-center">
      <input type="hidden" name="contact_id" value={contactId} />
      <input type="hidden" name="channel" value={channel} />
      <Button label={label} title={title} sent={sent} hasDraft={hasDraft} />
      {state?.error && <span className="ml-1 text-[11px] text-rose-700">{state.error}</span>}
    </form>
  );
}

function Button({ label, title, sent, hasDraft }: { label: string; title: string; sent: boolean; hasDraft: boolean }) {
  const { pending } = useFormStatus();
  const cls = sent
    ? "bg-emerald-50 text-emerald-800 ring-emerald-300"
    : hasDraft
      ? "bg-amber-50 text-amber-800 ring-amber-300"
      : "bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50";
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset disabled:opacity-50 ${cls}`}
    >
      <span aria-hidden>{pending ? "…" : sent ? "☑" : "☐"}</span>
      {label}
    </button>
  );
}

/** Two one-click marks: "I sent the email", "I sent the LinkedIn message". */
export function QuickMarks({ contactId, touches, compact = false }: { contactId: string; touches: Touch[]; compact?: boolean }) {
  const replies = touches.filter((t) => t.direction === "inbound").length;
  const other = channelStates(touches).filter((s) => s.channel === "call" || s.channel === "meeting");
  return (
    <div className="flex items-center gap-1">
      <Mark contactId={contactId} channel="email" touches={touches} />
      <Mark contactId={contactId} channel="linkedin" touches={touches} />
      {!compact && other.map((s) => (
        <span key={s.channel} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700">
          {s.channel === "call" ? "Call" : "Meeting"} {s.status === "sent" ? fmtShort(s.at) : "planned"}
        </span>
      ))}
      {!compact && replies > 0 && (
        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-inset ring-violet-200">
          {replies} repl{replies === 1 ? "y" : "ies"}
        </span>
      )}
    </div>
  );
}
