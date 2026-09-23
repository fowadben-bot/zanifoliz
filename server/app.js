import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { query, withContext, healthcheck, cleanupExpired } from './db.js';
import {
  randomToken,
  tokenHash,
  familyCode,
  normalizeEmail,
  normalizeFamilyCode,
  normalizeNickname,
  nicknameIsSafe,
  hashPassword,
  verifyPassword,
  hashPin,
  verifyPin,
  constantTimeEqual
} from './security.js';
import { mailerReady, sendVerificationEmail, sendPasswordResetEmail } from './mailer.js';
import { childSafeReply } from './ai.js';
import { getChildUsage, recordHeartbeat, recordChatMessage, getParentTodayUsage } from './usage.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'http://localhost:8080').replace(/\/$/, '');
const PC = 'parent_session';
const CC = 'child_session';
const PX = 'parent_csrf';
const CX = 'child_csrf';

if (production && (!process.env.SESSION_PEPPER || !process.env.PIN_PEPPER || !process.env.DB_PASSWORD)) {
  throw new Error('Missing production secrets');
}
if (production && !publicOrigin.startsWith('https://')) {
  throw new Error('PUBLIC_ORIGIN must use HTTPS in production');
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '16kb', strict: true }));
app.use(cookieParser());

const limiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false });
const childLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });
const heartbeatLimiter = rateLimit({ windowMs: 60_000, limit: 4, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', limiter);

function fail(res, status, code) {
  return res.status(status).json({ ok: false, code });
}

function cookieOptions(ms, httpOnly = true) {
  return { httpOnly, secure: production, sameSite: 'strict', path: '/', maxAge: ms };
}

app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const site = req.get('sec-fetch-site');
  if (production && origin && origin !== publicOrigin) return fail(res, 403, 'origin_forbidden');
  if (production && site === 'cross-site') return fail(res, 403, 'cross_site_forbidden');
  next();
});

async function createSession(type, res, parentId = null, childId = null) {
  const token = randomToken();
  const csrf = randomToken(18);
  const parent = type === 'parent';
  const ms = parent ? 7 * 86_400_000 : 86_400_000;
  await query(
    'INSERT INTO sessions(session_type,parent_id,child_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)',
    [type, parentId, childId, tokenHash(token), new Date(Date.now() + ms)]
  );
  res.cookie(parent ? PC : CC, token, cookieOptions(ms, true));
  res.cookie(parent ? PX : CX, csrf, cookieOptions(ms, false));
}

