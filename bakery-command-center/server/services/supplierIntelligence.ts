// Supplier Intelligence — the 4th AI Risk Intelligence stage ("Research ->
// Understand -> Suppliers -> Prepare"). Live web research via OpenAI's
// Responses API (web_search tool), server-side only. Closely mirrors
// aiRisk.ts's shape (caching, usage limiting, response parsing, defensive
// sanitization) with three deliberate deviations, each documented at its
// point of use below:
//
//   1. No allowed_domains restriction — AI Risk's curated domain list
//      (commodity/macro/government/financial-press sources) is wrong for
//      supplier discovery, since real supplier company websites can't be
//      pre-enumerated. Open web search instead; per-row citation
//      cross-validation (below) keeps this honest.
//
//   2. Per-row citation cross-validation, not just one whole-response
//      Sources panel. The model self-reports which URLs back each supplier
//      row; every one of those URLs is checked against the *tool's own*
//      independently-extracted source sets (never trusted from the model's
//      JSON alone) before being kept. A row with zero verified URLs after
//      that check is dropped entirely — it never reaches result_json, the
//      client, or an export. This is what "no manufactured sources" means
//      when sources must be attributed per-row instead of once for the
//      whole response.
//
//   3. Deterministic price normalization (parsePriceToAedPerKg, below) and
//      a hard request_quote price guard — both pure TypeScript, no LLM
//      arithmetic, matching Rule 2 from aiRisk.ts ("no new math") applied
//      to pricing instead of financial/operational results.
//
// Usage/rate limiting is shared with AI Risk Intelligence (getMonthlyUsageCount,
// getUserRecentCount, recordUsage, PER_USER_HOURLY_LIMIT — exported from
// aiRisk.ts for this purpose): a supplier search is just another paid OpenAI
// web-search call against the same monthly cap, not a separate budget.
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { db } from '../db.ts';
import { getAiRiskMonthlyCap, getOpenAiApiKey } from './settings.ts';
import { getMonthlyUsageCount, getUserRecentCount, recordUsage, PER_USER_HOURLY_LIMIT, type CitedSource } from './aiRisk.ts';

export type PriceLevel = 'verified_published' | 'indicative_market' | 'estimated_landed' | 'request_quote';
export type EvidenceQuality = 'high' | 'medium' | 'limited';
export type SourceLabel = 'Official Supplier Site' | 'Product Page' | 'Pricing Source' | 'Marketplace Listing' | 'Research Source';

const VALID_PRICE_LEVELS = new Set<PriceLevel>(['verified_published', 'indicative_market', 'estimated_landed', 'request_quote']);
const VALID_EVIDENCE: Set<EvidenceQuality> = new Set(['high', 'medium', 'limited']);
const VALID_SOURCE_LABELS = new Set<SourceLabel>(['Official Supplier Site', 'Product Page', 'Pricing Source', 'Marketplace Listing', 'Research Source']);

export interface ProcurementSpec {
  productSpec: string | null;
  quantity: string | null;
  deliveryLocation: string | null;
  requiredBy: string | null;
  preferredGeography: string | null;
  supplierType: string | null;
  currency: string | null;
}

export interface SupplierSource {
  url: string;
  title: string;
  label: SourceLabel;
}

export interface SupplierRow {
  name: string;
  supplierType: string;
  geography: string;
  geographyNote: string;
  product: string;
  priceLevel: PriceLevel;
  priceAmount: number | null;
  priceAmountHigh: number | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  normalizedAedPerKg: number | null;
  normalizedNote: string | null;
  moq: string;
  leadTime: string;
  availabilityNote: string;
  certifications: string[];
  evidenceQuality: EvidenceQuality;
  commercialNotes: string;
  isRetailBenchmark: boolean;
  sources: SupplierSource[];
  retrievedAt: string;
}

export interface SupplierIntelligenceResult {
  material: string;
  summary: string;
  suppliers: SupplierRow[];
  disclaimer: string;
}

export interface SupplierResearchRecord {
  id: number;
  researchId: number | null;
  material: string;
  spec: ProcurementSpec;
  result: SupplierIntelligenceResult;
  citedSources: CitedSource[];
  allSources: string[];
  sourcesRetrieved: boolean;
  createdByEmployeeId: string;
  createdAt: string;
}

interface RawSupplierRow {
  id: number;
  research_id: number | null;
  material: string;
  spec_json: string;
  params_hash: string;
  result_json: string;
  cited_sources_json: string;
  all_sources_json: string;
  created_by_employee_id: string;
  created_at: string;
}

