import crypto from 'crypto';
import { kv } from './redisClient.js';

export interface SiteSettings {
  bannerText: string;
  bannerActive: boolean;
  maintenanceMode: boolean;
  toolLesson: boolean;
  toolAssistant: boolean;
  toolAssessment: boolean;
  toolMethodology: boolean;
}

export interface DeveloperProfile {
  name: string;
  title: string;
  school: string;
  bio: string;
  photoUrl: string;
  phone: string;
  email: string;
  github: string;
  localizedTitles?: Partial<Record<'en' | 'rw' | 'fr' | 'sw', string>>;
  localizedBios?: Partial<Record<'en' | 'rw' | 'fr' | 'sw', string>>;
}

export interface TeacherFeedback {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  tool: string;
  subject?: string;
  classLevel?: string;
  language?: string;
  summary: string;
  timestamp: string;
}

export interface AdminAuthRecord {
  salt: string;
  hash: string;
  createdAt: string;
}

export const MAINTENANCE_TITLE = 'GHAD AI Is Temporarily Under Maintenance';
export const MAINTENANCE_MESSAGE =
  'We are currently improving GHAD AI to provide you with a better experience. AI generation services are temporarily unavailable. Please check back soon. Thank you for your patience.';

const DEFAULT_SETTINGS: SiteSettings = {
  bannerText: '🇷🇼 Welcome to GHAD AI — Official Rwanda REB CBC Teaching Companion (English, Kinyarwanda, Français, Kiswahili)',
  bannerActive: true,
  maintenanceMode: false,
  toolLesson: true,
  toolAssistant: true,
  toolAssessment: true,
  toolMethodology: true,
};

const DEFAULT_DEVELOPER: DeveloperProfile = {
  name: 'Nkurikiyineza Ghad',
  title: 'Student-Teacher | Social Studies Education | Creator of GHAD AI',
  school: 'TTC Muhanga',
  bio: 'I am a passionate Year 3 student at TTC Muhanga, pursuing Social Studies Education (SSE), with a strong interest in teaching, educational innovation, and technology.\n\nAs the creator of GHAD AI, I am committed to transforming education through digital solutions that help teachers simplify lesson planning, competence-based curriculum documentation, quizzes, and teaching resources in English, Kinyarwanda, French, and Kiswahili.\n\nMy interests include curriculum development, learner-centred teaching, educational research, assessment, and digital learning.\n\nI am open to job opportunities, internships, educational projects, volunteering, and professional collaborations where I can apply my skills, gain experience, and make a positive contribution.\n\nMy mission: Empowering educators, inspiring learners, and transforming education through innovation.',
  photoUrl: '',
  phone: '+250 783262573',
  email: 'inezaghad250@gmail.com',
  github: '',
};

const ADMIN_AUTH_KV_KEY = 'ghad:admin_auth';
const ADMIN_SESSION_SECRET_KV_KEY = 'ghad:admin_session_secret';
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
let ephemeralSessionSecret: Buffer | null = null;

export async function getSiteSettings(): Promise<SiteSettings> {
  const data = await kv.get('ghad:settings');
  if (!data || typeof data !== 'object') {
    await kv.set('ghad:settings', DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...data };
}

export async function saveSiteSettings(settings: Partial<SiteSettings>): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const sanitized: Partial<SiteSettings> = {};
  if (typeof settings.bannerText === 'string') sanitized.bannerText = settings.bannerText;
  if (typeof settings.bannerActive === 'boolean') sanitized.bannerActive = settings.bannerActive;
  if (typeof settings.maintenanceMode === 'boolean') sanitized.maintenanceMode = settings.maintenanceMode;
  if (typeof settings.toolLesson === 'boolean') sanitized.toolLesson = settings.toolLesson;
  if (typeof settings.toolAssistant === 'boolean') sanitized.toolAssistant = settings.toolAssistant;
  if (typeof settings.toolAssessment === 'boolean') sanitized.toolAssessment = settings.toolAssessment;
  if (typeof settings.toolMethodology === 'boolean') sanitized.toolMethodology = settings.toolMethodology;
  const updated = { ...current, ...sanitized };
  await kv.set('ghad:settings', updated);
  return updated;
}

