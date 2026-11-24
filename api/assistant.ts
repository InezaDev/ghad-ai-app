import { generateAssistantReply, normalizeError } from '../server/aiService.js';
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
    const message = String(body.message || '').trim();
    if (!message) {
      res.status(400).json({ error: 'Please enter a question or message.' });
      return;
    }

    const result = await generateAssistantReply({
      language: typeof body.language === 'string' ? body.language : undefined,
      message,
      history: Array.isArray(body.history)
        ? (body.history as Array<{ role: string; text: string }>)
        : undefined,
    });

    res.status(200).json({ reply: result.reply, sources: result.sources });
  } catch (err) {
    console.error('[GHAD AI /api/assistant]', err);
    const { status, message } = normalizeError(err);
    res.status(status).json({ error: message });
  }
}