async function session(req, type) {
  const token = req.cookies[type === 'parent' ? PC : CC];
  if (!token) return null;
  const result = await query(
    `SELECT s.id,s.parent_id,s.child_id,p.email,p.verified_at,p.family_code,p.marketing_opt_in
     FROM sessions s
     LEFT JOIN parents p ON p.id=s.parent_id
     WHERE s.session_type=$1 AND s.token_hash=$2 AND s.expires_at>NOW()
     LIMIT 1`,
    [type, tokenHash(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  await query('UPDATE sessions SET last_seen_at=NOW() WHERE id=$1', [row.id]);
  if (type === 'child' && row.child_id) {
    const child = await withContext({ childId: row.child_id }, async (client) => (
      await client.query(
        'SELECT nickname,age_group,hero,status,ai_enabled,daily_minutes FROM children WHERE id=$1',
        [row.child_id]
      )
    ).rows[0]);
    if (!child) return null;
    return { ...row, ...child };
  }
  return row;
}

function csrf(type) {
  return (req, res, next) => {
    const cookieName = type === 'parent' ? PX : CX;
    const cookieValue = req.cookies[cookieName];
    const headerValue = req.get('x-csrf-token');
    if (!cookieValue || !headerValue || !constantTimeEqual(cookieValue, headerValue)) {
      return fail(res, 403, 'csrf_failed');
    }
    next();
  };
}

async function parentAuth(req, res, next) {
  try {
    const current = await session(req, 'parent');
    if (!current?.parent_id) return fail(res, 401, 'parent_auth_required');
    req.parentSession = current;
    next();
  } catch (error) {
    next(error);
  }
}

async function childAuth(req, res, next) {
  try {
    const current = await session(req, 'child');
    if (!current?.child_id || current.status !== 'active') return fail(res, 401, 'child_auth_required');
    req.childSession = current;
    next();
  } catch (error) {
    next(error);
  }
}

const email = z.string().email().max(254);
const password = z.string().min(12).max(128);
const pin = z.string().regex(/^\d{6}$/);

app.get('/api/health', async (_req, res, next) => {
  try {
    res.json({ ok: await healthcheck() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/parent/register', authLimiter, async (req, res, next) => {
  try {
    if (production && !mailerReady()) return fail(res, 503, 'email_service_unavailable');
    const parsed = z.object({
      email,
      password,
      terms_accepted: z.literal(true),
      marketing_opt_in: z.boolean().optional().default(false)
    }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_registration');

    const normalizedEmail = normalizeEmail(parsed.data.email);
    if ((await query('SELECT 1 FROM parents WHERE email=$1', [normalizedEmail])).rowCount) {
      return fail(res, 409, 'account_exists');
    }

    const passwordHash = await hashPassword(parsed.data.password);
    let parent = null;
    for (let i = 0; i < 6 && !parent; i += 1) {
      try {
        parent = (await query(
          'INSERT INTO parents(email,password_hash,family_code,marketing_opt_in) VALUES($1,$2,$3,$4) RETURNING id,email',
          [normalizedEmail, passwordHash, familyCode(), parsed.data.marketing_opt_in]
        )).rows[0];
      } catch (error) {
        if (error.code !== '23505') throw error;
      }
    }
    if (!parent) return fail(res, 500, 'family_code_generation_failed');

    await withContext({ parentId: parent.id }, async (client) => client.query(
      "INSERT INTO consents(parent_id,kind,text_version,granted) VALUES($1,'terms_privacy','2026-09',TRUE)",
      [parent.id]
    ));

    const token = randomToken();
    await query(
      "INSERT INTO auth_tokens(parent_id,purpose,token_hash,expires_at) VALUES($1,'verify_email',$2,NOW()+INTERVAL '24 hours')",
      [parent.id, tokenHash(token)]
    );
    const devUrl = await sendVerificationEmail(parent.email, token);
    res.status(201).json({ ok: true, message: 'verification_required', ...(production ? {} : { dev_verification_url: devUrl }) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/parent/resend-verification', authLimiter, async (req, res, next) => {
  try {
    if (production && !mailerReady()) return fail(res, 503, 'email_service_unavailable');
    const parsed = z.object({ email }).safeParse(req.body);
    if (parsed.success) {
      const user = (await query(
        'SELECT id,email,verified_at FROM parents WHERE email=$1',
        [normalizeEmail(parsed.data.email)]
      )).rows[0];
      if (user && !user.verified_at) {
        await query("DELETE FROM auth_tokens WHERE parent_id=$1 AND purpose='verify_email'", [user.id]);
        const token = randomToken();
        await query(
          "INSERT INTO auth_tokens(parent_id,purpose,token_hash,expires_at) VALUES($1,'verify_email',$2,NOW()+INTERVAL '24 hours')",
          [user.id, tokenHash(token)]
        );
        await sendVerificationEmail(user.email, token);
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/parent/verify', authLimiter, async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    if (token.length < 20) return res.redirect('/compte.html?verify=invalid');
    const row = (await query(
      "SELECT id,parent_id FROM auth_tokens WHERE purpose='verify_email' AND token_hash=$1 AND used_at IS NULL AND expires_at>NOW() LIMIT 1",
      [tokenHash(token)]
    )).rows[0];
    if (!row) return res.redirect('/compte.html?verify=invalid');
    await query('UPDATE parents SET verified_at=COALESCE(verified_at,NOW()),updated_at=NOW() WHERE id=$1', [row.parent_id]);
    await query('UPDATE auth_tokens SET used_at=NOW() WHERE id=$1', [row.id]);
    await createSession('parent', res, row.parent_id, null);
    res.redirect('/parents.html?verified=1');
  } catch (error) {
    next(error);
  }
});

app.post('/api/parent/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({ email, password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_credentials');
    const user = (await query(
      'SELECT id,password_hash,verified_at FROM parents WHERE email=$1',
      [normalizeEmail(parsed.data.email)]
    )).rows[0];
    if (!user || !(await verifyPassword(user.password_hash, parsed.data.password))) return fail(res, 401, 'invalid_credentials');
    if (!user.verified_at) return fail(res, 403, 'email_not_verified');
    await createSession('parent', res, user.id, null);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/parent/logout', parentAuth, csrf('parent'), async (req, res, next) => {
  try {
    const token = req.cookies[PC];
    if (token) await query("DELETE FROM sessions WHERE session_type='parent' AND token_hash=$1", [tokenHash(token)]);
    res.clearCookie(PC, { path: '/' });
    res.clearCookie(PX, { path: '/' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/parent/me', parentAuth, (req, res) => {
  const current = req.parentSession;
  res.json({
    ok: true,
    parent: {
      email: current.email,
      family_code: current.family_code,
      verified: Boolean(current.verified_at),
      marketing_opt_in: Boolean(current.marketing_opt_in)
    }
  });
});

app.patch('/api/parent/preferences', parentAuth, csrf('parent'), async (req, res, next) => {
  try {
    const parsed = z.object({ marketing_opt_in: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_preferences');
    await query(
      'UPDATE parents SET marketing_opt_in=$1,updated_at=NOW() WHERE id=$2',
      [parsed.data.marketing_opt_in, req.parentSession.parent_id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/parent/password-reset/request', authLimiter, async (req, res, next) => {
  try {
    if (production && !mailerReady()) return fail(res, 503, 'email_service_unavailable');
    const parsed = z.object({ email }).safeParse(req.body);
    if (parsed.success) {
      const user = (await query('SELECT id,email FROM parents WHERE email=$1', [normalizeEmail(parsed.data.email)])).rows[0];
      if (user) {
        await query("DELETE FROM auth_tokens WHERE parent_id=$1 AND purpose='password_reset'", [user.id]);
        const token = randomToken();
        await query(
          "INSERT INTO auth_tokens(parent_id,purpose,token_hash,expires_at) VALUES($1,'password_reset',$2,NOW()+INTERVAL '1 hour')",
          [user.id, tokenHash(token)]
        );
        const devUrl = await sendPasswordResetEmail(user.email, token);
        if (!production) return res.json({ ok: true, dev_reset_url: devUrl });
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/parent/password-reset/confirm', authLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({ token: z.string().min(20).max(200), password }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_reset');
    const row = (await query(
      "SELECT id,parent_id FROM auth_tokens WHERE purpose='password_reset' AND token_hash=$1 AND used_at IS NULL AND expires_at>NOW() LIMIT 1",
      [tokenHash(parsed.data.token)]
    )).rows[0];
    if (!row) return fail(res, 400, 'invalid_reset');
    await query('UPDATE parents SET password_hash=$1,updated_at=NOW() WHERE id=$2', [await hashPassword(parsed.data.password), row.parent_id]);
    await query('UPDATE auth_tokens SET used_at=NOW() WHERE id=$1', [row.id]);
    await query('DELETE FROM sessions WHERE parent_id=$1', [row.parent_id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/parent/children', parentAuth, async (req, res, next) => {
  try {
    const parentId = req.parentSession.parent_id;
    const children = await withContext({ parentId }, async (client) => (
      await client.query(
        'SELECT id,nickname,age_group,hero,status,ai_enabled,daily_minutes,created_at,approved_at FROM children ORDER BY created_at DESC'
      )
    ).rows);
    const usage = await getParentTodayUsage(parentId);
    const usageById = new Map(usage.map((item) => [String(item.id), item]));
    res.json({
      ok: true,
      children: children.map((child) => ({ ...child, usage_today: usageById.get(String(child.id)) || null }))
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/parent/children/:id/approve', parentAuth, csrf('parent'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id)) return fail(res, 400, 'invalid_child');
    const row = await withContext({ parentId: req.parentSession.parent_id }, async (client) => (
      await client.query(
        "UPDATE children SET status='active',approved_at=COALESCE(approved_at,NOW()),updated_at=NOW() WHERE id=$1 RETURNING id,status",
        [id]
      )
    ).rows[0]);
    if (!row) return fail(res, 404, 'child_not_found');
    res.json({ ok: true, child: row });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/parent/children/:id/settings', parentAuth, csrf('parent'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const parsed = z.object({
      ai_enabled: z.boolean().optional(),
      daily_minutes: z.number().int().min(10).max(180).optional()
    }).refine((value) => Object.keys(value).length > 0).safeParse(req.body);
    if (!Number.isSafeInteger(id) || !parsed.success) return fail(res, 400, 'invalid_settings');

    const row = await withContext({ parentId: req.parentSession.parent_id }, async (client) => {
      const old = (await client.query('SELECT id,ai_enabled,daily_minutes FROM children WHERE id=$1', [id])).rows[0];
      if (!old) return null;
      const aiEnabled = parsed.data.ai_enabled ?? old.ai_enabled;
      const dailyMinutes = parsed.data.daily_minutes ?? old.daily_minutes;
      const updated = (await client.query(
        'UPDATE children SET ai_enabled=$1,daily_minutes=$2,updated_at=NOW() WHERE id=$3 RETURNING id,ai_enabled,daily_minutes',
        [aiEnabled, dailyMinutes, id]
      )).rows[0];
      if (parsed.data.ai_enabled === true) {
        await client.query(
          "INSERT INTO consents(parent_id,child_id,kind,text_version,granted) VALUES($1,$2,'ai_chat','2026-09',TRUE)",
          [req.parentSession.parent_id, id]
        );
      }
      if (parsed.data.ai_enabled === false) {
        await client.query(
          "INSERT INTO consents(parent_id,child_id,kind,text_version,granted) VALUES($1,$2,'ai_chat','2026-09',FALSE)",
          [req.parentSession.parent_id, id]
        );
      }
      return updated;
    });
    if (!row) return fail(res, 404, 'child_not_found');
    res.json({ ok: true, child: row });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/parent/children/:id', parentAuth, csrf('parent'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id)) return fail(res, 400, 'invalid_child');
    const row = await withContext({ parentId: req.parentSession.parent_id }, async (client) => (
      await client.query('DELETE FROM children WHERE id=$1 RETURNING id', [id])
    ).rows[0]);
    if (!row) return fail(res, 404, 'child_not_found');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/parent/export', parentAuth, async (req, res, next) => {
  try {
    const parentId = req.parentSession.parent_id;
    const parent = (await query(
      'SELECT email,family_code,marketing_opt_in,created_at,verified_at FROM parents WHERE id=$1',
      [parentId]
    )).rows[0];
    const data = await withContext({ parentId }, async (client) => ({
      children: (await client.query('SELECT id,nickname,age_group,hero,status,ai_enabled,daily_minutes,created_at FROM children ORDER BY id')).rows,
      progress: (await client.query('SELECT child_id,activity_key,score,stars,updated_at FROM progress ORDER BY child_id,activity_key')).rows,
      favorites: (await client.query('SELECT child_id,content_type,content_key,created_at FROM favorites ORDER BY child_id')).rows,
      consents: (await client.query('SELECT child_id,kind,text_version,granted,created_at FROM consents ORDER BY created_at')).rows,
      daily_usage: (await client.query('SELECT child_id,usage_date,active_seconds,chat_messages,updated_at FROM daily_usage ORDER BY usage_date DESC,child_id')).rows
    }));
    res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees.json"');
    res.json({ exported_at: new Date().toISOString(), parent, ...data });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/parent/account', parentAuth, csrf('parent'), async (req, res, next) => {
  try {
    const parsed = z.object({ password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'password_required');
    const parentId = req.parentSession.parent_id;
    const row = (await query('SELECT password_hash FROM parents WHERE id=$1', [parentId])).rows[0];
    if (!row || !(await verifyPassword(row.password_hash, parsed.data.password))) return fail(res, 401, 'invalid_credentials');
    await query('DELETE FROM parents WHERE id=$1', [parentId]);
    [PC, PX, CC, CX].forEach((name) => res.clearCookie(name, { path: '/' }));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/child/request', childLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({
      family_code: z.string().min(6).max(12),
      nickname: z.string().min(2).max(24),
      age_group: z.enum(['5-7', '8-10', '11-13', '14-17']),
      hero: z.enum(['Lion', 'Taupe', 'Rihno']),
      pin
    }).safeParse(req.body);
    if (!parsed.success || !nicknameIsSafe(parsed.data?.nickname || '')) return fail(res, 400, 'invalid_child_profile');

    const parent = (await query(
      'SELECT id,verified_at FROM parents WHERE family_code=$1',
      [normalizeFamilyCode(parsed.data.family_code)]
    )).rows[0];
    if (!parent?.verified_at) return fail(res, 404, 'family_not_found');

    const count = await withContext({ parentId: parent.id }, async (client) => Number(
      (await client.query('SELECT COUNT(*) AS n FROM children')).rows[0].n
    ));
    if (count >= 8) return fail(res, 409, 'family_profile_limit');

    const nickname = normalizeNickname(parsed.data.nickname);
    try {
      const child = await withContext({ parentId: parent.id }, async (client) => (
        await client.query(
          `INSERT INTO children(parent_id,nickname,nickname_key,age_group,hero,pin_hash,status,created_by_child)
           VALUES($1,$2,LOWER($2),$3,$4,$5,'pending',TRUE)
           RETURNING id,nickname,status`,
          [parent.id, nickname, parsed.data.age_group, parsed.data.hero, await hashPin(parsed.data.pin)]
        )
      ).rows[0]);
      res.status(201).json({ ok: true, child, message: 'pending_parent_approval' });
    } catch (error) {
      if (error.code === '23505') return fail(res, 409, 'nickname_already_used');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/child/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({
      family_code: z.string().min(6).max(12),
      nickname: z.string().min(2).max(24),
      pin
    }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_credentials');

    const parent = (await query(
      'SELECT id FROM parents WHERE family_code=$1',
      [normalizeFamilyCode(parsed.data.family_code)]
    )).rows[0];
    if (!parent) return fail(res, 401, 'invalid_credentials');

    const child = await withContext({ parentId: parent.id }, async (client) => (
      await client.query(
        'SELECT id,pin_hash,status FROM children WHERE nickname_key=$1 LIMIT 1',
        [normalizeNickname(parsed.data.nickname).toLowerCase()]
      )
    ).rows[0]);
    if (!child || !(await verifyPin(child.pin_hash, parsed.data.pin))) return fail(res, 401, 'invalid_credentials');
    if (child.status !== 'active') return fail(res, 403, 'child_pending_approval');
    await createSession('child', res, null, child.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/child/logout', childAuth, csrf('child'), async (req, res, next) => {
  try {
    const token = req.cookies[CC];
    if (token) await query("DELETE FROM sessions WHERE session_type='child' AND token_hash=$1", [tokenHash(token)]);
    res.clearCookie(CC, { path: '/' });
    res.clearCookie(CX, { path: '/' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/child/me', childAuth, async (req, res, next) => {
  try {
    const current = req.childSession;
    const usage = await getChildUsage(current.child_id);
    res.json({
      ok: true,
      child: {
        nickname: current.nickname,
        age_group: current.age_group,
        hero: current.hero,
        ai_enabled: Boolean(current.ai_enabled),
        daily_minutes: Number(current.daily_minutes),
        usage_today: usage
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/child/usage', childAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, usage: await getChildUsage(req.childSession.child_id) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/child/usage/heartbeat', heartbeatLimiter, childAuth, csrf('child'), async (req, res, next) => {
  try {
    const parsed = z.object({ seconds: z.number().int().min(15).max(60).optional().default(60) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, 400, 'invalid_usage');
    const usage = await recordHeartbeat(req.childSession.child_id, parsed.data.seconds);
    res.json({ ok: true, usage });
  } catch (error) {
    next(error);
  }
});

app.post('/api/progress', childAuth, csrf('child'), async (req, res, next) => {
  try {
    const parsed = z.object({
      activity_key: z.string().regex(/^[a-z0-9_-]{2,64}$/),
      score: z.number().int().min(0).max(1_000_000),
      stars: z.number().int().min(0).max(5)
    }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_progress');
    await withContext({ childId: req.childSession.child_id }, async (client) => client.query(
      `INSERT INTO progress(child_id,activity_key,score,stars)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(child_id,activity_key) DO UPDATE
       SET score=GREATEST(progress.score,EXCLUDED.score),
           stars=GREATEST(progress.stars,EXCLUDED.stars),
           updated_at=NOW()`,
      [req.childSession.child_id, parsed.data.activity_key, parsed.data.score, parsed.data.stars]
    ));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/progress', childAuth, async (req, res, next) => {
  try {
    const rows = await withContext({ childId: req.childSession.child_id }, async (client) => (
      await client.query('SELECT activity_key,score,stars,updated_at FROM progress ORDER BY updated_at DESC')
    ).rows);
    res.json({ ok: true, progress: rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/favorites', childAuth, csrf('child'), async (req, res, next) => {
  try {
    const parsed = z.object({
      content_type: z.enum(['game', 'clip', 'story']),
      content_key: z.string().regex(/^[a-z0-9_-]{2,64}$/)
    }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_favorite');
    await withContext({ childId: req.childSession.child_id }, async (client) => client.query(
      'INSERT INTO favorites(child_id,content_type,content_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [req.childSession.child_id, parsed.data.content_type, parsed.data.content_key]
    ));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/favorites', childAuth, async (req, res, next) => {
  try {
    const rows = await withContext({ childId: req.childSession.child_id }, async (client) => (
      await client.query('SELECT content_type,content_key,created_at FROM favorites ORDER BY created_at DESC')
    ).rows);
    res.json({ ok: true, favorites: rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat', chatLimiter, childAuth, csrf('child'), async (req, res, next) => {
  try {
    const parsed = z.object({
      hero: z.enum(['Lion', 'Taupe', 'Rihno']),
      message: z.string().min(1).max(280)
    }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_chat');

    const current = req.childSession;
    if (!current.ai_enabled) return fail(res, 403, 'ai_parental_activation_required');
    const usage = await getChildUsage(current.child_id);
    if (usage?.limit_reached) return fail(res, 429, 'daily_limit_reached');

    const reply = await childSafeReply({
      hero: parsed.data.hero,
      ageGroup: current.age_group,
      message: parsed.data.message
    });
    if (!reply.available) return fail(res, 503, 'ai_unavailable');
    await recordChatMessage(current.child_id);
    res.json({ ok: true, reply: reply.text, blocked: Boolean(reply.blocked) });
  } catch (error) {
    if (error?.code === 'daily_limit_reached') return fail(res, 429, 'daily_limit_reached');
    next(error);
  }
});

app.use('/api', (_req, res) => fail(res, 404, 'not_found'));
app.use((error, _req, res, _next) => {
  console.error('[api]', error?.message || error);
  if (!res.headersSent) fail(res, 500, 'server_error');
});

setInterval(() => cleanupExpired().catch((error) => console.error('[cleanup]', error.message)), 3_600_000).unref();
app.listen(port, '0.0.0.0', () => console.log(`[api] listening on ${port}`));
