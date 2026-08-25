import { Pool, types } from "pg";

// node-postgres returns bigint (int8) and numeric as STRINGS by default, which crashes
// naive consumers (e.g. sum(sent) came back as "0"). Parse them as JS numbers globally so
// every endpoint returns numbers as numbers. Counts here are well within safe-integer range.
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));   // int8 / bigint
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));   // numeric / decimal

// One shared pool across hot-reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var _evergreenPool: Pool | undefined;
}

function makePool() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set in frontend/.env.local");
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Supabase pooler requires SSL
    max: 5,
  });
}

export function pool(): Pool {
  if (!global._evergreenPool) global._evergreenPool = makePool();
  return global._evergreenPool;
}

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}