export async function checkAiMaintenanceMode(): Promise<{
  blocked: boolean;
  title: string;
  message: string;
}> {
  const settings = await getSiteSettings();
  return {
    blocked: Boolean(settings.maintenanceMode),
    title: MAINTENANCE_TITLE,
    message: MAINTENANCE_MESSAGE,
  };
}

export async function getDeveloperProfile(): Promise<DeveloperProfile> {
  const data = await kv.get('ghad:developer');
  if (!data || typeof data !== 'object') {
    await kv.set('ghad:developer', DEFAULT_DEVELOPER);
    return DEFAULT_DEVELOPER;
  }
  const record = data as Partial<DeveloperProfile>;
  if (
    (record.email === 'nkurikiyineza@ghadai.rw' || record.email === 'support@ghadai.rw') &&
    (!record.school || record.school === 'G.S. Saint Etienne')
  ) {
    await kv.set('ghad:developer', DEFAULT_DEVELOPER);
    return DEFAULT_DEVELOPER;
  }
  return { ...DEFAULT_DEVELOPER, ...record };
}

export async function saveDeveloperProfile(profile: Partial<DeveloperProfile>): Promise<DeveloperProfile> {
  const current = await getDeveloperProfile();
  const sanitized: Partial<DeveloperProfile> = {};
  for (const key of ['name', 'title', 'school', 'bio', 'photoUrl', 'phone', 'email', 'github'] as const) {
    if (typeof profile[key] === 'string') {
      sanitized[key] = profile[key];
    }
  }
  const sanitizeLocaleMap = (raw: unknown): Partial<Record<'en' | 'rw' | 'fr' | 'sw', string>> | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const out: Partial<Record<'en' | 'rw' | 'fr' | 'sw', string>> = {};
    for (const l of ['en', 'rw', 'fr', 'sw'] as const) {
      const val = (raw as Record<string, unknown>)[l];
      if (typeof val === 'string') {
        out[l] = val;
      }
    }
    return out;
  };
  const localizedTitles = sanitizeLocaleMap(profile.localizedTitles);
  if (localizedTitles) {
    sanitized.localizedTitles = { ...(current.localizedTitles || {}), ...localizedTitles };
  }
  const localizedBios = sanitizeLocaleMap(profile.localizedBios);
  if (localizedBios) {
    sanitized.localizedBios = { ...(current.localizedBios || {}), ...localizedBios };
  }
  const updated = { ...current, ...sanitized };
  await kv.set('ghad:developer', updated);
  return updated;
}

export async function recordActivity(tool: string, subject?: string, classLevel?: string, language?: string, summary?: string) {
  try {
    await kv.hincrby('ghad:stats', 'total_requests', 1);
    await kv.hincrby('ghad:stats', `${tool}_count`, 1);
    if (subject) await kv.hincrby('ghad:stats', `subj_${subject.replace(/[^a-zA-Z0-9]/g, '_')}`, 1);
    if (classLevel) await kv.hincrby('ghad:stats', `class_${classLevel}`, 1);
    if (language) await kv.hincrby('ghad:stats', `lang_${language}`, 1);

    const logEntry: ActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool,
      subject: subject || 'General',
      classLevel: classLevel || 'All',
      language: language || 'en',
      summary: summary || `${tool} generated successfully`,
      timestamp: new Date().toISOString(),
    };

    await kv.lpush('ghad:logs', logEntry);
    await kv.ltrim('ghad:logs', 0, 99);
  } catch (err) {
    console.warn('[GHAD AI KV] Failed to record activity log:', err);
  }
}

export async function getAnalyticsStats(): Promise<Record<string, number>> {
  const stats = await kv.hgetall('ghad:stats');
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    result[k] = Number(v) || 0;
  }
  return result;
}

export async function getActivityLogs(): Promise<ActivityLog[]> {
  const logs = await kv.lrange('ghad:logs', 0, 99);
  return Array.isArray(logs) ? logs : [];
}

export async function submitTeacherFeedback(name: string, email: string, message: string): Promise<TeacherFeedback> {
  const feedback: TeacherFeedback = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Anonymous Teacher',
    email: email.trim() || 'teacher@school.rw',
    message: message.trim(),
    createdAt: new Date().toISOString(),
  };
  await kv.lpush('ghad:feedback', feedback);
  return feedback;
}

