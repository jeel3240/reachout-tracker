import Link from "next/link";
import { listCompanies } from "@/lib/queries";

export default async function CompaniesPage() {
  const companies = await listCompanies();
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="mb-2 text-xs text-zinc-500">{companies.length} compan{companies.length === 1 ? "y" : "ies"}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Domain</th>
            <th className="py-2 pr-3 font-medium">Industry</th>
            <th className="py-2 pr-3 font-medium">Location</th>
            <th className="py-2 font-medium text-right">Contacts</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((co) => (
            <tr key={co.id} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="py-2 pr-3"><Link href={`/companies/${co.id}`} className="font-medium hover:underline">{co.name}</Link></td>
              <td className="py-2 pr-3 text-zinc-600">{co.domain ?? "—"}</td>
              <td className="py-2 pr-3 text-zinc-600">{co.industry ?? "—"}</td>
              <td className="py-2 pr-3 text-zinc-600">{co.location ?? "—"}</td>
              <td className="py-2 text-right tabular-nums">{co.contact_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!companies.length && <p className="py-6 text-center text-sm text-zinc-500">No companies yet.</p>}
    </div>
  );
}
