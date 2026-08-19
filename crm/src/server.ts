import express from 'express';
import { db, newId, now } from './db';
import { seed } from './seed';
import { emit } from './events';

// A Salesforce-shaped REST sandbox. Real Salesforce speaks SOQL; we speak
// "SOQL-lite": a whitelisted WHERE grammar on the list endpoints. Everything
// the workflow engine does later goes through this HTTP surface — never
// straight into SQLite — so the engine only ever sees a CRM API.
export const app = express();
app.use(express.json());

// Whitelist per object: a field not in this map cannot be filtered on,
// which is also what makes the WHERE parser injection-proof.
const FIELDS: Record<string, Set<string>> = {
  accounts: new Set(['name', 'website', 'industry', 'employees', 'annual_revenue', 'billing_country']),
  contacts: new Set(['account_id', 'first_name', 'last_name', 'email', 'title']),
  tasks: new Set(['what_id', 'who_id', 'subject', 'status']),
};

// SOQL-lite: `industry = 'Software' AND employees > 100`. Only AND, only
// = / != / > / <, only whitelisted fields. Values become bind parameters.
function parseWhere(object: string, input: string): { sql: string; params: unknown[] } {
  const clauses = input.split(/\s+AND\s+/i);
  const sql: string[] = [];
  const params: unknown[] = [];
  for (const clause of clauses) {
    const m = clause.match(/^(\w+)\s*(=|!=|>|<)\s*(.+)$/);
    if (!m) throw new Error(`bad clause: ${clause}`);
    const [, field, op, raw] = m;
    if (!FIELDS[object].has(field)) throw new Error(`unknown field: ${field}`);
    const value = raw.startsWith("'") ? raw.slice(1, -1) : Number(raw);
    sql.push(`${field} ${op} ?`);
    params.push(value);
  }
  return { sql: sql.join(' AND '), params };
}

function list(object: string) {
  return (req: express.Request, res: express.Response) => {
    const limit = Math.min(Number(req.query.limit ?? 200), 200);
    let sql = `SELECT * FROM ${object}`;
    const params: unknown[] = [];
    if (typeof req.query.where === 'string' && req.query.where.length > 0) {
      try {
        const parsed = parseWhere(object, req.query.where);
        sql += ` WHERE ${parsed.sql}`;
        params.push(...parsed.params);
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
    }
    sql += ` LIMIT ?`;
    params.push(limit);
    res.json({ records: db.prepare(sql).all(...params) });
  };
}

app.get('/api/accounts', list('accounts'));
app.get('/api/contacts', list('contacts'));
app.get('/api/tasks', list('tasks'));

app.get('/api/accounts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

const PREFIX: Record<string, '001' | '003' | '00T'> = {
  accounts: '001', contacts: '003', tasks: '00T',
};

function upsertRoutes(object: string, columns: string[]) {
  app.post(`/api/${object}`, (req, res) => {
    const id = newId(PREFIX[object]);
    const cols = columns.filter((c) => req.body[c] !== undefined);
    db.prepare(
      `INSERT INTO ${object} (id, last_modified${cols.map((c) => `, ${c}`).join('')})
       VALUES (?, ?${cols.map(() => ', ?').join('')})`,
    ).run(id, now(), ...cols.map((c) => req.body[c]));
    // A create is a change: fire an event so downstream workflows can react.
    emit({ object, recordId: id, changeType: 'created' });
    res.status(201).json({ id });
  });

  app.patch(`/api/${object}/:id`, (req, res) => {
    const cols = columns.filter((c) => req.body[c] !== undefined);
    if (cols.length === 0) return res.status(400).json({ error: 'no fields' });
    const result = db.prepare(
      `UPDATE ${object} SET last_modified = ?${cols.map((c) => `, ${c} = ?`).join('')} WHERE id = ?`,
    ).run(now(), ...cols.map((c) => req.body[c]), req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'not found' });
    // Only fire when a row actually changed — the guard above already
    // returned on a no-op update, so reaching here means real mutation.
    emit({ object, recordId: req.params.id, changeType: 'updated', fields: cols });
    res.json({ id: req.params.id });
  });
}

upsertRoutes('accounts', ['name', 'website', 'industry', 'employees', 'annual_revenue', 'billing_country', 'fit_score', 'segment']);
upsertRoutes('contacts', ['account_id', 'first_name', 'last_name', 'email', 'title']);
upsertRoutes('tasks', ['what_id', 'who_id', 'subject', 'description', 'status']);

if (require.main === module) {
  seed();
  const port = Number(process.env.CRM_PORT ?? 4000);
  app.listen(port, () => console.log(`crm sandbox on :${port}`));
}
