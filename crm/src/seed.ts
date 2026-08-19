import { db, newId, now } from './db';

// Deliberately messy seed data — the mess IS the curriculum. Note the two
// Vantiq rows (one with https://www., one bare), the name-cased dupe of
// Meridian Freight, and the accounts missing industry/employees entirely.
const accounts = [
  { name: 'Vantiq Systems', website: 'https://www.vantiq-systems.com', industry: 'Software', employees: 420, annual_revenue: 68000000, billing_country: 'US' },
  { name: 'Vantiq Systems Inc.', website: 'vantiq-systems.com', industry: null, employees: null, annual_revenue: null, billing_country: null },
  { name: 'Meridian Freight', website: 'https://meridianfreight.io', industry: 'Logistics', employees: 1300, annual_revenue: null, billing_country: 'US' },
  { name: 'MERIDIAN FREIGHT LLC', website: null, industry: 'Logistics', employees: null, annual_revenue: 210000000, billing_country: 'US' },
  { name: 'Halcyon Health', website: 'https://halcyonhealth.com', industry: 'Healthcare', employees: 95, annual_revenue: 12000000, billing_country: 'US' },
  { name: 'Northwind Analytics', website: null, industry: null, employees: null, annual_revenue: null, billing_country: 'DE' },
  { name: 'Kestrel Robotics', website: 'https://kestrel.dev', industry: 'Robotics', employees: 2100, annual_revenue: 480000000, billing_country: 'US' },
];

const contacts = [
  { account: 'Vantiq Systems', first_name: 'Dana', last_name: 'Ito', email: 'DANA.ITO@vantiq-systems.com', title: 'VP Infrastructure' },
  { account: 'Meridian Freight', first_name: 'Luis', last_name: 'Ferreira', email: 'luis@meridianfreight.io', title: 'Head of IT' },
  { account: 'Halcyon Health', first_name: null, last_name: 'Okafor', email: 'a.okafor@halcyonhealth.com', title: null },
  { account: 'Kestrel Robotics', first_name: 'Mei', last_name: 'Chen', email: 'mei.chen@kestrel.dev', title: 'Director of Security Engineering' },
];

export function seed(): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number };
  if (count.n > 0) return; // idempotent: never double-seed

  const insertAccount = db.prepare(
    `INSERT INTO accounts (id, name, website, industry, employees, annual_revenue, billing_country, last_modified)
     VALUES (@id, @name, @website, @industry, @employees, @annual_revenue, @billing_country, @last_modified)`,
  );
  const insertContact = db.prepare(
    `INSERT INTO contacts (id, account_id, first_name, last_name, email, title, last_modified)
     VALUES (@id, @account_id, @first_name, @last_name, @email, @title, @last_modified)`,
  );

  const idsByName = new Map<string, string>();
  for (const a of accounts) {
    const id = newId('001');
    idsByName.set(a.name, id);
    insertAccount.run({ id, last_modified: now(), ...a });
  }
  for (const c of contacts) {
    const { account, ...fields } = c;
    insertContact.run({
      id: newId('003'),
      account_id: idsByName.get(account) ?? null,
      last_modified: now(),
      ...fields,
    });
  }
}
