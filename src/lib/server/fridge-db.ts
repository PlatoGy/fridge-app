import { neon } from '@neondatabase/serverless';

let sqlClient: ReturnType<typeof neon> | null = null;
let migrated = false;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }
  sqlClient ??= neon(databaseUrl);
  return sqlClient;
}

async function migrate() {
  if (migrated) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS fridge_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  migrated = true;
}

export async function getFridgeState() {
  await migrate();
  const sql = getSql();
  const result = await sql`
    SELECT data
    FROM fridge_state
    WHERE id = 'default'
    LIMIT 1
  `;
  const rows = result as Array<{ data: unknown }>;
  return rows[0]?.data ?? null;
}

export async function saveFridgeState(data: unknown) {
  await migrate();
  const sql = getSql();
  await sql`
    INSERT INTO fridge_state (id, data, updated_at)
    VALUES ('default', ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE
    SET data = EXCLUDED.data,
        updated_at = now()
  `;
}
