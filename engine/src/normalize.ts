// Normalization: the boring functions that make matching possible. The CRM
// seed has 'https://www.vantiq-systems.com' and 'vantiq-systems.com' as
// different strings for the same company — these helpers collapse them.

// 'https://www.Vantiq-Systems.com/about' -> 'vantiq-systems.com'
export function toDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '');   // strip protocol
  s = s.replace(/^www\./, '');         // strip www
  s = s.split(/[/?#]/)[0];             // strip path/query/fragment
  return s.includes('.') ? s : null;   // a bare word is not a domain
}

// 'dana.ito@Vantiq-Systems.com' -> 'vantiq-systems.com'
export function emailDomain(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null;
  return toDomain(email.split('@')[1]);
}

const LEGAL_SUFFIXES = /\b(inc|llc|ltd|corp|corporation|gmbh|co)\.?$/i;

// 'MERIDIAN FREIGHT LLC' -> 'meridian freight'
export function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(LEGAL_SUFFIXES, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}
