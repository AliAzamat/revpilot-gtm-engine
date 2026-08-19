# Decision memo: enrichment — custom code vs. low-code recipe

Both paths in this repo produce the *same* enriched account and quality score.
This memo records which one we ship and why.

## What we compared
- **Custom (`engine/src/enrich.ts`)** — the enrichment waterfall as TypeScript.
- **Low-code (`recipes/enrich-account.json` + `engine/src/recipe.ts`)** — the
  same flow as a declarative recipe run by a step-registry interpreter.

## Where the recipe wins
- **Change without a deploy.** Reordering providers or adding a field is a JSON
  edit. A non-engineer on the GTM team can own it.
- **Legible.** The recipe reads like the process it describes; the intent isn't
  buried in control flow.
- **Safe by construction.** A recipe can only invoke registered ops, so the blast
  radius of a bad edit is bounded.

## Where the recipe breaks
- **The ceiling is the registry.** The moment we need something no op expresses —
  conditional branching on a provider's confidence, a fan-out to enrich contacts,
  a per-segment provider order — we're back to editing `recipe.ts`. At that point
  the recipe is indirection with no payoff.
- **Debuggability.** A stack trace through the interpreter is worse than a stack
  trace through named functions.
- **Types.** The recipe is `unknown` at the edges; the custom path is typed end to
  end.

## Decision
Ship **custom** as the engine's default path, and **keep the recipe interpreter**
for the two or three high-churn flows the GTM team wants to own directly.
Low-code gets us ~80% of the way for simple, frequently-tweaked flows; the moment
a flow needs real logic, low-code becomes the bottleneck — so we draw the line at
the registry's ceiling, deliberately, instead of discovering it in an incident.
