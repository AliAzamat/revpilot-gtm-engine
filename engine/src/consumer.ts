import express from 'express';
import crypto from 'crypto';
import { Runner } from './runner';

// The engine side of the bus: an HTTP endpoint the CRM posts change events to.
// It verifies the signature, dedupes redundant deliveries, and translates a
// change into an enqueued job. It never trusts the payload until the HMAC
// checks out — this endpoint is the engine's front door.
const SECRET = process.env.WEBHOOK_SECRET ?? 'dev-shared-secret';

// Constant-time compare so a byte-by-byte timing side-channel can't leak the
// signature. crypto.timingSafeEqual throws on length mismatch, so guard first.
function verify(body: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function buildConsumer(runner: Runner) {
  const app = express();
  // Capture the RAW body — verification must run over the exact bytes the CRM
  // signed, not a re-serialized object whose key order or spacing may differ.
  app.use(express.text({ type: 'application/json' }));

  // Delivery dedupe: at-least-once delivery means the same deliveryId can
  // arrive twice. We remember the ones we've accepted and ack duplicates
  // without re-processing.
  const seen = new Set<string>();

  app.post('/hooks/crm', (req, res) => {
    const signature = String(req.headers['x-crm-signature'] ?? '');
    if (!verify(req.body, signature)) {
      return res.status(401).json({ error: 'bad signature' });
    }
    const event = JSON.parse(req.body) as {
      deliveryId: string; object: string; recordId: string; changeType: string;
    };

    // Duplicate delivery: ack with 200 so the CRM stops retrying, but do no
    // work. Idempotency at the bus, on top of idempotency at the runner.
    if (seen.has(event.deliveryId)) return res.status(200).json({ status: 'duplicate' });
    seen.add(event.deliveryId);

    // Only account changes drive the pipeline. A changed account should be
    // re-enriched; the idempotency key ties the work to THIS change so two
    // deliveries of the same change collapse to one job.
    if (event.object === 'accounts') {
      runner.enqueue(
        { kind: 'enrich_account', accountId: event.recordId },
        `enrich:${event.recordId}:${event.changeType}`,
      );
    }
    res.status(200).json({ status: 'accepted' });
  });

  return app;
}
