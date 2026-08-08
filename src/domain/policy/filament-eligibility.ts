/**
 * Shared filament eligibility policy.
 * Hooks capture evidence; this policy classifies — never invents values.
 */

export const FILAMENT_ELIGIBILITY_POLICY_VERSION = 1 as const;

const FILAMENT_MATERIAL_HINTS = [
  "pla",
  "petg",
  "abs",
  "asa",
  "tpu",
  "tpe",
  "pc",
  "nylon",
  "pa6",
  "pa12",
  "pva",
  "hips",
  "filamento",
  "filament",
] as const;

const NON_FILAMENT_HINTS = [
  "impressora",
  "printer",
  "bico",
  "nozzle",
  "mesa",
  "bed",
  "extrusora",
  "hotend",
  "resina",
  "resin",
  "kit limpeza",
  "ferramenta",
] as const;

export type FilamentEligibility =
  | { eligible: true; reason: "material_or_title_evidence" }
  | { eligible: false; reason: "non_filament_evidence" | "insufficient_evidence" };

function normalize(text: string | null | undefined): string {
  return (text ?? "").normalize("NFKC").toLowerCase();
}

function includesHint(blob: string, hint: string): boolean {
  const escaped = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(blob);
}

/**
 * A filament kit/bundle with ambiguous unit mass remains eligible as raw
 * observation evidence — massGrams may be null. Eligibility must not invent
 * R$/kg or silently treat parse failure as OOS.
 */
export function classifyFilamentEligibility(input: {
  titleEvidence: string | null;
  materialEvidence: string | null;
  descriptionEvidence?: string | null;
}): FilamentEligibility {
  // Non-filament hints are scoped to title/material evidence only — the
  // merchant's own product naming — not the free-text description. A real
  // filament PDP's description commonly mentions compatible printers/hotends
  // ("compatível com qualquer impressora 3D"); scoring that text against
  // NON_FILAMENT_HINTS would misclassify a genuine filament product as an
  // accessory. Accessory PDPs (nozzles, beds, hotends) reliably name the
  // accessory itself in the title, which stays in scope.
  const titleBlob = [
    normalize(input.titleEvidence),
    normalize(input.materialEvidence),
  ].join(" ");
  const fullBlob = [titleBlob, normalize(input.descriptionEvidence)].join(" ");

  if (!fullBlob.trim()) {
    return { eligible: false, reason: "insufficient_evidence" };
  }

  for (const hint of NON_FILAMENT_HINTS) {
    if (includesHint(titleBlob, hint)) {
      return { eligible: false, reason: "non_filament_evidence" };
    }
  }

  if (FILAMENT_MATERIAL_HINTS.some((m) => includesHint(fullBlob, m))) {
    return { eligible: true, reason: "material_or_title_evidence" };
  }

  return { eligible: false, reason: "insufficient_evidence" };
}