function toSupplierResearchRecord(row: RawSupplierRow): SupplierResearchRecord {
  const allSources: string[] = JSON.parse(row.all_sources_json);
  return {
    id: row.id,
    researchId: row.research_id,
    material: row.material,
    spec: JSON.parse(row.spec_json),
    result: JSON.parse(row.result_json),
    citedSources: JSON.parse(row.cited_sources_json),
    allSources,
    sourcesRetrieved: allSources.length > 0,
    createdByEmployeeId: row.created_by_employee_id,
    createdAt: row.created_at,
  };
}

// --- Caching -----------------------------------------------------------------
// One fixed freshness window (unlike AI Risk's depth-scaled windows, since
// supplier search has no depth selector) — 24h balances "prices shouldn't go
// stale silently" against not re-spending the shared budget on every click.
const FRESHNESS_HOURS = 24;

function canonicalParamsKey(material: string, spec: ProcurementSpec): string {
  return JSON.stringify({
    material: material.trim().toLowerCase(),
    productSpec: (spec.productSpec ?? '').trim().toLowerCase(),
    quantity: (spec.quantity ?? '').trim().toLowerCase(),
    deliveryLocation: (spec.deliveryLocation ?? '').trim().toLowerCase(),
    requiredBy: (spec.requiredBy ?? '').trim().toLowerCase(),
    preferredGeography: (spec.preferredGeography ?? '').trim().toLowerCase(),
    supplierType: (spec.supplierType ?? '').trim().toLowerCase(),
    currency: (spec.currency ?? '').trim().toLowerCase(),
  });
}

function hashParams(material: string, spec: ProcurementSpec): string {
  return createHash('sha256').update(canonicalParamsKey(material, spec)).digest('hex');
}

function findCached(paramsHash: string): SupplierResearchRecord | null {
  const cutoff = new Date(Date.now() - FRESHNESS_HOURS * 3_600_000).toISOString();
  const row = db
    .prepare(`SELECT * FROM supplier_research WHERE params_hash = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1`)
    .get(paramsHash, cutoff) as unknown as RawSupplierRow | undefined;
  return row ? toSupplierResearchRecord(row) : null;
}

// --- Price normalization (deterministic, no LLM arithmetic) -----------------
// FX conversion is deliberately limited to AED and USD: the AED/USD rate is
// a genuine, longstanding fixed peg (~3.6725), so it's a legitimately stable
// number to hard-code. Any other currency (EUR, GBP, etc.) is a floating
// rate with no live FX source in this app — showing a static approximate
// rate for those would be misleading, so normalization is skipped for them
// and the original basis is shown instead, exactly as the spec requires
// when normalization "can't be performed reliably."
const USD_TO_AED = 3.6725;

const WEIGHT_UNIT_RE = /(\d+(?:\.\d+)?)?\s*(kilograms?|kgs?|grams?|gs?\b|metric\s*tonnes?|metric\s*tons?|tonnes?|tons?|mt\b|pounds?|lbs?\b)/i;

function unitToKg(qty: number, unitWord: string): number {
  const u = unitWord.toLowerCase();
  if (u.startsWith('kilogram') || u === 'kg' || u === 'kgs') return qty;
  if (u.startsWith('gram') || u === 'g' || u === 'gs') return qty / 1000;
  if (u.includes('metric') || u === 'mt' || u.startsWith('tonne') || u.startsWith('ton')) return qty * 1000;
  if (u.startsWith('pound') || u === 'lb' || u === 'lbs') return qty * 0.453592;
  return qty;
}

interface NormalizedPrice {
  normalizedAedPerKg: number | null;
  normalizedNote: string | null;
}

/** Converts a supplier-reported price + currency + unit basis to AED/kg where
 * a recognizable weight-based unit can be parsed and the currency is AED or
 * USD. Returns nulls (original basis stands alone) whenever either step
 * can't be done reliably — never guesses. */
