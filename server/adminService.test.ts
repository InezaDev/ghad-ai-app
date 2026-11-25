import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kv, normalizeRedisRestUrl, sanitizeRedisEnvValue } from './redisClient.js';
import {
  MAINTENANCE_MESSAGE,
  MAINTENANCE_TITLE,
  checkAiMaintenanceMode,
  getAdminAuthStatus,
  getSiteSettings,
  issueAdminSessionToken,
  saveSiteSettings,
  setupInitialAdminPassword,
  verifyAdminPassword,
  verifyAdminToken,
} from './adminService.js';
import lessonHandler from '../api/lesson.js';
import assessmentHandler from '../api/assessment.js';
import assistantHandler from '../api/assistant.js';
import methodologyHandler from '../api/methodology.js';

function createMockRes() {
  let statusCode = 200;
  let body: unknown = null;
  const headers: Record<string, string> = {};
  const res = {
    setHeader(name: string, val: string) {
      headers[name] = val;
      return res;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
    end() {
      return res;
    },
    getStatus: () => statusCode,
    getBody: () => body as Record<string, unknown> | null,
  };
  return res;
}

test('admin auth setup, scrypt password verification, and HMAC session tokens', async () => {
  const prevPassword = process.env.ADMIN_PASSWORD;
  const prevSecret = process.env.ADMIN_SESSION_SECRET;
  const prevAuth = await kv.get('ghad:admin_auth');
  const prevSessionSecret = await kv.get('ghad:admin_session_secret');

  try {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_SESSION_SECRET;
    await kv.set('ghad:admin_auth', null);

    const initialStatus = await getAdminAuthStatus();
    assert.equal(initialStatus.configured, false);
    assert.equal(initialStatus.source, 'unconfigured');

    const tooShort = await setupInitialAdminPassword('1234567');
    assert.equal(tooShort.ok, false);
    assert.equal(tooShort.status, 400);

    const setupOk = await setupInitialAdminPassword('RwandaCBC#2026');
    assert.equal(setupOk.ok, true);
    assert.equal(setupOk.status, 200);
    assert.ok(setupOk.token && setupOk.token.includes('.'));
    assert.notEqual(setupOk.token, 'RwandaCBC#2026');

    const duplicateSetup = await setupInitialAdminPassword('AnotherPass#2026');
    assert.equal(duplicateSetup.ok, false);
    assert.equal(duplicateSetup.status, 409);

    assert.equal(await verifyAdminPassword('RwandaCBC#2026'), true);
    assert.equal(await verifyAdminPassword('wrong-password'), false);

    const token = await issueAdminSessionToken();
    assert.equal(await verifyAdminToken(`Bearer ${token}`), true);
    assert.equal(await verifyAdminToken(`Bearer ${token}tampered`), false);
    assert.equal(await verifyAdminToken('Bearer invalid'), false);
    assert.equal(await verifyAdminToken(undefined), false);
  } finally {
    if (prevPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = prevPassword;
    if (prevSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = prevSecret;
    await kv.set('ghad:admin_auth', prevAuth ?? null);
    if (prevSessionSecret !== null && prevSessionSecret !== undefined) {
      await kv.set('ghad:admin_session_secret', prevSessionSecret);
    }
  }
});

test('maintenance mode blocks all 4 AI API routes with 503 and exact copy, then unblocks cleanly', async () => {
  const prevSettings = await getSiteSettings();
  try {
    await saveSiteSettings({ maintenanceMode: true });
    const status = await checkAiMaintenanceMode();
    assert.equal(status.blocked, true);
    assert.equal(status.title, MAINTENANCE_TITLE);
    assert.equal(status.message, MAINTENANCE_MESSAGE);

    const handlers = [
      { name: 'lesson', fn: lessonHandler, body: { subject: 'Biology', classLevel: 'S2' } },
      { name: 'assessment', fn: assessmentHandler, body: { subject: 'Biology', classLevel: 'S2' } },
      { name: 'assistant', fn: assistantHandler, body: { message: 'Explain CBC' } },
      { name: 'methodology', fn: methodologyHandler, body: { topic: 'Photosynthesis', classLevel: 'S2' } },
    ];

    for (const h of handlers) {
      const res = createMockRes();
      await h.fn({ method: 'POST', body: h.body, headers: {} }, res);
      assert.equal(res.getStatus(), 503, `${h.name} should return 503 during maintenance`);
      const payload = res.getBody();
      assert.equal(payload?.code, 'MAINTENANCE_MODE');
      assert.equal(payload?.maintenanceMode, true);
      assert.equal(payload?.title, MAINTENANCE_TITLE);
      assert.equal(payload?.message, `${MAINTENANCE_TITLE}. ${MAINTENANCE_MESSAGE}`);
    }

    await saveSiteSettings({ maintenanceMode: false });
    const afterStatus = await checkAiMaintenanceMode();
    assert.equal(afterStatus.blocked, false);
  } finally {
    await saveSiteSettings(prevSettings);
  }
});

test('sample and fallback teacherSelfEvaluation contain no blank ___ placeholders', () => {
  const plannerSrc = fs.readFileSync(path.resolve('src/components/LessonPlannerView.tsx'), 'utf8');
  const aiSrc = fs.readFileSync(path.resolve('server/aiService.ts'), 'utf8');
  const evalLines = aiSrc.split('\n').filter((line) => line.trim().startsWith('eval:'));

  assert.equal(/_{2,}%|_{2,}\s*students/i.test(plannerSrc), false);
  assert.ok(evalLines.length >= 4);
  for (const line of evalLines) {
    assert.equal(/_{2,}/.test(line), false, `Fallback eval should not contain blank underscores: ${line}`);
  }
});

test('normalizeRedisRestUrl and sanitizeRedisEnvValue strip accidental KEY= prefixes and quotes', () => {
  assert.equal(
    normalizeRedisRestUrl('KV_REST_API_URL=https://cunning-salmon-71530.upstash.io'),
    'https://cunning-salmon-71530.upstash.io'
  );
  assert.equal(
    normalizeRedisRestUrl('KV_REST_API_URL="https://cunning-salmon-71530.upstash.io"'),
    'https://cunning-salmon-71530.upstash.io'
  );
  assert.equal(
    normalizeRedisRestUrl('"UPSTASH_REDIS_REST_URL=https://example.upstash.io"'),
    'https://example.upstash.io'
  );
  assert.equal(
    normalizeRedisRestUrl('https://cunning-salmon-71530.upstash.io'),
    'https://cunning-salmon-71530.upstash.io'
  );
  assert.equal(normalizeRedisRestUrl('not-a-valid-url'), undefined);
  assert.equal(
    sanitizeRedisEnvValue('KV_REST_API_TOKEN="secret-token-value"', ['KV_REST_API_TOKEN']),
    'secret-token-value'
  );
});

test('kv.lpush + kv.ltrim + kv.lrange keep list bounded without WRONGTYPE conversion', async () => {
  const testKey = 'ghad:test_logs_list_check';
  await kv.set(testKey, null);
  // Reset memory key to list cleanly by trimming after initial push
  for (let i = 1; i <= 105; i++) {
    await kv.lpush(testKey, { seq: i });
    await kv.ltrim(testKey, 0, 99);
  }
  const items = await kv.lrange(testKey, 0, 99);
  assert.equal(Array.isArray(items), true);
  assert.equal(items.length, 100);
  assert.deepEqual(items[0], { seq: 105 });
  assert.deepEqual(items[99], { seq: 6 });
});
