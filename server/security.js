import crypto from 'node:crypto';
import argon2 from 'argon2';

const tokenPepper = process.env.SESSION_PEPPER || '';
const pinPepper = process.env.PIN_PEPPER || tokenPepper;
const familyAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(`${token}:${tokenPepper}`).digest('hex');
}

export function familyCode() {
  let out = '';
  for (let i = 0; i < 8; i += 1) out += familyAlphabet[crypto.randomInt(0, familyAlphabet.length)];
  return out;
}

export function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

export function normalizeFamilyCode(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function normalizeNickname(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

export function nicknameIsSafe(value) {
  const nickname = normalizeNickname(value);
  return nickname.length >= 2 && nickname.length <= 24 && /^[\p{L}\p{N}_ -]+$/u.test(nickname);
}

export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1
  });
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function hashPin(pin) {
  return argon2.hash(`${pin}:${pinPepper}`, {
    type: argon2.argon2id,
    memoryCost: 32_768,
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyPin(hash, pin) {
  try {
    return await argon2.verify(hash, `${pin}:${pinPepper}`);
  } catch {
    return false;
  }
}

export function containsLikelyPII(text = '') {
  const value = String(text);
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const phone = /(?:\+?\d[\d .()\-]{7,}\d)/;
  const address = /\b\d{1,4}\s+[\p{L}.'’-]{2,}(?:\s+[\p{L}.'’-]{2,}){0,4}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|route|chemin|street|road|avenue|calle|avenida)\b/iu;
  return email.test(value) || phone.test(value) || address.test(value);
}

export function stripLinks(text = '') {
  return String(text).replace(/https?:\/\/\S+/gi, '[lien retiré]').slice(0, 900);
}

export function constantTimeEqual(a = '', b = '') {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
