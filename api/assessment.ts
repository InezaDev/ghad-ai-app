import { generateRebAssessment, normalizeError } from '../server/aiService';

interface VercelReq {
  method?: string;
  body?: Record<string, unknown>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (payload: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const subject = String(body.subject || '').trim();
    const classLevel = String(body.classLevel || body.class || '').trim();
    const topic = String(body.topic || '').trim();

    if (!subject || !classLevel || !topic) {
      res.status(400).json({ error: 'Subject, class level, and topic are required.' });
      return;
    }

    const assessment = await generateRebAssessment({
      language: typeof body.language === 'string' ? body.language : undefined,
      subject,
      classLevel,
      topic,
      count: typeof body.count === 'number' ? body.count : Number(body.count) || undefined,
      difficulty: typeof body.difficulty === 'string' ? body.difficulty : undefined,
      type: typeof body.type === 'string' ? body.type : undefined,
    });

    res.status(200).json({ assessment });
  } catch (err) {
    const { status, message } = normalizeError(err);
    res.status(status).json({ error: message });
  }
}
