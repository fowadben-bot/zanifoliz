import { withContext } from './db.js';

function shape(row, dailyMinutes) {
  const activeSeconds = Number(row?.active_seconds || 0);
  const chatMessages = Number(row?.chat_messages || 0);
  const limitSeconds = Number(dailyMinutes || 30) * 60;
  return {
    active_seconds: activeSeconds,
    chat_messages: chatMessages,
    daily_minutes: Number(dailyMinutes || 30),
    remaining_seconds: Math.max(0, limitSeconds - activeSeconds),
    limit_reached: activeSeconds >= limitSeconds
  };
}

export async function getChildUsage(childId) {
  return withContext({ childId }, async (client) => {
    const child = (await client.query(
      'SELECT daily_minutes FROM children WHERE id=$1',
      [childId]
    )).rows[0];
    if (!child) return null;
    const usage = (await client.query(
      'SELECT active_seconds,chat_messages FROM daily_usage WHERE child_id=$1 AND usage_date=CURRENT_DATE',
      [childId]
    )).rows[0];
    return shape(usage, child.daily_minutes);
  });
}

export async function recordHeartbeat(childId, seconds = 60) {
  const delta = Math.max(15, Math.min(60, Number(seconds) || 60));
  return withContext({ childId }, async (client) => {
    const child = (await client.query(
      'SELECT daily_minutes FROM children WHERE id=$1',
      [childId]
    )).rows[0];
    if (!child) return null;
    const limitSeconds = Number(child.daily_minutes) * 60;
    const row = (await client.query(
      `INSERT INTO daily_usage(child_id,usage_date,active_seconds)
       VALUES($1,CURRENT_DATE,LEAST($2,$3))
       ON CONFLICT(child_id,usage_date) DO UPDATE
       SET active_seconds=LEAST(daily_usage.active_seconds + EXCLUDED.active_seconds,$3),
           updated_at=NOW()
       RETURNING active_seconds,chat_messages`,
      [childId, delta, limitSeconds]
    )).rows[0];
    return shape(row, child.daily_minutes);
  });
}

export async function recordChatMessage(childId) {
  return withContext({ childId }, async (client) => {
    const child = (await client.query(
      'SELECT daily_minutes FROM children WHERE id=$1',
      [childId]
    )).rows[0];
    if (!child) return null;
    const current = (await client.query(
      'SELECT active_seconds,chat_messages FROM daily_usage WHERE child_id=$1 AND usage_date=CURRENT_DATE',
      [childId]
    )).rows[0];
    const usage = shape(current, child.daily_minutes);
    if (usage.limit_reached) {
      const error = new Error('Daily child limit reached');
      error.code = 'daily_limit_reached';
      throw error;
    }
    const row = (await client.query(
      `INSERT INTO daily_usage(child_id,usage_date,chat_messages)
       VALUES($1,CURRENT_DATE,1)
       ON CONFLICT(child_id,usage_date) DO UPDATE
       SET chat_messages=daily_usage.chat_messages + 1,
           updated_at=NOW()
       RETURNING active_seconds,chat_messages`,
      [childId]
    )).rows[0];
    return shape(row, child.daily_minutes);
  });
}

export async function getParentTodayUsage(parentId) {
  return withContext({ parentId }, async (client) => {
    const rows = (await client.query(
      `SELECT c.id,c.nickname,c.daily_minutes,
              COALESCE(u.active_seconds,0) AS active_seconds,
              COALESCE(u.chat_messages,0) AS chat_messages
       FROM children c
       LEFT JOIN daily_usage u
         ON u.child_id=c.id AND u.usage_date=CURRENT_DATE
       ORDER BY c.created_at`,
      []
    )).rows;
    return rows.map((row) => ({ id: row.id, nickname: row.nickname, ...shape(row, row.daily_minutes) }));
  });
}
