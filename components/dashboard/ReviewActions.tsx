// components/dashboard/ReviewActions.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  async function act(action: "approve" | "reject") {
    setPending(action);
    try {
      const res = await fetch(`/api/leads/${leadId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Review action failed");
      router.push("/dashboard?status=flagged");
      router.refresh();
    } catch (err) {
      console.error(err);
      setPending(null);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => act("approve")}
        disabled={pending !== null}
        className="px-4 py-2 rounded-lg bg-status-verifiedDim text-status-verified text-sm font-sans hover:opacity-80 disabled:opacity-40 transition-opacity"
      >
        {pending === "approve" ? "Approving…" : "Approve & deliver"}
      </button>
      <button
        onClick={() => act("reject")}
        disabled={pending !== null}
        className="px-4 py-2 rounded-lg bg-status-rejectedDim text-status-rejected text-sm font-sans hover:opacity-80 disabled:opacity-40 transition-opacity"
      >
        {pending === "reject" ? "Rejecting…" : "Reject"}
      </button>
    </div>
  );
}