function normalizePriceToAedPerKg(amount: number | null, currency: string | null, unit: string | null): NormalizedPrice {
  if (amount === null || !currency) return { normalizedAedPerKg: null, normalizedNote: null };

  const cur = currency.trim().toUpperCase();
  let aedAmount: number;
  let fxNote: string;
  if (cur === 'AED') {
    aedAmount = amount;
    fxNote = '';
  } else if (cur === 'USD') {
    aedAmount = amount * USD_TO_AED;
    fxNote = ` (converted from USD at fixed peg ${USD_TO_AED})`;
  } else {
    return { normalizedAedPerKg: null, normalizedNote: `Original basis shown — no reliable AED conversion for ${cur}.` };
  }

  if (!unit) return { normalizedAedPerKg: null, normalizedNote: 'Original basis shown — no unit reported.' };
  const match = unit.match(WEIGHT_UNIT_RE);
  if (!match) return { normalizedAedPerKg: null, normalizedNote: `Original basis shown — could not parse a weight unit from "${unit}".` };

  const qty = match[1] ? parseFloat(match[1]) : 1;
  if (!qty || qty <= 0) return { normalizedAedPerKg: null, normalizedNote: `Original basis shown — could not parse a weight unit from "${unit}".` };

  const kg = unitToKg(qty, match[2]);
  if (!kg || kg <= 0) return { normalizedAedPerKg: null, normalizedNote: `Original basis shown — could not parse a weight unit from "${unit}".` };

  const perKg = aedAmount / kg;
  return {
    normalizedAedPerKg: Math.round(perKg * 100) / 100,
    normalizedNote: `Normalized from ${amount} ${cur} per ${unit}${fxNote}.`,
  };
}

// --- OpenAI call ---------------------------------------------------------------

const SYSTEM_INSTRUCTIONS = `You are a procurement research analyst for Grandiose Bakery, a UAE bakery and catering business, helping management find REAL, currently-operating suppliers for a specific raw material. Use the web_search tool to find live suppliers, products, and pricing — do not rely on general knowledge alone.

Absolute rule: do not invent or guess ANYTHING — no supplier name, company, product, website, price, MOQ, lead time, availability, or certification that you did not actually find via search. If you cannot find real suppliers for the material and spec given, return an empty "suppliers" array and say so plainly in "summary" rather than filling it with plausible-sounding but unverified entries. It is always better to return fewer, real suppliers than more, uncertain ones.

Wording rules: never claim a supplier "can deliver to Grandiose Bakery" or "delivers to the UAE" unless you found that explicitly stated. Use careful, honest phrasing instead: "UAE-based supplier", "Regional (GCC) supplier", "International sourcing option — UAE delivery requires confirmation". Only include publicly published BUSINESS contact information if you find it (e.g. a general sales inquiry page); never include or infer any individual's personal contact details. Only state a certification (Halal, HACCP, ISO, food safety, etc.) if you found credible evidence of it — never infer one from a supplier's country or business type.

Pricing has four evidence levels — classify every supplier honestly, never fabricate a number to fill a gap:
- "verified_published": an official supplier price list or product page states the price.
- "indicative_market": a marketplace/listing/distributor page shows a price, but it isn't the supplier's own official price list.
- "estimated_landed": you can only construct an estimated range from partial evidence (state your assumptions in commercialNotes).
- "request_quote": no usable price is publicly available. Leave priceAmount/priceAmountHigh/priceCurrency/priceUnit as null and say so — do NOT put a 0 or a guess there.

Retail listings for small/consumer quantities must be marked isRetailBenchmark: true and never described as a recommended industrial supplier.

sources: for each supplier, list ONLY the URLs you actually visited via web_search that support that specific row's claims (name, product, price, etc). Do not list a URL you did not search. Any URL you list that isn't backed by an actual search result will be discarded before being shown to anyone, so only include ones you're confident about. Label each source's role honestly: "Official Supplier Site", "Product Page", "Pricing Source", "Marketplace Listing", or "Research Source" — never label a third-party article or directory listing as the supplier's own site.

After researching, respond with STRICT JSON only, no markdown fences, no commentary outside the JSON, matching exactly this shape:
{
  "summary": "2-3 sentences on what you found overall for this material and spec — be honest about gaps",
  "suppliers": [
    {
      "name": "supplier/company name exactly as found",
      "supplierType": "Manufacturer" | "Distributor" | "Wholesaler" | "Trading Company" | "Retail" | "Unknown",
      "geography": "country or region the supplier is based in, as found",
      "geographyNote": "one short phrase on delivery reach, using the careful wording rules above",
      "product": "the specific product/spec this supplier offers, as found",
      "priceLevel": "verified_published" | "indicative_market" | "estimated_landed" | "request_quote",
      "priceAmount": number or null,
      "priceAmountHigh": number or null (only for a genuine range; otherwise null),
      "priceCurrency": "ISO currency code or null",
      "priceUnit": "the price basis as published, e.g. 'per kg', '25kg bag', 'per MT' — or null",
      "moq": "minimum order quantity as found, or 'Not published'",
      "leadTime": "lead time as found, or 'Not published'",
      "availabilityNote": "availability/stock note as found, or 'Not published'",
      "certifications": ["only certifications with credible evidence"],
      "evidenceQuality": "high" | "medium" | "limited",
      "commercialNotes": "brief trade-offs or caveats a buyer should know, grounded in what you found",
      "isRetailBenchmark": true or false,
      "sources": [ { "url": "...", "title": "page title as found", "label": "Official Supplier Site" | "Product Page" | "Pricing Source" | "Marketplace Listing" | "Research Source" } ]
    }
  ]
}

Do not rank suppliers or declare one "best" — that is management's decision, not yours. Keep every field concise (no long paragraphs). Never output markdown formatting inside string fields.`;

