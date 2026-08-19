# RevPilot architecture

## The shape

    CRM (Salesforce-shaped API over SQLite)
      |  emits change events (HMAC-signed webhooks, at-least-once)
      v
    Webhook consumer --> Workflow engine (typed job runner: retries, backoff, idempotency)
                            - enrich_account   -> waterfall across providers -> quality score
                            - triage_account   -> LLM fit score + segment (structured, validated)
                            - draft_outreach    -> LLM first-touch draft -> Open CRM Task (human approves)

## The rules that hold it together
- **The CRM data model is the contract.** Everything the engine writes lands in
  typed columns the SOQL-lite grammar can query — `fit_score`, `segment`, Task
  rows — never free-text blobs.
- **Every side effect is a job.** So every failure retries, backs off, and
  dead-letters instead of vanishing.
- **Delivery is at-least-once; handlers are idempotent.** The webhook bus may
  deliver twice; the consumer dedupes and every handler is safe to re-run.
- **AI output is validated at the boundary.** Triage and drafts pass a schema
  check with validate-then-retry before anything touches the CRM.
- **Human-in-the-loop is a capability, not a policy.** No code path can send an
  email or complete a Task. That's enforced by what the engine can't do.

## Where to extend
- New workflow → a new job type on the runner. Inherits retries/idempotency free.
- New enrichment source → a new provider in the waterfall + (optionally) an op in
  the recipe registry.
- New AI step → a new module behind the `LLMClient` boundary in `llm.ts`, with its
  own structured-output contract.
