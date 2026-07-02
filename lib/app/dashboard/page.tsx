// app/dashboard/page.tsx
import { getDashboardStats, getLeads, getClients } from "@/lib/dashboard-data";
import { StatCards } from "@/components/dashboard/StatCards";
import { LeadsTable } from "@/components/dashboard/LeadsTable";
import type { LeadStatus } from "@/lib/dashboard-data";

export const revalidate = 0; // always fresh — this is an ops dashboard

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string; search?: string; page?: string; client?: string };
}) {
  const status = (searchParams.status as LeadStatus | "all") ?? "all";
  const page = Number(searchParams.page ?? 1);
  const pageSize = 25;

  const [stats, { rows, total }, clients] = await Promise.all([
    getDashboardStats(searchParams.client),
    getLeads({ status, search: searchParams.search, clientId: searchParams.client, page, pageSize }),
    getClients(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-mono text-xl text-ink-primary">Overview</h1>
          <p className="text-ink-secondary text-sm font-sans mt-1">
            Every lead scored before it reaches a client.
          </p>
        </div>
      </div>

      <StatCards stats={stats} />

      <LeadsTable rows={rows} total={total} page={page} pageSize={pageSize} activeStatus={status} />
    </div>
  );
}
