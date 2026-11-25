import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest, ApiResponse, buildApiErrorResponse, parseRequestBody, withApiErrorHandler } from './_utils.js';

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

test('buildApiErrorResponse and withApiErrorHandler return status, message, and error JSON', async () => {
  const mockFormat = (err: unknown) => ({
    status: 503,
    body: {
      error: 'AI service unavailable',
      status: 503,
      code: 'UNAVAILABLE',
      details: err instanceof Error ? err.message : String(err),
    },
  });

  const built = buildApiErrorResponse(new Error('Model overloaded'), mockFormat, '/api/lesson');
  assert.equal(built.status, 503);
  assert.deepEqual(built.payload, {
    status: 503,
    message: 'AI service unavailable',
    error: 'Model overloaded',
    code: 'UNAVAILABLE',
    route: '/api/lesson',
  });

  let capturedStatus = 0;
  let capturedJson: unknown = null;
  const res: ApiResponse = {
    status(code: number) {
      capturedStatus = code;
      return res;
    },
    json(payload: unknown) {
      capturedJson = payload;
    },
  };

  const wrapped = withApiErrorHandler<ApiRequest, ApiResponse>(
    '/api/assistant',
    mockFormat,
    async () => {
      throw new Error('Upstream failure');
    }
  );

  await wrapped({ method: 'POST' }, res);
  assert.equal(capturedStatus, 503);
  assert.deepEqual(capturedJson, {
    status: 503,
    message: 'AI service unavailable',
    error: 'Upstream failure',
    code: 'UNAVAILABLE',
    route: '/api/assistant',
  });
});

