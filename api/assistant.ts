import { formatErrorResponse, generateAssistantReply } from '../server/aiService.js';
import { ApiRequest, ApiResponse, parseRequestBody, withApiErrorHandler } from './_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/assistant',
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
        route: '/api/assistant',
      });
      return;
    }

    const parsedBody = parseRequestBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({
        status: 400,
        message: parsedBody.error,
        error: parsedBody.error,
        route: '/api/assistant',
      });
      return;
    }
    const body = parsedBody.body;
    const message = String(body.message || '').trim();
    if (!message) {
      res.status(400).json({
        status: 400,
        message: 'Please enter a question or message.',
        error: 'Please enter a question or message.',
        route: '/api/assistant',
      });
      return;
    }

    const result = await generateAssistantReply({
      language: typeof body.language === 'string' ? body.language : undefined,
      message,
      history: Array.isArray(body.history)
        ? (body.history as Array<{ role: string; text: string }>)
        : undefined,
      useWebSearch: body.useWebSearch !== false,
    });

    res.status(200).json({ reply: result.reply, sources: result.sources });
  }
);

