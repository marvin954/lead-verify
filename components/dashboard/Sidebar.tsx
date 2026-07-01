// components/dashboard/Sidebar.tsx
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard?status=flagged", label: "Review queue" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/suppression", label: "Suppression list" },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-surface-border bg-surface-base flex flex-col">
      <div className="px-5 py-6">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-status-verified" />
          <span className="font-mono text-sm text-ink-primary tracking-tight">MAMMBA VERIFY</span>
        </div>
        <span className="text-ink-muted text-xs font-sans mt-1 block">Lead verification</span>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block px-3 py-2 rounded-lg text-sm font-sans text-ink-secondary hover:text-ink-primary hover:bg-surface-card transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-surface-border">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-ink-muted">Kickbox</span>
          <span className="text-status-verified">●</span>
        </div>
        <div className="flex items-center justify-between text-xs font-mono mt-1.5">
          <span className="text-ink-muted">Twilio Lookup</span>
          <span className="text-status-verified">●</span>
        </div>
        <div className="flex items-center justify-between text-xs font-mono mt-1.5">
          <span className="text-ink-muted">IPQS (HLR)</span>
          <span className="text-status-verified">●</span>
        </div>
      </div>
    </aside>
  );
}
