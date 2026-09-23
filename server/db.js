import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'zanifol',
  user: process.env.DB_USER || 'zanifol_app',
  password: process.env.DB_PASSWORD,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 5_000,
  application_name: 'zanifol_api'
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err.message);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withContext({ parentId = null, childId = null } = {}, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.parent_id', $1, true)", [parentId ? String(parentId) : '']);
    await client.query("SELECT set_config('app.child_id', $1, true)", [childId ? String(childId) : '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function healthcheck() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}

export async function cleanupExpired() {
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
  await pool.query('DELETE FROM auth_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL');
}

export { pool };
