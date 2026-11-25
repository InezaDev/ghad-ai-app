import { formatErrorResponse, generateRebAssessment } from '../server/aiService.js';
import { ApiRequest, ApiResponse, parseRequestBody, withApiErrorHandler } from './_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/assessment',
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
        route: '/api/assessment',
      });
      return;
    }

    const parsedBody = parseRequestBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({
        status: 400,
        message: parsedBody.error,
        error: parsedBody.error,
        route: '/api/assessment',
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
        route: '/api/assessment',
      });
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
  }
);

