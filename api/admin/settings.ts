import { formatErrorResponse } from '../../server/aiService.js';
import { getSiteSettings, saveSiteSettings, SiteSettings, verifyAdminToken } from '../../server/adminService.js';
import { ApiRequest, ApiResponse, getHeader, parseRequestBody, withApiErrorHandler } from '../_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/admin/settings',
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

    if (req.method === 'GET') {
      res.status(200).json(await getSiteSettings());
      return;
    }

    if (req.method === 'POST') {
      const parsed = parseRequestBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const updated = await saveSiteSettings(parsed.body as Partial<SiteSettings>);
      res.status(200).json({ success: true, settings: updated });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  }
);
