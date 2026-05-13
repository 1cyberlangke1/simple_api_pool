import { getGroupByName, getProviderByName, type AdminOverview } from "@/lib/admin";

export function ensureDeletedEntityMissing(
  overview: Partial<AdminOverview> | null | undefined,
  entityType: "group" | "provider",
  entityName: string
) {
  const normalizedName = String(entityName || "").trim();
  if (!normalizedName) {
    return true;
  }

  if (entityType === "provider") {
    return getProviderByName(Array.isArray(overview?.providers) ? overview.providers : [], normalizedName) === null;
  }

  return getGroupByName(Array.isArray(overview?.groups) ? overview.groups : [], normalizedName) === null;
}
