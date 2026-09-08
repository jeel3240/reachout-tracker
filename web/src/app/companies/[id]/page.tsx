import { notFound } from "next/navigation";
import { ContactTable } from "@/components/ContactTable";
import { CompanyForm } from "@/components/forms";
import { Card } from "@/components/ui";
import { getCompany } from "@/lib/queries";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCompany(id);
  if (!data) notFound();
  const { company, contacts } = data;
  const withCompany = contacts.map((c) => ({ ...c, company: { id: company.id, name: company.name, domain: company.domain } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{company.name}</h1>
        <p className="text-sm text-zinc-600">{[company.domain, company.industry, company.location].filter(Boolean).join(" · ")}</p>
      </div>
      <Card title={`Contacts at ${company.name} · ${contacts.length}`}>
        {contacts.length > 1 && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            More than one person here. Check who was messaged first before drafting to another.
          </p>
        )}
        <ContactTable contacts={withCompany} showCompany={false} />
      </Card>
      <Card title="Edit company">
        <CompanyForm company={company} />
      </Card>
    </div>
  );
}
