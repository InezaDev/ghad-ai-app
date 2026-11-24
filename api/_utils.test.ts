import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestBody } from './_utils.js';

test('parseRequestBody handles plain object, JSON string, Buffer, and empty values', () => {
  assert.deepEqual(parseRequestBody(undefined), { ok: true, body: {} });
  assert.deepEqual(parseRequestBody(''), { ok: true, body: {} });
  assert.deepEqual(parseRequestBody({ subject: 'Biology', classLevel: 'S2' }), {
    ok: true,
    body: { subject: 'Biology', classLevel: 'S2' },
  });
  assert.deepEqual(parseRequestBody('{"message":"Hello"}'), {
    ok: true,
    body: { message: 'Hello' },
  });
  assert.deepEqual(parseRequestBody(Buffer.from('{"topic":"Fractions"}', 'utf8')), {
    ok: true,
    body: { topic: 'Fractions' },
  });
});

test('parseRequestBody rejects malformed JSON and non-object payloads cleanly', () => {
  const badJson = parseRequestBody('{not-valid');
  assert.equal(badJson.ok, false);

  const arrayPayload = parseRequestBody('[1, 2, 3]');
  assert.equal(arrayPayload.ok, false);
});
