import crypto from 'crypto';

// The CRM's outbound webhook: every write posts a signed change event to the
// engine's consumer. This is the CRM side of the bus — it knows nothing about
// what the engine does with the event, only that a record changed.
export interface ChangeEvent {
  object: string;                       // 'accounts' | 'contacts' | 'tasks'
  recordId: string;                     // the '001…' / '003…' key-prefixed id
  changeType: 'created' | 'updated';
  fields?: string[];                    // which columns a PATCH touched
}

const CONSUMER = process.env.WEBHOOK_URL ?? 'http://localhost:4100/hooks/crm';
const SECRET = process.env.WEBHOOK_SECRET ?? 'dev-shared-secret';

// Sign the exact bytes we send. The consumer recomputes the HMAC over the raw
// body and compares — a payload it can't verify is one it must reject.
export function sign(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

let deliveryCounter = 0;

// Fire-and-retry delivery. At-least-once is the contract: we retry on failure,
// which means the consumer WILL sometimes see the same event twice. Each
// delivery carries a stable deliveryId so the consumer can dedupe.
export async function emit(event: ChangeEvent): Promise<void> {
  deliveryCounter += 1;
  const deliveryId = `dlv_${Date.now().toString(36)}_${deliveryCounter}`;
  const payload = JSON.stringify({ deliveryId, ...event });
  const signature = sign(payload);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(CONSUMER, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-crm-signature': signature },
        body: payload,
      });
      // A 2xx means the consumer durably accepted the event. Anything else is
      // a reason to retry — including a timeout, which is why the same event
      // may be delivered more than once.
      if (res.ok) return;
    } catch {
      // network error: fall through to the next attempt
    }
    await new Promise((r) => setTimeout(r, 100 * attempt));
  }
  // Exhausted retries: in a real CRM this parks in a dead-letter table. We log
  // loudly rather than silently drop a change the engine needed to see.
  console.error(`webhook delivery failed after retries: ${deliveryId}`, event);
}
