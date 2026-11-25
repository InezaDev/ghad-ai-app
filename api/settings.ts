import { formatErrorResponse } from '../server/aiService.js';
import { getDeveloperProfile, getSiteSettings } from '../server/adminService.js';
import { ApiRequest, ApiResponse, withApiErrorHandler } from './_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/settings',
  formatErrorResponse,
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204);
      if (res.end) res.end();
      else res.json({});
      return;
    }
    if (req.method && req.method !== 'GET') {
      res.status(405).json({
        status: 405,
        message: 'Method not allowed',
        error: 'Method not allowed',
        route: '/api/settings',
      });
      return;
    }
    const [settings, developer] = await Promise.all([
      getSiteSettings(),
      getDeveloperProfile(),
    ]);
    res.status(200).json({ settings, developer });
  }
);
