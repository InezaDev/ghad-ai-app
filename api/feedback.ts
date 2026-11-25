import { formatErrorResponse } from '../server/aiService.js';
import { recordActivity, submitTeacherFeedback } from '../server/adminService.js';
import { ApiRequest, ApiResponse, parseRequestBody, withApiErrorHandler } from './_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/feedback',
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
        route: '/api/feedback',
      });
      return;
    }

    const parsed = parseRequestBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { name, email, message } = parsed.body;
    if (!message || !String(message).trim()) {
      res.status(400).json({ error: 'Feedback message is required.' });
      return;
    }

    const fb = await submitTeacherFeedback(
      typeof name === 'string' ? name : '',
      typeof email === 'string' ? email : '',
      String(message)
    );
    await recordActivity('feedback', 'General', 'All', 'en', `Teacher feedback received from ${fb.name}`);
    res.status(200).json({ success: true, feedback: fb });
  }
);
