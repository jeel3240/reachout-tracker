"use client";

import { useActionState, useState } from "react";
import { setContactField } from "@/app/actions";

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy:", text);
        }
      }}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition ${
        copied ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
      } ${className}`}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

/** Message text, clamped when long, with a copy button. */
export function MessageBody({ body, tone }: { body: string; tone: "outbound" | "inbound" }) {
  const long = body.length > 700;
  const [open, setOpen] = useState(!long);
  return (
    <div className="relative">
      <div
        className={`whitespace-pre-wrap text-[14px] leading-relaxed ${tone === "inbound" ? "text-zinc-800" : "text-zinc-800"} ${
          open ? "" : "line-clamp-6"
        }`}
      >
        {body}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <CopyButton text={body} label="Copy message" />
        {long && (
          <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
            {open ? "Show less" : "Show full message"}
          </button>
        )}
      </div>
    </div>
  );
}

/** "Found in notes" suggestion: one click saves it onto the contact. */
export function SaveFoundField({ contactId, field, value }: { contactId: string; field: "email" | "phone"; value: string }) {
  const [state, action, pending] = useActionState(setContactField, undefined);
  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="contact_id" value={contactId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={value} />
      <span className="text-xs text-zinc-500">found in notes:</span>
      <span className="font-mono text-xs text-zinc-800">{value}</span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && <span className="text-xs text-rose-700">{state.error}</span>}
    </form>
  );
}