function buildUserInput(material: string, spec: ProcurementSpec): string {
  const lines = [`Raw material: ${material}`];
  if (spec.productSpec) lines.push(`Product spec: ${spec.productSpec}`);
  if (spec.quantity) lines.push(`Approximate quantity needed: ${spec.quantity}`);
  if (spec.deliveryLocation) lines.push(`Delivery location: ${spec.deliveryLocation}`);
  if (spec.requiredBy) lines.push(`Required by: ${spec.requiredBy}`);
  if (spec.preferredGeography) lines.push(`Preferred supplier geography: ${spec.preferredGeography}`);
  if (spec.supplierType) lines.push(`Preferred supplier type: ${spec.supplierType}`);
  if (spec.currency) lines.push(`Preferred pricing currency: ${spec.currency}`);
  lines.push('Find real, currently-operating suppliers for this material matching the spec above as closely as possible.');
  return lines.join('\n');
}

// Same extraction pattern as aiRisk.ts's extractCitedSources/extractAllSources
// — these two are the ONLY trustworthy source sets (independently derived
// from the API response's own citation/action.sources fields), and are what
// every supplier row's self-reported sourceUrls gets cross-validated against
// below.
function extractCitedSources(response: OpenAI.Responses.Response): CitedSource[] {
  const seen = new Map<string, CitedSource>();
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content) {
      if (content.type !== 'output_text') continue;
      for (const ann of content.annotations ?? []) {
        if (ann.type === 'url_citation' && !seen.has(ann.url)) {
          seen.set(ann.url, { title: ann.title, url: ann.url });
        }
      }
    }
  }
  return [...seen.values()];
}

function extractAllSources(response: OpenAI.Responses.Response): string[] {
  const seen = new Set<string>();
  for (const item of response.output) {
    if (item.type !== 'web_search_call') continue;
    const action = item.action as { type: string; sources?: { url: string }[] };
    if (action?.type === 'search' && action.sources) {
      for (const s of action.sources) seen.add(s.url);
    }
  }
  return [...seen];
}

function extractFinalText(response: OpenAI.Responses.Response): string {
  let text = '';
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content) {
      if (content.type === 'output_text') text += content.text;
    }
  }
  return text;
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = '';
    return url.toString();
  } catch {
    return u.trim();
  }
}

/** Cross-validates one supplier row's self-reported sources against the
 * tool-verified set (citedSources + allSources — never the model's JSON
 * alone). Returns only the sources whose URL is actually in that verified
 * set; a row that ends up with zero verified sources is the caller's signal
 * to drop it entirely. */
function verifySupplierSources(rawSources: unknown, verifiedUrls: Set<string>): SupplierSource[] {
  if (!Array.isArray(rawSources)) return [];
  const out: SupplierSource[] = [];
  const seen = new Set<string>();
  for (const s of rawSources) {
    if (!s || typeof s !== 'object') continue;
    const rec = s as Record<string, unknown>;
    if (typeof rec.url !== 'string') continue;
    const normalized = normalizeUrl(rec.url);
    if (!verifiedUrls.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    const label: SourceLabel = VALID_SOURCE_LABELS.has(rec.label as SourceLabel) ? (rec.label as SourceLabel) : 'Research Source';
    const title = typeof rec.title === 'string' && rec.title.trim() !== '' ? rec.title : normalized;
    out.push({ url: normalized, title, label });
  }
  return out;
}

function sanitizeStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
}

/** Sanitizes and validates one raw supplier row from the model's JSON,
 * cross-validates its sources, enforces the request_quote price guard, and
 * computes deterministic price normalization. Returns null if the row fails
 * validation or (per Rule 1 extended to per-row attribution) ends up with no
 * verified sources — callers filter those out before persisting anything. */
