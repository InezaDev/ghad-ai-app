import { generateRebMethodology, normalizeError } from '../server/aiService.js';
import { parseRequestBody } from './_utils.js';

interface VercelReq {
  method?: string;
  body?: unknown;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (payload: unknown) => void;
  end?: () => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.status(204);
    if (res.end) res.end();
    else res.json({});
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const parsedBody = parseRequestBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({ error: parsedBody.error });
      return;
    }
    const body = parsedBody.body;
    const subject = String(body.subject || '').trim();
    const classLevel = String(body.classLevel || body.class || '').trim();
    const topic = String(body.topic || '').trim();

    if (!subject || !classLevel || !topic) {
      res.status(400).json({ error: 'Subject, class level, and topic are required.' });
      return;
    }

    const methodology = await generateRebMethodology({
      language: typeof body.language === 'string' ? body.language : undefined,
      subject,
      classLevel,
      topic,
      classSize: typeof body.classSize === 'number' ? body.classSize : Number(body.classSize) || undefined,
    });

    res.status(200).json({ methodology });
  } catch (err) {
    console.error('[GHAD AI /api/methodology]', err);
    const { status, message } = normalizeError(err);
    res.status(status).json({ error: message });
  }
}
