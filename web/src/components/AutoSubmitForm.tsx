"use client";

/** GET form that re-submits whenever a select or checkbox changes. Text inputs submit on Enter. */
export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const el = e.target as unknown as HTMLInputElement;
        if (el.type !== "text" && el.type !== "search") e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
