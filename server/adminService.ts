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
  title: 'Creator of GHAD AI · Educator & EdTech Developer in Rwanda',
  school: 'G.S. Saint Etienne',
  bio: 'GHAD AI is built for Rwandan educators to simplify competence-based curriculum paperwork, lesson planning, quizzes, and teaching guides in English, Kinyarwanda, French, and Kiswahili.',
  photoUrl: '',
  phone: '+250 788 123 456',
  email: 'nkurikiyineza@ghadai.rw',
  github: '',
};

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
  const updated = { ...current, ...settings };
  await kv.set('ghad:settings', updated);
  return updated;
}

export async function getDeveloperProfile(): Promise<DeveloperProfile> {
  const data = await kv.get('ghad:developer');
  if (!data || typeof data !== 'object') {
    await kv.set('ghad:developer', DEFAULT_DEVELOPER);
    return DEFAULT_DEVELOPER;
  }
  return { ...DEFAULT_DEVELOPER, ...data };
}

export async function saveDeveloperProfile(profile: Partial<DeveloperProfile>): Promise<DeveloperProfile> {
  const current = await getDeveloperProfile();
  const updated = { ...current, ...profile };
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
    // Keep last 100 logs
    const logs = await kv.lrange('ghad:logs', 0, 99);
    await kv.set('ghad:logs', logs);
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

export function verifyAdminPassword(authHeaderOrToken?: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || 'ghad_admin_2026';
  if (!authHeaderOrToken) return false;
  const token = authHeaderOrToken.replace(/^Bearer\s+/i, '').trim();
  return token === adminPassword;
}
