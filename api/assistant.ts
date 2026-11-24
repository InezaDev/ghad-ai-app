import { generateAssistantReply, normalizeError } from '../server/aiService';

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
    const { status, message } = normalizeError(err);
    res.status(status).json({ error: message });
  }
}
