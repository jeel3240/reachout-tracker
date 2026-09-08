import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reachout Tracker",
  description: "Outreach pipeline: contacts, companies, touches",
};

const nav = [
  { href: "/", label: "Today" },
  { href: "/contacts", label: "Contacts" },
  { href: "/companies", label: "Companies" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900">Reachout Tracker</Link>
            <nav className="flex gap-4 text-sm text-zinc-600">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-zinc-900">{n.label}</Link>
              ))}
            </nav>
            <div className="ml-auto">
              <Link href="/contacts/new" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">+ Contact</Link>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
