// app/dashboard/clients/page.tsx
import { getClients } from "@/lib/dashboard-data";
import { ThresholdEditor } from "@/components/dashboard/ThresholdEditor";

export const revalidate = 0;

export default async function ClientsPage() {
  const clients = await getClients();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-mono text-xl text-ink-primary">Clients</h1>
        <p className="text-ink-secondary text-sm font-sans mt-1">
          Each client can override the system-default score thresholds.
        </p>
      </div>

      <div className="rounded-card bg-surface-card border border-surface-border divide-y divide-surface-border">
        {clients.map((client) => (
          <div key={client.id} className="p-5 flex items-center justify-between gap-6">
            <div className="flex flex-col gap-1">
              <span className="font-sans text-ink-primary">{client.name}</span>
              <span className="font-mono text-xs text-ink-muted">
                {client.webhook_url ?? "no delivery webhook set"}
              </span>
            </div>
            <ThresholdEditor
              clientId={client.id}
              initialVerified={client.threshold_verified}
              initialFlagged={client.threshold_flagged}
            />
          </div>
        ))}
        {clients.length === 0 && (
          <div className="p-8 text-center text-ink-muted font-sans text-sm">
            No clients yet. Add rows to the <code className="font-mono">clients</code> table to
            get started.
          </div>
        )}
      </div>
    </div>
  );
}
