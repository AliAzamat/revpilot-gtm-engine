// A minimal low-code interpreter. A recipe is data: an ordered list of steps,
// each naming an `op` from a fixed registry. This is the "buy / configure"
// path — the same enrichment as step three, expressed declaratively so a
// non-engineer could reorder steps or swap providers without touching code.
import { providers, ProviderName } from './providers';
import { scoreQuality } from './enrich';

interface Ctx {
  accountId: string;
  vars: Record<string, unknown>;
  crm: {
    getAccount(id: string): Promise<Record<string, unknown>>;
    upsertAccount(a: Record<string, unknown>, quality: number): Promise<void>;
  };
}

type Step = Record<string, unknown> & { op: string };

// The registry is the interpreter's whole vocabulary. A recipe can only do what
// the registry exposes — which is the point and the ceiling: safe, but you can
// never express anything an op doesn't already support.
const OPS: Record<string, (s: Step, ctx: Ctx) => Promise<void>> = {
  async get_account(s, ctx) {
    ctx.vars[String(s.as)] = await ctx.crm.getAccount(ctx.accountId);
  },
  async enrich_field(s, ctx) {
    const target = ctx.vars[String(s.into)] as Record<string, unknown>;
    const field = String(s.field);
    for (const name of s.providers as ProviderName[]) {
      if (target[field] != null) break; // first provider to fill it wins — the waterfall
      const val = await providers[name].lookup(field, target);
      if (val != null) target[field] = val;
    }
  },
  async score_quality(s, ctx) {
    const of = ctx.vars[String(s.of)] as Record<string, unknown>;
    ctx.vars[String(s.as)] = scoreQuality(of);
  },
  async upsert_account(s, ctx) {
    const a = ctx.vars[String(s.from)] as Record<string, unknown>;
    const q = ctx.vars[String(s.quality)] as number;
    await ctx.crm.upsertAccount(a, q);
  },
};

export async function runRecipe(recipe: { steps: Step[] }, ctx: Ctx): Promise<void> {
  for (const step of recipe.steps) {
    const op = OPS[step.op];
    if (!op) throw new Error(`unknown op: ${step.op}`);
    await op(step, ctx);
  }
}
