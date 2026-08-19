import { toDomain, normalizeName } from './normalize';

const CRM = process.env.CRM_URL ?? 'http://localhost:4000';

export interface AccountRecord {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  employees: number | null;
  annual_revenue: number | null;
  billing_country: string | null;
}

// Match order: domain first (strong key), normalized name second (weak key).
// Domain identity is near-certain; name identity is a judgment call, which
// is why domain always wins when both are available.
export function findMatch(
  incoming: { website?: string | null; name: string },
  existing: AccountRecord[],
): AccountRecord | null {
  const domain = toDomain(incoming.website);
  if (domain) {
    const byDomain = existing.find((a) => toDomain(a.website) === domain);
    if (byDomain) return byDomain;
  }
  const name = normalizeName(incoming.name);
  if (name) {
    const byName = existing.find((a) => normalizeName(a.name) === name);
    if (byName) return byName;
  }
  return null;
}

// Survivorship: enriched values fill gaps but never clobber a value already
// in the CRM. The CRM is the system of record; enrichment is a guest.
export function mergeFields(crm: AccountRecord, enriched: Partial<AccountRecord>): Partial<AccountRecord> {
  const patch: Partial<AccountRecord> = {};
  for (const key of ['website', 'industry', 'employees', 'annual_revenue', 'billing_country'] as const) {
    const has = crm[key] !== null && crm[key] !== undefined;
    const incoming = enriched[key];
    if (!has && incoming !== undefined && incoming !== null) {
      (patch as Record<string, unknown>)[key] = incoming;
    }
  }
  return patch;
}

export async function listAccounts(): Promise<AccountRecord[]> {
  const res = await fetch(`${CRM}/api/accounts`);
  const body = (await res.json()) as { records: AccountRecord[] };
  return body.records;
}

// Upsert through the CRM API: PATCH the match if one exists, POST otherwise.
export async function upsertAccount(
  incoming: { name: string; website?: string | null } & Partial<AccountRecord>,
): Promise<string> {
  const existing = await listAccounts();
  const match = findMatch(incoming, existing);
  if (match) {
    const patch = mergeFields(match, incoming);
    if (Object.keys(patch).length > 0) {
      await fetch(`${CRM}/api/accounts/${match.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
    }
    return match.id;
  }
  const res = await fetch(`${CRM}/api/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(incoming),
  });
  const body = (await res.json()) as { id: string };
  return body.id;
}
