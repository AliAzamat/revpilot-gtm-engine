# RevPilot runbook

The on-call contract for the GTM workflow engine. Every alert below maps to a
check and a fix. If a symptom isn't here, it becomes a new entry after it's
resolved.

## A job is stuck in the dead-letter queue
1. Find it: `SELECT * FROM jobs WHERE status = 'dead' ORDER BY last_modified DESC;`
2. Read `last_error` — it's the exception the final attempt threw.
3. Common causes:
   - `enrichment provider timeout` — a provider is down. Check the provider
     status, then requeue: `UPDATE jobs SET status='pending', attempts=0 WHERE id=?`.
   - `could not produce a valid draft after 3 tries` — the model kept violating
     the draft schema. Inspect the account; if firmographics are missing, the
     draft can't be grounded. Enrich first, then requeue.
   - `account ... is not an outreach candidate` — expected. The account wasn't
     triaged or scored `unqualified`. No action; the guard worked.

## Enrichment quality suddenly dropped
- Check the per-field provenance on recently enriched accounts. A single provider
  filling everything (instead of the waterfall spreading across providers) usually
  means the others are erroring silently. Grep the enrich logs for that provider.

## The webhook consumer is reprocessing old events
- The delivery-id dedupe table may have been cleared. This is safe — handlers are
  idempotent — but noisy. Confirm no handler has a non-idempotent side effect
  before ignoring it.

## Never do
- Never mark an outreach Task `Completed` from the engine or a script. Completion
  is a human sending the email. Automating it deletes the guardrail the whole
  design rests on.
