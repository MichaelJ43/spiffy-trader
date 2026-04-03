import { format } from "date-fns";

/** Avoids date-fns throwing on invalid dates (which would blank the whole UI). */
export function safeFormat(
  value: string | number | Date | null | undefined,
  fmt: string,
  fallback = "—"
): string {
  const d = value instanceof Date ? value : new Date(value ?? "");
  if (!Number.isFinite(d.getTime())) return fallback;
  try {
    return format(d, fmt);
  } catch {
    return fallback;
  }
}
