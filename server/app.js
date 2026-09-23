import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { query, withContext, healthcheck, cleanupExpired } from './db.js';
import {
  randomToken, tokenHash, familyCode, normalizeEmail, normalizeFamilyCode,
  normalizeNickname, nicknameIsSafe, hashPassword, verifyPassword,
  hashPin, verifyPin, constantTimeEqual
} from './security.js';
import { mailerReady, sendVerificationEmail, sendPasswordResetEmail } from './mailer.js';
import { childSafeReply } from './ai.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'http://localhost:8080').replace(/\/$/, '');
const parentCookie = 'parent_session';
const childCookie = 'child_session';
const parentCsrfCookie = 'parent_csrf';
const childCsrfCookie = 'child_csrf';

if (production && (!process.env.SESSION_PEPPER || !process.env.PIN_PEPPER || !process.env.DB_PASSWORD)) {
  throw new Error('Missing required production secrets: SESSION_PEPPER, PIN_PEPPER or DB_PASSWORD');
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '16kb', strict: true }));
app.use(cookieParser());

const genericLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false });
const childCreateLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', genericLimiter);

function jsonError(res, status, code, message = code) {
  return res.status(status).json({ ok: false, code, message });
}

function cookieOptions(maxAgeMs) {
  return { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: maxAgeMs };
}

function csrfCookieOptions(maxAgeMs) {
  return { httpOnly: false, secure: production, sameSite: 'strict', path: '/', maxAge: maxAgeMs };
}

function requireSameOrigin(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (production && origin && origin !== publicOrigin) return jsonError(res, 403, 'origin_forbidden');
  if (production && fetchSite === 'cross-site') return jsonError(res, 403, 'cross_site_forbidden');
  next();
}
app.use('/api', requireSameOrigin);

