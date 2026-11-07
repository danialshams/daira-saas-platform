import pg from 'pg';

const { Pool } = pg;
const globalForDb = globalThis;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!globalForDb.__dairaPool) {
    globalForDb.__dairaPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 8000,
      ssl: /^(localhost|127\.0\.0\.1|db)$/i.test(new URL(process.env.DATABASE_URL).hostname) ? false : { rejectUnauthorized: true },
    });
  }
  return globalForDb.__dairaPool;
}

export const sql = (text, params = []) => db().query(text, params);

export async function transaction(callback) {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

export async function audit(workspaceId, userId, action, metadata = {}) {
  await sql('INSERT INTO audit_logs(workspace_id,user_id,action,metadata) VALUES ($1,$2,$3,$4)', [workspaceId,userId,action,JSON.stringify(metadata)]);
}

export async function emitEvent(workspaceId, eventName, payload) {
  await sql(`INSERT INTO webhook_deliveries(workspace_id,webhook_id,event_name,payload)
    SELECT w.workspace_id,w.id,$2,$3 FROM webhooks w WHERE w.workspace_id=$1 AND w.enabled=true AND
    (w.events ? $2 OR w.events ? '*')`,[workspaceId,eventName,JSON.stringify(payload)]);
}
