interface VercelReq {
  method?: string;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (payload: unknown) => void;
}

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  res.status(200).json({
    ok: true,
    service: 'ghad-ai',
    geminiConfigured,
    timestamp: new Date().toISOString(),
  });
}
