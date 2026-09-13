// Domain allowlist for the AI Risk Intelligence web_search tool — approved
// 2026-09-12. Named constant, not inline, per instruction: pick this
// deliberately, don't bury it in a request-builder. Passed as
// tools[0].filters.allowed_domains on the OpenAI Responses API call.
export const ALLOWED_DOMAINS = [
  // Commodity / macro
  'fao.org',
  'worldbank.org',
  'usda.gov',
  'fas.usda.gov', // USDA Foreign Agricultural Service — global commodity outlooks
  'imf.org',
  'unctad.org', // shipping and trade
  // UAE government
  'u.ae',
  'moccae.gov.ae',
  'centralbank.ae',
  'dubaicustoms.gov.ae',
  // Established financial press (retrieval may be headline-only where paywalled — see report)
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  // Commodity / shipping data
  'spglobal.com',
  'cmegroup.com',
] as const;
