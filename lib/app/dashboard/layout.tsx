export const dynamic = "force-dynamic";
// app/dashboard/layout.tsx
import { Sidebar } from "@/components/dashboard/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface-base text-ink-primary font-sans">
      <Sidebar />
      <main className="flex-1 p-8 space-y-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
