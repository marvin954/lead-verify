// app/dashboard/suppression/page.tsx
import { getSuppressionList } from "@/lib/dashboard-data";
import { SuppressionManager } from "@/components/dashboard/SuppressionManager";

export const revalidate = 0;

export default async function SuppressionPage() {
  const rows = await getSuppressionList();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-mono text-xl text-ink-primary">Suppression list</h1>
        <p className="text-ink-secondary text-sm font-sans mt-1">
          Emails, domains, phone numbers, and IPs listed here are automatically rejected during
          verification.
        </p>
      </div>

      <SuppressionManager initialRows={rows} />
    </div>
  );
}
