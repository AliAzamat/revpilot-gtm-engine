import { Job, JobPayload, JobResult } from './jobs';

// A single-process job runner: an in-memory queue with retries, exponential
// backoff, and idempotency keys. The shape mirrors what SQS + a worker pool
// give you, kept small enough to read in one sitting.
export type Handler = (payload: JobPayload) => Promise<void>;

export class Runner {
  private queue: Job[] = [];
  private done = new Set<string>();     // idempotency keys that completed
  private inFlight = new Set<string>(); // keys currently being worked
  private seq = 0;

  constructor(
    private handler: Handler,
    private onResult: (r: JobResult) => void = () => {},
  ) {}

  // Enqueue is where idempotency is enforced: a key that already completed,
  // is queued, or is in flight becomes a no-op — not a duplicate run.
  enqueue(payload: JobPayload, idempotencyKey: string, maxAttempts = 4): boolean {
    if (this.done.has(idempotencyKey)) return false;
    if (this.inFlight.has(idempotencyKey)) return false;
    if (this.queue.some((j) => j.idempotencyKey === idempotencyKey)) return false;
    this.seq += 1;
    this.queue.push({
      id: `job_${this.seq}`,
      idempotencyKey,
      payload,
      attempts: 0,
      maxAttempts,
      runAfter: 0,
    });
    return true;
  }

  // Drain everything currently runnable. A loop calls this on an interval;
  // tests call it directly and await it.
  async tick(nowMs = Date.now()): Promise<void> {
    const ready = this.queue.filter((j) => j.runAfter <= nowMs);
    this.queue = this.queue.filter((j) => j.runAfter > nowMs);
    for (const job of ready) {
      await this.run(job);
    }
  }

  private async run(job: Job): Promise<void> {
    this.inFlight.add(job.idempotencyKey);
    job.attempts += 1;
    try {
      await this.handler(job.payload);
      this.done.add(job.idempotencyKey);
      this.onResult({ jobId: job.id, status: 'done' });
    } catch (e) {
      const error = (e as Error).message;
      if (job.attempts >= job.maxAttempts) {
        // Dead-letter: give up loudly. A real system parks the job where a
        // human can see it; we surface it through onResult.
        this.onResult({ jobId: job.id, status: 'dead', error });
      } else {
        // Exponential backoff with jitter: 1s, 2s, 4s (+/- 20%).
        const base = 1000 * 2 ** (job.attempts - 1);
        const jitter = base * 0.2 * (Math.random() * 2 - 1);
        job.runAfter = Date.now() + base + jitter;
        this.queue.push(job);
        this.onResult({ jobId: job.id, status: 'retrying', error });
      }
    } finally {
      this.inFlight.delete(job.idempotencyKey);
    }
  }

  pending(): number {
    return this.queue.length;
  }
}
