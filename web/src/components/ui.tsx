import Link from "next/link";
import { STATUS_LABEL, type Channel, type Status } from "@/lib/types";

const STATUS_STYLE: Record<Status, string> = {
  requested: "bg-slate-100 text-slate-700 ring-slate-200",
  accepted: "bg-sky-50 text-sky-800 ring-sky-200",
  messaged: "bg-amber-50 text-amber-800 ring-amber-200",
  replied: "bg-violet-50 text-violet-800 ring-violet-200",
  live: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  soft_no: "bg-orange-50 text-orange-800 ring-orange-200",
  hard_decline: "bg-rose-50 text-rose-800 ring-rose-200",
  signed: "bg-green-100 text-green-900 ring-green-300",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  skipped: "bg-zinc-50 text-zinc-500 ring-zinc-200",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const CHANNEL_ICON: Record<Channel, string> = { email: "✉", linkedin: "in", call: "☎", meeting: "▣" };

export function ChannelTag({ channel }: { channel: Channel }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
      <span aria-hidden>{CHANNEL_ICON[channel]}</span>
      {channel}
    </span>
  );
}

export function Flag({ on, label }: { on: boolean; label: string }) {
  if (!on) return null;
  return <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">{label}</span>;
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function daysAgo(d: string | null | undefined): string {
  if (!d) return "";
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (diff <= 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-zinc-200 bg-white ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-zinc-500">{children}</p>;
}

export function LinkButton({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          : "inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      }
    >
      {children}
    </Link>
  );
}

export const inputCls =
  "block w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
export const labelCls = "block text-xs font-medium text-zinc-600 mb-1";
