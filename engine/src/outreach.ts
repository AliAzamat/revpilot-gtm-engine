// The draft_outreach job handler. It drafts, then writes the draft to the CRM
// as an OPEN Task addressed to the account — the rep's review queue. The Task
// status starts 'Open'; only a human moving it to 'Completed' ever sends.
import { draftOutreach, Account } from './draft';

interface Crm {
  getAccount(id: string): Promise<Account>;
  getTriageReasons(id: string): Promise<string[]>;
  createTask(input: {
    whatId: string;
    subject: string;
    description: string;
    status: 'Open';
  }): Promise<{ id: string }>;
}

export interface OutreachResult {
  taskId: string;
  status: 'Open';
}

// Guardrail, in code: the handler can create a Task and set it Open. It has no
// send path and no way to mark a Task Completed. Auto-send is not a policy we
// promise to follow — it is an operation this code cannot perform.
export async function runDraftOutreach(crm: Crm, accountId: string): Promise<OutreachResult> {
  const account = await crm.getAccount(accountId);
  if (account.fit_score == null || account.segment === 'unqualified') {
    // Don't draft for accounts we haven't triaged or that don't fit.
    throw new Error(`account ${accountId} is not an outreach candidate`);
  }
  const reasons = await crm.getTriageReasons(accountId);
  const draft = await draftOutreach(account, reasons);
  const task = await crm.createTask({
    whatId: accountId,
    subject: `[DRAFT — review before sending] ${draft.subject}`,
    description: draft.body,
    status: 'Open',
  });
  return { taskId: task.id, status: 'Open' };
}
