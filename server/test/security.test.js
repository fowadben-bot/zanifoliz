import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFamilyCode, normalizeNickname, nicknameIsSafe, containsLikelyPII, stripLinks } from '../security.js';

test('normalizes family code', () => {
  assert.equal(normalizeFamilyCode(' ab-12 cd '), 'AB12CD');
});

test('accepts safe pseudonyms and rejects punctuation-heavy values', () => {
  assert.equal(normalizeNickname('  Super   Lion  '), 'Super Lion');
  assert.equal(nicknameIsSafe('Super-Lion_7'), true);
  assert.equal(nicknameIsSafe('<script>'), false);
});

test('detects likely personal information', () => {
  assert.equal(containsLikelyPII('mon email est enfant@example.com'), true);
  assert.equal(containsLikelyPII('appelle moi au 06 12 34 56 78'), true);
  assert.equal(containsLikelyPII('combien font 7 + 4 ?'), false);
});

test('removes external links from AI output', () => {
  assert.equal(stripLinks('Va sur https://example.com/test maintenant'), 'Va sur [lien retiré] maintenant');
});