function sanitizeSupplierRow(raw: unknown, verifiedUrls: Set<string>, retrievedAt: string): SupplierRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || r.name.trim() === '') return null;

  const sources = verifySupplierSources(r.sources, verifiedUrls);
  if (sources.length === 0) return null; // no verified evidence — drop the row entirely, never show it

  const priceLevel: PriceLevel = VALID_PRICE_LEVELS.has(r.priceLevel as PriceLevel) ? (r.priceLevel as PriceLevel) : 'request_quote';

  // Hard guard: whatever the model output, a request_quote row never carries
  // a displayed price. This is enforced here regardless of what the model
  // did, as a backstop against ever showing a fabricated-looking number.
  const priceAmount = priceLevel === 'request_quote' ? null : typeof r.priceAmount === 'number' ? r.priceAmount : null;
  let priceAmountHigh = priceLevel === 'request_quote' ? null : typeof r.priceAmountHigh === 'number' ? r.priceAmountHigh : null;
  const priceCurrency = priceLevel === 'request_quote' ? null : typeof r.priceCurrency === 'string' ? r.priceCurrency : null;
  const priceUnit = priceLevel === 'request_quote' ? null : typeof r.priceUnit === 'string' ? r.priceUnit : null;
  if (priceAmount === null) {
    priceAmountHigh = null;
  }

  const { normalizedAedPerKg, normalizedNote } = normalizePriceToAedPerKg(priceAmount, priceCurrency, priceUnit);

  return {
    name: r.name,
    supplierType: typeof r.supplierType === 'string' && r.supplierType.trim() !== '' ? r.supplierType : 'Unknown',
    geography: typeof r.geography === 'string' && r.geography.trim() !== '' ? r.geography : 'Not published',
    geographyNote: typeof r.geographyNote === 'string' ? r.geographyNote : '',
    product: typeof r.product === 'string' && r.product.trim() !== '' ? r.product : 'Not published',
    priceLevel,
    priceAmount,
    priceAmountHigh,
    priceCurrency,
    priceUnit,
    normalizedAedPerKg,
    normalizedNote,
    moq: typeof r.moq === 'string' && r.moq.trim() !== '' ? r.moq : 'Not published',
    leadTime: typeof r.leadTime === 'string' && r.leadTime.trim() !== '' ? r.leadTime : 'Not published',
    availabilityNote: typeof r.availabilityNote === 'string' && r.availabilityNote.trim() !== '' ? r.availabilityNote : 'Not published',
    certifications: sanitizeStringList(r.certifications),
    evidenceQuality: VALID_EVIDENCE.has(r.evidenceQuality as EvidenceQuality) ? (r.evidenceQuality as EvidenceQuality) : 'limited',
    commercialNotes: typeof r.commercialNotes === 'string' ? r.commercialNotes : '',
    isRetailBenchmark: r.isRetailBenchmark === true,
    sources,
    retrievedAt,
  };
}

function sanitizeResult(raw: unknown, material: string, verifiedUrls: Set<string>, retrievedAt: string): SupplierIntelligenceResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawSuppliers = Array.isArray(r.suppliers) ? r.suppliers : [];
  const suppliers = rawSuppliers
    .map((s) => sanitizeSupplierRow(s, verifiedUrls, retrievedAt))
    .filter((s): s is SupplierRow => s !== null);

  return {
    material,
    summary: typeof r.summary === 'string' && r.summary.trim() !== '' ? r.summary : 'No summary was returned for this search.',
    suppliers,
    disclaimer: 'Indicative pricing only. Final procurement pricing should be confirmed directly with the supplier before procurement.',
  };
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiApiKey() !== null;
}

export type RunSupplierSearchOutcome =
  | { ok: true; research: SupplierResearchRecord; cached: boolean }
  | { ok: false; reason: 'not_configured'; message: string }
  | { ok: false; reason: 'monthly_cap'; message: string }
  | { ok: false; reason: 'rate_limit'; message: string; retryAfterSeconds: number }
  | { ok: false; reason: 'error'; message: string };

