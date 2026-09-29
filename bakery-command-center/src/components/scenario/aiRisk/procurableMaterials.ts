// Gates when Supplier Intelligence is even offered from an AI Risk result.
// Per spec: only activate when the risk is meaningfully tied to a procurable
// raw material a bakery actually buys (flour, butter, sugar, cocoa, dairy,
// oils, packaging, yeast, etc.) — never for labour regulation, geopolitical
// uncertainty, cybersecurity, and similar non-material risk types, even
// though those can still appear in `affectedMaterials` as a stray/empty tag.
//
// This is a simple, transparent keyword match against the AI's own
// affectedMaterials strings — not a second AI call, and not a rigid enum:
// the model's affectedMaterials field is free text (see aiRisk.ts's system
// prompt), so a substring match is the honest way to recognize "Cocoa
// futures", "Butter/dairy", "wheat flour", etc. without over-constraining
// what the research stage can say.
const PROCURABLE_KEYWORDS = [
  'flour',
  'wheat',
  'butter',
  'dairy',
  'milk',
  'cream',
  'cheese',
  'sugar',
  'cocoa',
  'chocolate',
  'yeast',
  'egg',
  'nut',
  'almond',
  'hazelnut',
  'oil',
  'shortening',
  'margarine',
  'packaging',
  'vanilla',
  'fruit',
  'honey',
];

function isProcurable(material: string): boolean {
  const lower = material.toLowerCase();
  return PROCURABLE_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Returns the first affected-material string that looks like a real
 * procurable raw material, or null if none do (e.g. a purely regulatory,
 * geopolitical, or cybersecurity risk) — null means Supplier Intelligence
 * should not be offered for this research result. */
export function findProcurableMaterial(affectedMaterials: string[]): string | null {
  return affectedMaterials.find(isProcurable) ?? null;
}
