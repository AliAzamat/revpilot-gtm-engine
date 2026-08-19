// A deliberately thin LLM client boundary. Every AI call in the engine goes
// through `complete` — one system prompt, one user prompt, one string back.
// Swapping the mock for a real hosted LLM API is a change to this file alone;
// the triage and drafting layers above never see the provider.
export interface LLMClient {
  complete(system: string, user: string): Promise<string>;
}

// The mock stands in for a real chat/completions endpoint. It's keyed off the
// firmographics in the prompt so runs are deterministic — and it occasionally
// returns malformed JSON on purpose, so validate-then-retry is exercised.
let calls = 0;
export const mock: LLMClient = {
  async complete(system, user) {
    calls += 1;
    // Every fourth call returns a schema-violating reply, to prove the caller
    // rejects it and retries rather than trusting the model blindly.
    if (calls % 4 === 0) {
      return '{"fitScore": "very high", "segment": "big", "reasons": []}';
    }
    const emp = Number(/"employees":\s*(\d+)/.exec(user)?.[1] ?? 0);
    const rev = Number(/"annual_revenue":\s*(\d+)/.exec(user)?.[1] ?? 0);
    const score = Math.min(100, Math.round(emp / 30 + rev / 8_000_000));
    const segment = emp >= 1000 ? 'enterprise' : emp >= 200 ? 'mid_market' : emp > 0 ? 'smb' : 'unqualified';
    return JSON.stringify({
      fitScore: score,
      segment,
      reasons: [`${emp} employees and $${rev} revenue place this in ${segment}.`],
    });
  },
};

export function complete(system: string, user: string): Promise<string> {
  return mock.complete(system, user);
}
