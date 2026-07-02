"use server";

import { revalidatePath } from "next/cache";
import {
  addSuppressionEntry,
  removeSuppressionEntry,
  type SuppressionType,
} from "@/lib/dashboard-data";

const VALID_TYPES: SuppressionType[] = ["email", "phone", "domain", "ip"];

export async function createSuppression(formData: FormData) {
  const value = String(formData.get("value") ?? "").trim();
  const value_type = String(formData.get("value_type") ?? "") as SuppressionType;
  const reason = String(formData.get("reason") ?? "");

  if (!value) return { ok: false, error: "Value is required." };
  if (!VALID_TYPES.includes(value_type)) return { ok: false, error: "Invalid type." };

  const result = await addSuppressionEntry({ value, value_type, reason });
  if (result.ok) revalidatePath("/dashboard/suppression");
  return result;
}

export async function deleteSuppression(id: string) {
  const result = await removeSuppressionEntry(id);
  if (result.ok) revalidatePath("/dashboard/suppression");
  return result;
}
