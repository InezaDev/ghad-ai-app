import { formatErrorResponse } from '../server/aiService.js';
import { ApiRequest, ApiResponse, withApiErrorHandler } from './_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/health',
  formatErrorResponse,
  (req, res) => {
    if (req.method && req.method !== 'GET') {
      res.status(405).json({
        status: 405,
        message: 'Method not allowed',
        error: 'Method not allowed',
        route: '/api/health',
      });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
    res.status(200).json({
      ok: true,
      service: 'ghad-ai',
      geminiConfigured,
      timestamp: new Date().toISOString(),
    });
  }
);

