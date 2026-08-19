import Database from 'better-sqlite3';

// The whole sandbox CRM lives in one SQLite file. Salesforce has standard
// objects with key-prefixed ids; we mimic three of them — Account, Contact,
// Task — closely enough that the workflow engine upstream feels real.
export const db = new Database(process.env.CRM_DB ?? 'crm.sqlite');

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,             -- '001' key prefix, like Salesforce
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  employees INTEGER,
  annual_revenue INTEGER,
  billing_country TEXT,
  fit_score INTEGER,               -- written by the AI triage layer (step 6)
  segment TEXT,                    -- 'enterprise' | 'mid_market' | 'smb' | 'unqualified'
  last_modified TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,             -- '003' key prefix
  account_id TEXT REFERENCES accounts(id),
  first_name TEXT,
  last_name TEXT NOT NULL,
  email TEXT,
  title TEXT,
  last_modified TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,             -- '00T' key prefix
  what_id TEXT,                    -- the account this task is about
  who_id TEXT,                     -- the contact it targets
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  last_modified TEXT NOT NULL
);
`);

let counter = 0;

// Salesforce ids encode the object type in a 3-char key prefix: 001 is
// Account, 003 is Contact, 00T is Task. Mimicking that makes any id
// self-describing in logs and webhook payloads.
export function newId(prefix: '001' | '003' | '00T'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36).padStart(4, '0')}`;
}

export function now(): string {
  return new Date().toISOString();
}