async function createSession({ type, parentId = null, childId = null, res }) {
  const token = randomToken();
  const csrf = randomToken(18);
  const isParent = type === 'parent';
  const maxAge = isParent ? 7 * 24 * 60 * 60_000 : 24 * 60 * 60_000;
  const expiresAt = new Date(Date.now() + maxAge);
  await query(
    `INSERT INTO sessions (session_type, parent_id, child_id, token_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [type, parentId, childId, tokenHash(token), expiresAt]
  );
  res.cookie(isParent ? parentCookie : childCookie, token, cookieOptions(maxAge));
  res.cookie(isParent ? parentCsrfCookie : childCsrfCookie, csrf, csrfCookieOptions(maxAge));
}

async function getSession(req, type) {
  const token = req.cookies[type === 'parent' ? parentCookie : childCookie];
  if (!token) return null;
  const result = await query(
    `SELECT s.id, s.parent_id, s.child_id, s.expires_at,
            p.email, p.verified_at, p.family_code, p.marketing_opt_in,
            c.nickname, c.age_group, c.hero, c.status, c.ai_enabled
       FROM sessions s
       LEFT JOIN parents p ON p.id = s.parent_id
       LEFT JOIN children c ON c.id = s.child_id
      WHERE s.session_type=$1 AND s.token_hash=$2 AND s.expires_at > NOW()
      LIMIT 1`,
    [type, tokenHash(token)]
  );
  return result.rows[0] || null;
}

function requireCsrf(type) {
  return (req, res, next) => {
    const cookieName = type === 'parent' ? parentCsrfCookie : childCsrfCookie;
    const cookie = req.cookies[cookieName];
    const header = req.get('x-csrf-token');
    if (!cookie || !header || !constantTimeEqual(cookie, header)) return jsonError(res, 403, 'csrf_failed');
    next();
  };
}

async function requireParent(req, res, next) {
  try {
    const session = await getSession(req, 'parent');
    if (!session?.parent_id) return jsonError(res, 401, 'parent_auth_required');
    req.parentSession = session;
    next();
  } catch (err) { next(err); }
}

async function requireChild(req, res, next) {
  try {
    const session = await getSession(req, 'child');
    if (!session?.child_id || session.status !== 'active') return jsonError(res, 401, 'child_auth_required');
    req.childSession = session;
    next();
  } catch (err) { next(err); }
}

const emailSchema = z.string().email().max(254);
const passwordSchema = z.string().min(12).max(128);
const pinSchema = z.string().regex(/^\d{6}$/);
const childSchema = z.object({
  family_code: z.string().min(6).max(12),
  nickname: z.string().min(2).max(24),
  age_group: z.enum(['5-7', '8-10', '11-13', '14-17']),
  hero: z.enum(['Lion', 'Taupe', 'Rihno']),
  pin: pinSchema
});

app.get('/api/health', async (_req, res, next) => {
  try { res.json({ ok: await healthcheck() }); } catch (err) { next(err); }
});

app.post('/api/parent/register', authLimiter, async (req, res, next) => {
  try {
    if (production && !mailerReady()) return jsonError(res, 503, 'email_service_unavailable');
    const parsed = z.object({
      email: emailSchema,
      password: passwordSchema,
      marketing_opt_in: z.boolean().optional().default(false)
    }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'invalid_registration');
    const email = normalizeEmail(parsed.data.email);
    const existing = await query('SELECT id, verified_at FROM parents WHERE email=$1', [email]);
    if (existing.rowCount) return jsonError(res, 409, 'account_exists');

    const passwordHash = await hashPassword(parsed.data.password);
    let code;
    let parent;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      code = familyCode();
      try {
        const inserted = await query(
          `INSERT INTO parents (email,password_hash,family_code,marketing_opt_in)
           VALUES ($1,$2,$3,$4)
           RETURNING id,email,family_code`,
          [email, passwordHash, code, parsed.data.marketing_opt_in]
        );
        parent = inserted.rows[0];
        break;
      } catch (err) {
        if (err.code !== '23505') throw err;
      }
    }
    if (!parent) return jsonError(res, 500, 'family_code_generation_failed');

    const token = randomToken();
    await query(
      `INSERT INTO auth_tokens (parent_id,purpose,token_hash,expires_at)
       VALUES ($1,'verify_email',$2,NOW()+INTERVAL '24 hours')`,
      [parent.id, tokenHash(token)]
    );
    const devLink = await sendVerificationEmail(parent.email, token);
    res.status(201).json({ ok: true, message: 'verification_required', ...(production ? {} : { dev_verification_url: devLink }) });
  } catch (err) { next(err); }
});

app.post('/api/parent/resend-verification', authLimiter, async (req, res, next) => {
  try {
    if (production && !mailerReady()) return jsonError(res, 503, 'email_service_unavailable');
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return res.json({ ok: true });
    const email = normalizeEmail(parsed.data.email);
    const found = await query('SELECT id,email,verified_at FROM parents WHERE email=$1', [email]);
    const parent = found.rows[0];
    if (parent && !parent.verified_at) {
      await query("DELETE FROM auth_tokens WHERE parent_id=$1 AND purpose='verify_email'", [parent.id]);
      const token = randomToken();
      await query(
        `INSERT INTO auth_tokens (parent_id,purpose,token_hash,expires_at)
         VALUES ($1,'verify_email',$2,NOW()+INTERVAL '24 hours')`,
        [parent.id, tokenHash(token)]
      );
      await sendVerificationEmail(parent.email, token);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/parent/verify', authLimiter, async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    if (token.length < 20) return res.redirect('/compte.html?verify=invalid');
    const found = await query(
      `SELECT t.id AS token_id, p.id AS parent_id
         FROM auth_tokens t
         JOIN parents p ON p.id=t.parent_id
        WHERE t.purpose='verify_email' AND t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>NOW()
        LIMIT 1`,
      [tokenHash(token)]
    );
    const row = found.rows[0];
    if (!row) return res.redirect('/compte.html?verify=invalid');
    await withContext({}, async (client) => {
      await client.query('UPDATE parents SET verified_at=COALESCE(verified_at,NOW()), updated_at=NOW() WHERE id=$1', [row.parent_id]);
      await client.query('UPDATE auth_tokens SET used_at=NOW() WHERE id=$1', [row.token_id]);
    });
    await createSession({ type: 'parent', parentId: row.parent_id, res });
    res.redirect('/parents.html?verified=1');
  } catch (err) { next(err); }
});

app.post('/api/parent/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'invalid_credentials');
    const email = normalizeEmail(parsed.data.email);
    const found = await query('SELECT id,password_hash,verified_at FROM parents WHERE email=$1', [email]);
    const parent = found.rows[0];
    if (!parent || !(await verifyPassword(parent.password_hash, parsed.data.password))) return jsonError(res, 401, 'invalid_credentials');
    if (!parent.verified_at) return jsonError(res, 403, 'email_not_verified');
    await query("DELETE FROM sessions WHERE session_type='parent' AND parent_id=$1 AND expires_at<NOW()", [parent.id]);
    await createSession({ type: 'parent', parentId: parent.id, res });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/parent/logout', requireParent, requireCsrf('parent'), async (req, res, next) => {
  try {
    const token = req.cookies[parentCookie];
    if (token) await query("DELETE FROM sessions WHERE session_type='parent' AND token_hash=$1", [tokenHash(token)]);
    res.clearCookie(parentCookie, { path: '/' });
    res.clearCookie(parentCsrfCookie, { path: '/' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/parent/me', requireParent, (req, res) => {
  const s = req.parentSession;
  res.json({ ok: true, parent: { email: s.email, family_code: s.family_code, verified: Boolean(s.verified_at), marketing_opt_in: Boolean(s.marketing_opt_in) } });
});

app.patch('/api/parent/preferences', requireParent, requireCsrf('parent'), async (req, res, next) => {
  try {
    const parsed = z.object({ marketing_opt_in: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'invalid_preferences');
    await query('UPDATE parents SET marketing_opt_in=$1, updated_at=NOW() WHERE id=$2', [parsed.data.marketing_opt_in, req.parentSession.parent_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/parent/password-reset/request', authLimiter, async (req, res, next) => {
  try {
    if (production && !mailerReady()) return jsonError(res, 503, 'email_service_unavailable');
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (parsed.success) {
      const email = normalizeEmail(parsed.data.email);
      const found = await query('SELECT id,email FROM parents WHERE email=$1', [email]);
      const parent = found.rows[0];
      if (parent) {
        await query("DELETE FROM auth_tokens WHERE parent_id=$1 AND purpose='password_reset'", [parent.id]);
        const token = randomToken();
        await query(
          `INSERT INTO auth_tokens (parent_id,purpose,token_hash,expires_at)
           VALUES ($1,'password_reset',$2,NOW()+INTERVAL '1 hour')`,
          [parent.id, tokenHash(token)]
        );
        const devLink = await sendPasswordResetEmail(parent.email, token);
        if (!production) return res.json({ ok: true, dev_reset_url: devLink });
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/parent/password-reset/confirm', authLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'invalid_reset');
    const found = await query(
      `SELECT id,parent_id FROM auth_tokens
        WHERE purpose='password_reset' AND token_hash=$1 AND used_at IS NULL AND expires_at>NOW()
        LIMIT 1`,
      [tokenHash(parsed.data.token)]
    );
    const row = found.rows[0];
    if (!row) return jsonError(res, 400, 'invalid_reset');
    const passwordHash = await hashPassword(parsed.data.password);
    await withContext({}, async (client) => {
      await client.query('UPDATE parents SET password_hash=$1, updated_at=NOW() WHERE id=$2', [passwordHash, row.parent_id]);
      await client.query('UPDATE auth_tokens SET used_at=NOW() WHERE id=$1', [row.id]);
      await client.query('DELETE FROM sessions WHERE parent_id=$1', [row.parent_id]);
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/parent/children', requireParent, async (req, res, next) => {
  try {
    const parentId = req.parentSession.parent_id;
    const children = await withContext({ parentId }, async (client) => {
      const result = await client.query(
        `SELECT id,nickname,age_group,hero,status,ai_enabled,daily_minutes,created_at,approved_at
           FROM children ORDER BY created_at DESC`
      );
      return result.rows;
    });
    res.json({ ok: true, children });
  } catch (err) { next(err); }
});

app.patch('/api/parent/children/:id/approve', requireParent, requireCsrf('parent'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(res, 400, 'invalid_child');
    const parentId = req.parentSession.parent_id;
    const updated = await withContext({ parentId }, async (client) => {
      const result = await client.query(
        `UPDATE children SET status='active', approved_at=COALESCE(approved_at,NOW()), updated_at=NOW()
          WHERE id=$1 RETURNING id,status`, [id]
      );
      return result.rows[0];
    });
    if (!updated) return jsonError(res, 404, 'child_not_found');
    res.json({ ok: true, child: updated });
  } catch (err) { next(err); }
});

app.patch('/api/parent/children/:id/settings', requireParent, requireCsrf('parent'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const parsed = z.object({
      ai_enabled: z.boolean().optional(),
      daily_minutes: z.number().int().min(10).max(180).optional()
    }).refine((v) => Object.keys(v).length > 0).safeParse(req.body);
    if (!Number.isSafeInteger(id) || !parsed.success) return jsonError(res, 400, 'invalid_settings');
    const parentId = req.parentSession.parent_id;
    const updated = await withContext({ parentId }, async (client) => {
      const fields = [];
      const values = [];
      let n = 1;
      if (typeof parsed.data.ai_enabled === 'boolean') { fields.push(`ai_enabled=$${n++}`); values.push(parsed.data.ai_enabled); }
      if (typeof parsed.data.daily_minutes === 'number') { fields.push(`daily_minutes=$${n++}`); values.push(parsed.data.daily_minutes); }
      values.push(id);
      const result = await client.query(
        `UPDATE children SET ${fields.join(',')}, updated_at=NOW() WHERE id=$${n} RETURNING id,ai_enabled,daily_minutes`,
        values
      );
      if (result.rows[0] && parsed.data.ai_enabled === true) {
        await client.query(
          `INSERT INTO consents (parent_id,child_id,kind,text_version,granted)
           VALUES ($1,$2,'ai_chat','2026-09',TRUE)`,
          [parentId, id]
        );
      }
      return result.rows[0];
    });
    if (!updated) return jsonError(res, 404, 'child_not_found');
    res.json({ ok: true, child: updated });
  } catch (err) { next(err); }
});

app.delete('/api/parent/children/:id', requireParent, requireCsrf('parent'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id)) return jsonError(res, 400, 'invalid_child');
    const parentId = req.parentSession.parent_id;
    const deleted = await withContext({ parentId }, async (client) => {
      const result = await client.query('DELETE FROM children WHERE id=$1 RETURNING id', [id]);
      return result.rows[0];
    });
    if (!deleted) return jsonError(res, 404, 'child_not_found');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/parent/export', requireParent, async (req, res, next) => {
  try {
    const parentId = req.parentSession.parent_id;
    const data = await withContext({ parentId }, async (client) => {
      const parent = await query('SELECT email,family_code,marketing_opt_in,created_at,verified_at FROM parents WHERE id=$1', [parentId]);
      const children = await client.query('SELECT id,nickname,age_group,hero,status,ai_enabled,daily_minutes,created_at FROM children ORDER BY id');
      const progress = await client.query('SELECT child_id,activity_key,score,stars,updated_at FROM progress ORDER BY child_id,activity_key');
      const favorites = await client.query('SELECT child_id,content_type,content_key,created_at FROM favorites ORDER BY child_id,content_type,content_key');
      const consents = await client.query('SELECT child_id,kind,text_version,granted,created_at FROM consents ORDER BY created_at');
      return { parent: parent.rows[0], children: children.rows, progress: progress.rows, favorites: favorites.rows, consents: consents.rows };
    });
    res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees.json"');
    res.json({ exported_at: new Date().toISOString(), ...data });
  } catch (err) { next(err); }
});

app.delete('/api/parent/account', requireParent, requireCsrf('parent'), async (req, res, next) => {
  try {
    const parsed = z.object({ password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'password_required');
    const parentId = req.parentSession.parent_id;
    const found = await query('SELECT password_hash FROM parents WHERE id=$1', [parentId]);
    if (!found.rows[0] || !(await verifyPassword(found.rows[0].password_hash, parsed.data.password))) return jsonError(res, 401, 'invalid_credentials');
    await query('DELETE FROM parents WHERE id=$1', [parentId]);
    res.clearCookie(parentCookie, { path: '/' });
    res.clearCookie(parentCsrfCookie, { path: '/' });
    res.clearCookie(childCookie, { path: '/' });
    res.clearCookie(childCsrfCookie, { path: '/' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/child/request', childCreateLimiter, async (req, res, next) => {
  try {
    const parsed = childSchema.safeParse(req.body);
    if (!parsed.success || !nicknameIsSafe(parsed.data?.nickname || '')) return jsonError(res, 400, 'invalid_child_profile');
    const family = normalizeFamilyCode(parsed.data.family_code);
    const nickname = normalizeNickname(parsed.data.nickname);
    const parentResult = await query('SELECT id,verified_at FROM parents WHERE family_code=$1', [family]);
    const parent = parentResult.rows[0];
    if (!parent?.verified_at) return jsonError(res, 404, 'family_not_found');
    const count = await query('SELECT COUNT(*)::int AS n FROM children WHERE parent_id=$1', [parent.id]);
    if ((count.rows[0]?.n || 0) >= 8) return jsonError(res, 409, 'family_profile_limit');
    const pinHash = await hashPin(parsed.data.pin);
    try {
      const child = await withContext({ parentId: parent.id }, async (client) => {
        const result = await client.query(
          `INSERT INTO children (parent_id,nickname,nickname_key,age_group,hero,pin_hash,status,created_by_child)
           VALUES ($1,$2,LOWER($2),$3,$4,$5,'pending',TRUE)
           RETURNING id,nickname,status`,
          [parent.id, nickname, parsed.data.age_group, parsed.data.hero, pinHash]
        );
        return result.rows[0];
      });
      res.status(201).json({ ok: true, child, message: 'pending_parent_approval' });
    } catch (err) {
      if (err.code === '23505') return jsonError(res, 409, 'nickname_already_used');
      throw err;
    }
  } catch (err) { next(err); }
});

app.post('/api/child/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({ family_code: z.string().min(6).max(12), nickname: z.string().min(2).max(24), pin: pinSchema }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'invalid_credentials');
    const family = normalizeFamilyCode(parsed.data.family_code);
    const nickname = normalizeNickname(parsed.data.nickname).toLowerCase();
    const found = await query(
      `SELECT c.id,c.pin_hash,c.status
         FROM children c JOIN parents p ON p.id=c.parent_id
        WHERE p.family_code=$1 AND c.nickname_key=$2 LIMIT 1`,
      [family, nickname]
    );
    const child = found.rows[0];
    if (!child || !(await verifyPin(child.pin_hash, parsed.data.pin))) return jsonError(res, 401, 'invalid_credentials');
    if (child.status !== 'active') return jsonError(res, 403, 'child_pending_approval');
    await createSession({ type: 'child', childId: child.id, res });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/child/logout', requireChild, requireCsrf('child'), async (req, res, next) => {
  try {
    const token = req.cookies[childCookie];
    if (token) await query("DELETE FROM sessions WHERE session_type='child' AND token_hash=$1", [tokenHash(token)]);
    res.clearCookie(childCookie, { path: '/' });
    res.clearCookie(childCsrfCookie, { path: '/' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/child/me', requireChild, (req, res) => {
  const s = req.childSession;
  res.json({ ok: true, child: { nickname: s.nickname, age_group: s.age_group, hero: s.hero, ai_enabled: Boolean(s.ai_enabled) } });
});

app.post('/api/progress', requireChild, requireCsrf('child'), async (req, res, next) => {
  try {
    const parsed = z.object({
      activity_key: z.string().regex(/^[a-z0-9_-]{2,64}$/),
      score: z.number().int().min(0).max(1_000_000),
      stars: z.number().int().min(0).max(5)
    }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'invalid_progress');
    const childId = req.childSession.child_id;
    await withContext({ childId }, async (client) => {
      await client.query(
        `INSERT INTO progress (child_id,activity_key,score,stars)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (child_id,activity_key)
         DO UPDATE SET score=GREATEST(progress.score,EXCLUDED.score), stars=GREATEST(progress.stars,EXCLUDED.stars), updated_at=NOW()`,
        [childId, parsed.data.activity_key, parsed.data.score, parsed.data.stars]
      );
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/progress', requireChild, async (req, res, next) => {
  try {
    const childId = req.childSession.child_id;
    const rows = await withContext({ childId }, async (client) => (await client.query('SELECT activity_key,score,stars,updated_at FROM progress ORDER BY updated_at DESC')).rows);
    res.json({ ok: true, progress: rows });
  } catch (err) { next(err); }
});

app.post('/api/favorites', requireChild, requireCsrf('child'), async (req, res, next) => {
  try {
    const parsed = z.object({ content_type: z.enum(['game','clip','story']), content_key: z.string().regex(/^[a-z0-9_-]{2,64}$/) }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'invalid_favorite');
    const childId = req.childSession.child_id;
    await withContext({ childId }, async (client) => {
      await client.query('INSERT INTO favorites (child_id,content_type,content_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [childId, parsed.data.content_type, parsed.data.content_key]);
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.delete('/api/favorites/:contentKey', requireChild, requireCsrf('child'), async (req, res, next) => {
  try {
    const key = String(req.params.contentKey || '');
    if (!/^[a-z0-9_-]{2,64}$/.test(key)) return jsonError(res, 400, 'invalid_favorite');
    const childId = req.childSession.child_id;
    await withContext({ childId }, async (client) => client.query('DELETE FROM favorites WHERE child_id=$1 AND content_key=$2', [childId, key]));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/favorites', requireChild, async (req, res, next) => {
  try {
    const childId = req.childSession.child_id;
    const rows = await withContext({ childId }, async (client) => (await client.query('SELECT content_type,content_key,created_at FROM favorites ORDER BY created_at DESC')).rows);
    res.json({ ok: true, favorites: rows });
  } catch (err) { next(err); }
});

app.post('/api/chat', chatLimiter, requireChild, requireCsrf('child'), async (req, res, next) => {
  try {
    const parsed = z.object({ hero: z.enum(['Lion','Taupe','Rihno']), message: z.string().min(1).max(280) }).safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, 'invalid_chat');
    const s = req.childSession;
    if (!s.ai_enabled) return jsonError(res, 403, 'ai_parental_activation_required');
    const reply = await childSafeReply({ hero: parsed.data.hero, ageGroup: s.age_group, message: parsed.data.message });
    if (!reply.available) return jsonError(res, 503, 'ai_unavailable');
    res.json({ ok: true, reply: reply.text, blocked: Boolean(reply.blocked) });
  } catch (err) { next(err); }
});

app.use('/api', (_req, res) => jsonError(res, 404, 'not_found'));

app.use((err, _req, res, _next) => {
  console.error('[api]', err?.message || err);
  if (res.headersSent) return;
  jsonError(res, 500, 'server_error');
});

setInterval(() => cleanupExpired().catch((err) => console.error('[cleanup]', err.message)), 60 * 60_000).unref();

app.listen(port, '0.0.0.0', () => {
  console.log(`[api] listening on ${port}`);
});
