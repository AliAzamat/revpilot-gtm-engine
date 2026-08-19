// Outreach drafting. Given a triaged account and its enrichment context, ask
// the model for ONE short, specific first-touch email — then persist it as a
// CRM Task for a human to approve. Nothing here sends anything.
import { complete } from './llm';

export interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  employees: number | null;
  annual_revenue: number | null;
  fit_score: number | null;
  segment: string | null;
}

export interface Draft {
  subject: string;
  body: string;
}

const SYSTEM = [
  'You are a GTM engineer drafting a first-touch outreach email for a sales rep to review.',
  'Rules: at most 90 words. One concrete, specific hook tied to the account. No pricing claims.',
  'No fabricated facts about the company. End with a soft ask for a 15-minute call.',
  'Reply as strict JSON: {"subject": string, "body": string}. No prose outside the JSON.',
].join(' ');

// The prompt is grounded ONLY in fields we actually hold. A model told to write
// "personalized" outreach with no facts will invent them; giving it the real
// firmographics and the triage reasons keeps the specificity honest.
function userPrompt(a: Account, reasons: string[]): string {
  return JSON.stringify(
    {
      name: a.name,
      domain: a.domain,
      industry: a.industry,
      employees: a.employees,
      segment: a.segment,
      fit_score: a.fit_score,
      why_it_fits: reasons,
    },
    null,
    2,
  );
}

function parseDraft(raw: string): Draft {
  const obj = JSON.parse(raw);
  if (typeof obj.subject !== 'string' || typeof obj.body !== 'string') {
    throw new Error('draft must have string subject and body');
  }
  if (obj.body.split(/\s+/).length > 90) {
    throw new Error('draft body exceeds the 90-word limit');
  }
  return { subject: obj.subject.trim(), body: obj.body.trim() };
}

export async function draftOutreach(a: Account, reasons: string[], maxTries = 3): Promise<Draft> {
  let lastErr = '';
  for (let attempt = 1; attempt <= maxTries; attempt += 1) {
    const user = lastErr
      ? `${userPrompt(a, reasons)}\n\nYour previous reply was rejected: ${lastErr}. Return valid JSON.`
      : userPrompt(a, reasons);
    const raw = await complete(SYSTEM, user);
    try {
      return parseDraft(raw);
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`could not produce a valid draft after ${maxTries} tries: ${lastErr}`);
}
