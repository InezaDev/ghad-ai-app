import { formatErrorResponse } from '../../server/aiService.js';
import {
  getAdminAuthStatus,
  issueAdminSessionToken,
  setupInitialAdminPassword,
  verifyAdminPassword,
} from '../../server/adminService.js';
import { ApiRequest, ApiResponse, parseRequestBody, withApiErrorHandler } from '../_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/admin/auth',
  formatErrorResponse,
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204);
      if (res.end) res.end();
      else res.json({});
      return;
    }

    if (req.method === 'GET') {
      res.status(200).json(await getAdminAuthStatus());
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const parsed = parseRequestBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const action = typeof parsed.body.action === 'string' ? parsed.body.action : '';
    const password = typeof parsed.body.password === 'string' ? parsed.body.password : '';

    if (action === 'setup') {
      const result = await setupInitialAdminPassword(password);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(200).json({ success: true, token: result.token });
      return;
    }

    const authStatus = await getAdminAuthStatus();
    if (!authStatus.configured) {
      res.status(403).json({
        error: 'Administrator password has not been set up yet.',
        needsSetup: true,
      });
      return;
    }

    if (await verifyAdminPassword(password)) {
      const token = await issueAdminSessionToken();
      res.status(200).json({
        success: true,
        token,
      });
    } else {
      res.status(401).json({ error: 'Invalid admin password' });
    }
  }
);
