// Shared slug normalizer for Studio 9 canonicalization.
export function normalizeSlug(input) {
  if (!input) return "";
  const raw = String(input).trim().toLowerCase();
  if (raw === "studio9") return "studio-9";
  if (raw === "studio-9") return "studio-9";
  return raw.replace(/\s+/g, "-");
}
