import { formatErrorResponse, generateRebMethodology } from '../server/aiService.js';
import { ApiRequest, ApiResponse, parseRequestBody, withApiErrorHandler } from './_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/methodology',
  formatErrorResponse,
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204);
      if (res.end) res.end();
      else res.json({});
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({
        status: 405,
        message: 'Method not allowed',
        error: 'Method not allowed',
        route: '/api/methodology',
      });
      return;
    }

    const parsedBody = parseRequestBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({
        status: 400,
        message: parsedBody.error,
        error: parsedBody.error,
        route: '/api/methodology',
      });
      return;
    }
    const body = parsedBody.body;
    const subject = String(body.subject || '').trim();
    const classLevel = String(body.classLevel || body.class || '').trim();
    const topic = String(body.topic || '').trim();

    if (!subject || !classLevel || !topic) {
      res.status(400).json({
        status: 400,
        message: 'Subject, class level, and topic are required.',
        error: 'Subject, class level, and topic are required.',
        route: '/api/methodology',
      });
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
  }
);

