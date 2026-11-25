import { formatErrorResponse } from '../../server/aiService.js';
import { getTeacherFeedbackList, verifyAdminToken } from '../../server/adminService.js';
import { ApiRequest, ApiResponse, getHeader, withApiErrorHandler } from '../_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/admin/feedback',
  formatErrorResponse,
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204);
      if (res.end) res.end();
      else res.json({});
      return;
    }

    const authHeader = getHeader(req, 'authorization') || getHeader(req, 'x-admin-token');
    if (!(await verifyAdminToken(authHeader))) {
      res.status(401).json({ error: 'Unauthorized: Invalid or missing admin token' });
      return;
    }

    if (req.method && req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    res.status(200).json(await getTeacherFeedbackList());
  }
);
