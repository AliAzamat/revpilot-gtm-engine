import { AccountRecord, listAccounts } from './dedupe';
import { complete } from './llm';

const CRM = process.env.CRM_URL ?? 'http://localhost:4000';

// The structured-output contract. The LLM does not get to hand back prose —
// it must return exactly this shape, and we enforce it before the result is
// allowed anywhere near the CRM.
export interface Triage {
  fitScore: number;                     // 0..100, how well the account fits our ICP
  segment: 'enterprise' | 'mid_market' | 'smb' | 'unqualified';
  reasons: string[];                    // 1-3 grounded justifications
}

const SEGMENTS = ['enterprise', 'mid_market', 'smb', 'unqualified'] as const;

// A strict validator, not a type assertion. `JSON.parse` gives us `any`; this
// turns "the model claims it returned a Triage" into "we verified it did".
export function parseTriage(raw: string): Triage {
  const obj = JSON.parse(raw) as Record<string, unknown>;
  const fitScore = obj.fitScore;
  if (typeof fitScore !== 'number' || fitScore < 0 || fitScore > 100) {
    throw new Error(`fitScore must be a number in 0..100, got ${JSON.stringify(fitScore)}`);
  }
  if (!SEGMENTS.includes(obj.segment as never)) {
    throw new Error(`segment must be one of ${SEGMENTS.join('|')}, got ${JSON.stringify(obj.segment)}`);
  }
  if (!Array.isArray(obj.reasons) || obj.reasons.length === 0 ||
      !obj.reasons.every((r) => typeof r === 'string')) {
    throw new Error('reasons must be a non-empty array of strings');
  }
  return { fitScore, segment: obj.segment as Triage['segment'], reasons: obj.reasons as string[] };
}

const SYSTEM = `You are a GTM analyst scoring how well a company fits our ideal
customer profile (ICP): B2B software and infrastructure buyers, 200+ employees,
$25M+ revenue, US or DACH. Return ONLY JSON of the form
{"fitScore": <0-100>, "segment": "enterprise"|"mid_market"|"smb"|"unqualified",
"reasons": ["...", "..."]}. Ground every reason in the firmographics given.`;

// Validate-then-retry: ask the model, verify the shape, and on a schema
// violation ask again with the error fed back — up to a small cap. A model
// that keeps returning garbage is a dead-lettered job, not a corrupt CRM row.
export async function triageAccount(account: AccountRecord, maxTries = 3): Promise<Triage> {
  const user = `Score this account:\n${JSON.stringify({
    name: account.name, industry: account.industry, employees: account.employees,
    annual_revenue: account.annual_revenue, billing_country: account.billing_country,
  })}`;

  let lastError = '';
  for (let attempt = 1; attempt <= maxTries; attempt += 1) {
    const prompt = lastError
      ? `${user}\n\nYour previous reply was rejected: ${lastError}\nReturn valid JSON only.`
      : user;
    const raw = await complete(SYSTEM, prompt);
    try {
      return parseTriage(raw);
    } catch (e) {
      lastError = (e as Error).message; // feed the violation back on the next try
    }
  }
  throw new Error(`triage did not produce valid output after ${maxTries} tries: ${lastError}`);
}

// The job handler: fetch the account, triage it, and write the verdict back to
// the CRM as structured fields — never as free text.
export async function runTriage(accountId: string): Promise<void> {
  const account = (await listAccounts()).find((a) => a.id === accountId);
  if (!account) throw new Error(`account not found: ${accountId}`);
  const triage = await triageAccount(account);
  await fetch(`${CRM}/api/accounts/${accountId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fit_score: triage.fitScore, segment: triage.segment }),
  });
}