export async function runSupplierSearch(
  material: string,
  spec: ProcurementSpec,
  employeeId: string,
  forceRefresh: boolean,
  researchId: number | null,
): Promise<RunSupplierSearchOutcome> {
  const paramsHash = hashParams(material, spec);

  if (!forceRefresh) {
    const cached = findCached(paramsHash);
    if (cached) return { ok: true, research: cached, cached: true };
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', message: "Live research isn't configured yet. Add an OpenAI API key in Settings." };
  }

  // Shared budget with AI Risk Intelligence — see file header.
  const monthlyCap = getAiRiskMonthlyCap();
  if (getMonthlyUsageCount() >= monthlyCap) {
    return { ok: false, reason: 'monthly_cap', message: 'Monthly research limit reached — contact your administrator.' };
  }

  const recentCount = getUserRecentCount(employeeId);
  if (recentCount >= PER_USER_HOURLY_LIMIT) {
    return {
      ok: false,
      reason: 'rate_limit',
      message: `You've reached the limit of ${PER_USER_HOURLY_LIMIT} searches per hour. Try again in a few minutes.`,
      retryAfterSeconds: 3600,
    };
  }

  try {
    // Explicit timeout + no retries: the SDK default (10 min timeout, 2
    // retries) meant an open, unrestricted web search (no allowed_domains —
    // see deviation 1 above) could legitimately run for several minutes
    // before failing, then silently retry the full wait twice more — from
    // the UI, that reads as an indefinite hang, even though the "Sourcing…"
    // message only ever promised "up to a minute". Bounding it here means a
    // slow/failed search surfaces the existing error message (with its
    // "try again" action) well inside a minute and a half, instead of
    // leaving the user staring at a spinner for 5+ minutes.
    const client = new OpenAI({ apiKey, timeout: 75_000, maxRetries: 0 });
    const response = await client.responses.create({
      model: 'gpt-5.5',
      instructions: SYSTEM_INSTRUCTIONS,
      input: buildUserInput(material, spec),
      tools: [
        {
          type: 'web_search',
          // Deliberately no allowed_domains filter — see file header,
          // deviation 1. Supplier company sites can't be pre-enumerated the
          // way AI Risk's commodity/macro sources can.
          search_context_size: 'medium',
        },
      ],
      include: ['web_search_call.action.sources'],
    });

    const citedSources = extractCitedSources(response);
    const allSources = extractAllSources(response);
    const verifiedUrls = new Set<string>([...citedSources.map((c) => normalizeUrl(c.url)), ...allSources.map(normalizeUrl)]);

    let cleaned = extractFinalText(response).trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, reason: 'error', message: "The research response couldn't be parsed as structured data. Try again." };
    }

    const retrievedAt = new Date().toISOString(); // server-generated, never model-supplied
    const result = sanitizeResult(parsed, material, verifiedUrls, retrievedAt);

    const insertResult = db
      .prepare(
        `INSERT INTO supplier_research
          (research_id, material, spec_json, params_hash, result_json, cited_sources_json, all_sources_json, created_by_employee_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        researchId,
        material,
        JSON.stringify(spec),
        paramsHash,
        JSON.stringify(result),
        JSON.stringify(citedSources),
        JSON.stringify(allSources),
        employeeId,
        retrievedAt,
      );

    // One row per actual OpenAI call, never per cache hit — matches ai_usage's
    // own rule. 'standard' is the closest honest fit: supplier search has no
    // depth selector of its own, and is roughly one web-search call, same
    // cost class as an AI Risk "standard" run.
    recordUsage(employeeId, 'standard');

    const row = db.prepare('SELECT * FROM supplier_research WHERE id = ?').get(insertResult.lastInsertRowid) as unknown as RawSupplierRow;
    return { ok: true, research: toSupplierResearchRecord(row), cached: false };
  } catch (err) {
    // Same key-redaction rule as aiRisk.ts's runResearch — see that file's
    // comment for why this pattern-match (not an exact string match) is
    // required for OpenAI's error shape specifically.
    const raw = err instanceof Error ? err.message : String(err);
    const redacted = raw.replace(/sk-[A-Za-z0-9*_-]{6,}/g, '[redacted]');
    console.error('Supplier Intelligence search failed:', redacted);
    return { ok: false, reason: 'error', message: 'Could not complete supplier search — check the OpenAI API key in Settings and try again.' };
  }
}

export function getSupplierResearch(id: number): SupplierResearchRecord | null {
  const row = db.prepare('SELECT * FROM supplier_research WHERE id = ?').get(id) as unknown as RawSupplierRow | undefined;
  return row ? toSupplierResearchRecord(row) : null;
}

export function listSupplierResearchForResearchId(researchId: number): SupplierResearchRecord[] {
  const rows = db
    .prepare('SELECT * FROM supplier_research WHERE research_id = ? ORDER BY created_at DESC')
    .all(researchId) as unknown as RawSupplierRow[];
  return rows.map(toSupplierResearchRecord);
}
