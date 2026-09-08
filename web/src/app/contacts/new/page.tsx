import { ContactForm } from "@/components/forms";
import { Card } from "@/components/ui";
import { listCompanyOptions } from "@/lib/queries";

export default async function NewContactPage() {
  const companies = await listCompanyOptions();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">New contact</h1>
      <p className="text-sm text-zinc-600">
        Add people when the LinkedIn invite goes out, not when you first message them. Use the search on the Contacts page first to
        avoid a second entry at the same company.
      </p>
      <Card>
        <ContactForm companies={companies} />
      </Card>
    </div>
  );
}
