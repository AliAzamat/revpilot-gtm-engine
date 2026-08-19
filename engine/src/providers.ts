// Three mock data providers with deliberately different personalities —
// think Clearbit / ZoomInfo / Apollo-style firmographic APIs. Each returns
// *partial* data: no single provider knows everything, which is exactly
// why waterfall enrichment exists.
export interface ProviderResult {
  website?: string;
  industry?: string;
  employees?: number;
  annual_revenue?: number;
  billing_country?: string;
}

export interface Provider {
  name: string;
  costPerCall: number; // provider credits burned per lookup
  lookup(domainOrName: string): Promise<ProviderResult | null>;
}

// primus: high accuracy, narrow coverage, expensive. Knows firmographics
// cold for the accounts it has; returns null fast for the rest.
export const primus: Provider = {
  name: 'primus',
  costPerCall: 3,
  async lookup(key) {
    const data: Record<string, ProviderResult> = {
      'vantiq-systems.com': { industry: 'Enterprise Software', employees: 435, annual_revenue: 71000000, billing_country: 'US' },
      'kestrel.dev': { industry: 'Robotics', employees: 2140, annual_revenue: 495000000, billing_country: 'US' },
    };
    return data[key] ?? null;
  },
};

// atlasgraph: broad coverage, mediocre depth — usually has *something*,
// rarely everything.
export const atlasgraph: Provider = {
  name: 'atlasgraph',
  costPerCall: 1,
  async lookup(key) {
    const data: Record<string, ProviderResult> = {
      'vantiq-systems.com': { industry: 'Software', billing_country: 'US' },
      'meridianfreight.io': { website: 'https://meridianfreight.io', industry: 'Freight & Logistics', employees: 1280 },
      'halcyonhealth.com': { industry: 'Health Care', employees: 90 },
      'northwind analytics': { website: 'https://northwind-analytics.de', industry: 'Data & Analytics', billing_country: 'DE' },
      'kestrel.dev': { industry: 'Industrial Automation' },
    };
    return data[key] ?? null;
  },
};

// fennec: cheap, flaky, but the only revenue source for the mid-market.
// Every third call fails — deterministic flakiness so retries are testable.
let fennecCalls = 0;
export const fennec: Provider = {
  name: 'fennec',
  costPerCall: 0.5,
  async lookup(key) {
    fennecCalls += 1;
    if (fennecCalls % 3 === 0) throw new Error('fennec: 503 upstream timeout');
    const data: Record<string, ProviderResult> = {
      'meridianfreight.io': { annual_revenue: 205000000, billing_country: 'US' },
      'halcyonhealth.com': { annual_revenue: 11500000, billing_country: 'US' },
      'northwind analytics': { employees: 60, annual_revenue: 8000000 },
    };
    return data[key] ?? null;
  },
};
