// Every unit of work in the engine is a typed Job. The payload union means
// the runner stays generic while every handler is fully typed on its input.
export type JobPayload =
  | { kind: 'enrich_account'; accountId: string }
  | { kind: 'triage_account'; accountId: string }
  | { kind: 'draft_outreach'; accountId: string };

export interface Job {
  id: string;              // unique per enqueue
  idempotencyKey: string;  // unique per *logical* piece of work
  payload: JobPayload;
  attempts: number;
  maxAttempts: number;
  runAfter: number;        // epoch ms; backoff pushes this into the future
}

export interface JobResult {
  jobId: string;
  status: 'done' | 'retrying' | 'dead';
  error?: string;
}
