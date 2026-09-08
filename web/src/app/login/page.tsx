import { LoginForm } from "@/components/forms";
import { Card } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-16">
      <Card title="Reachout Tracker">
        <LoginForm next={next ?? "/"} />
      </Card>
    </div>
  );
}