export async function getTeacherFeedbackList(): Promise<TeacherFeedback[]> {
  const list = await kv.lrange('ghad:feedback', 0, 199);
  return Array.isArray(list) ? list : [];
}

export async function deleteTeacherFeedback(id: string): Promise<boolean> {
  const list = await getTeacherFeedbackList();
  const target = list.find((item) => item.id === id);
  if (!target) return false;
  await kv.lrem('ghad:feedback', 1, target);
  return true;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function hashPasswordScrypt(password: string, saltHex: string): Buffer {
  return crypto.scryptSync(password, saltHex, 64);
}

async function getSessionSigningKey(): Promise<Buffer> {
  const explicitSecret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (explicitSecret) {
    return crypto.createHash('sha256').update(explicitSecret).digest();
  }
  const envPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (envPass) {
    return crypto.createHmac('sha256', envPass).update('ghad:admin-session-key:v1').digest();
  }
  if (ephemeralSessionSecret) {
    return ephemeralSessionSecret;
  }
  const storedHex = await kv.get(ADMIN_SESSION_SECRET_KV_KEY);
  if (typeof storedHex === 'string' && storedHex.length >= 64) {
    ephemeralSessionSecret = Buffer.from(storedHex, 'hex');
    return ephemeralSessionSecret;
  }
  const generated = crypto.randomBytes(32);
  await kv.set(ADMIN_SESSION_SECRET_KV_KEY, generated.toString('hex'));
  ephemeralSessionSecret = generated;
  return ephemeralSessionSecret;
}

export async function getAdminAuthStatus(): Promise<{
  configured: boolean;
  source: 'env' | 'kv' | 'unconfigured';
}> {
  if ((process.env.ADMIN_PASSWORD || '').trim()) {
    return { configured: true, source: 'env' };
  }
  const stored = (await kv.get(ADMIN_AUTH_KV_KEY)) as Partial<AdminAuthRecord> | null;
  if (stored && typeof stored.hash === 'string' && typeof stored.salt === 'string') {
    return { configured: true, source: 'kv' };
  }
  return { configured: false, source: 'unconfigured' };
}

export async function setupInitialAdminPassword(password: string): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  token?: string;
}> {
  const clean = typeof password === 'string' ? password.trim() : '';
  if (clean.length < 8) {
    return { ok: false, status: 400, error: 'Administrator password must be at least 8 characters long.' };
  }
  const authStatus = await getAdminAuthStatus();
  if (authStatus.configured) {
    return { ok: false, status: 409, error: 'Administrator password is already configured. Please sign in.' };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPasswordScrypt(clean, salt).toString('hex');
  const record: AdminAuthRecord = {
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  await kv.set(ADMIN_AUTH_KV_KEY, record);
  const token = await issueAdminSessionToken();
  return { ok: true, status: 200, token };
}

export async function verifyAdminPassword(passwordInput: unknown): Promise<boolean> {
  if (typeof passwordInput !== 'string' || !passwordInput) return false;

  const envPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (envPass) {
    return timingSafeEqualStrings(passwordInput, envPass);
  }

  const stored = (await kv.get(ADMIN_AUTH_KV_KEY)) as Partial<AdminAuthRecord> | null;
  if (!stored || typeof stored.salt !== 'string' || typeof stored.hash !== 'string') {
    return false;
  }

  try {
    const candidate = hashPasswordScrypt(passwordInput, stored.salt);
    const expected = Buffer.from(stored.hash, 'hex');
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export async function issueAdminSessionToken(): Promise<string> {
  const key = await getSessionSigningKey();
  const payload = {
    sub: 'admin',
    iat: Date.now(),
    exp: Date.now() + ADMIN_TOKEN_TTL_MS,
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sigB64 = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

export async function verifyAdminToken(authHeaderOrToken?: string): Promise<boolean> {
  if (!authHeaderOrToken || typeof authHeaderOrToken !== 'string') return false;
  const token = authHeaderOrToken.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;

  try {
    const key = await getSessionSigningKey();
    const expectedSigB64 = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
    if (!timingSafeEqualStrings(sigB64, expectedSigB64)) return false;

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { sub?: string; exp?: number };
    if (payload.sub !== 'admin') return false;
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
