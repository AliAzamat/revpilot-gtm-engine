import { Provider, ProviderResult, primus, atlasgraph, fennec } from './providers';

// Waterfall enrichment: for each field, walk providers in priority order
// and take the first non-null answer. The waterfall is field-level, not
// record-level — one provider may win `industry` while another wins
// `annual_revenue` on the same account.
export const ENRICH_FIELDS = ['website', 'industry', 'employees', 'annual_revenue', 'billing_country'] as const;
export type EnrichField = (typeof ENRICH_FIELDS)[number];

// Priority per field. primus is most accurate, so it leads everywhere it
// plays; fennec is the only mid-market revenue source, so it backs up.
export const FIELD_PRIORITY: Record<EnrichField, Provider[]> = {
  website: [atlasgraph],
  industry: [primus, atlasgraph],
  employees: [primus, atlasgraph, fennec],
  annual_revenue: [primus, fennec],
  billing_country: [primus, atlasgraph, fennec],
};

export interface Enrichment {
  fields: ProviderResult;
  provenance: Partial<Record<EnrichField, string>>; // field -> provider
  qualityScore: number; // 0..1 weighted coverage of the fields GTM needs
  creditsSpent: number;
}

// Fields aren't equally valuable to GTM: revenue and headcount drive
// segmentation and routing, so they weigh more than country.
const WEIGHTS: Record<EnrichField, number> = {
  website: 1, industry: 2, employees: 3, annual_revenue: 3, billing_country: 1,
};

export async function enrich(key: string): Promise<Enrichment> {
  const fields: ProviderResult = {};
  const provenance: Partial<Record<EnrichField, string>> = {};
  let creditsSpent = 0;

  // Call each distinct provider once, tolerating failure — a provider that
  // throws simply contributes nothing this pass.
  const results = new Map<string, ProviderResult | null>();
  const distinct = new Set<Provider>(Object.values(FIELD_PRIORITY).flat());
  for (const provider of distinct) {
    try {
      results.set(provider.name, await provider.lookup(key));
      creditsSpent += provider.costPerCall;
    } catch {
      results.set(provider.name, null); // flaky provider: skip, don't fail
    }
  }

  for (const field of ENRICH_FIELDS) {
    for (const provider of FIELD_PRIORITY[field]) {
      const value = results.get(provider.name)?.[field];
      if (value !== undefined && value !== null) {
        fields[field] = value as never;
        provenance[field] = provider.name;
        break; // first provider in priority order wins this field
      }
    }
  }

  const total = ENRICH_FIELDS.reduce((s, f) => s + WEIGHTS[f], 0);
  const got = ENRICH_FIELDS.reduce((s, f) => s + (fields[f] !== undefined ? WEIGHTS[f] : 0), 0);
  return { fields, provenance, qualityScore: got / total, creditsSpent };
}
