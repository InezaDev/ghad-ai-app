import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  ExistingLessonDraft,
  formatErrorResponse,
  generateAssistantReply,
  generateRebAssessment,
  generateRebLessonPlan,
  generateRebMethodology,
} from './server/aiService.js';
import { withApiErrorHandler } from './api/_utils.js';
import {
  checkAiMaintenanceMode,
  deleteTeacherFeedback,
  getActivityLogs,
  getAdminAuthStatus,
  getAnalyticsStats,
  getDeveloperProfile,
  getSiteSettings,
  getTeacherFeedbackList,
  issueAdminSessionToken,
  recordActivity,
  saveDeveloperProfile,
  saveSiteSettings,
  setupInitialAdminPassword,
  submitTeacherFeedback,
  verifyAdminPassword,
  verifyAdminToken,
} from './server/adminService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get(
    '/api/health',
    withApiErrorHandler<Request, Response>('/api/health', formatErrorResponse, (_req, res) => {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
      res.json({
        ok: true,
        service: 'ghad-ai',
        geminiConfigured,
        timestamp: new Date().toISOString(),
      });
    })
  );

  app.post(
    '/api/lesson',
    withApiErrorHandler<Request, Response>('/api/lesson', formatErrorResponse, async (req, res) => {
      const maintenance = await checkAiMaintenanceMode();
      if (maintenance.blocked) {
        res.status(503).json({
          status: 503,
          code: 'MAINTENANCE_MODE',
          maintenanceMode: true,
          title: maintenance.title,
          message: `${maintenance.title}. ${maintenance.message}`,
          error: `${maintenance.title}. ${maintenance.message}`,
          route: '/api/lesson',
        });
        return;
      }

      const body = req.body || {};
      const existingPlan =
        body.existingPlan && typeof body.existingPlan === 'object'
          ? (body.existingPlan as ExistingLessonDraft)
          : undefined;

      const subject = String(body.subject || existingPlan?.subject || '').trim();
      const classLevel = String(body.classLevel || body.class || existingPlan?.classLevel || '').trim();
      const topic = String(body.topic || existingPlan?.lessonTitle || '').trim();
      const unitTitle = String(body.unitTitle || existingPlan?.unitTitle || '').trim();
      const unitNo = String(body.unitNo || body.unit || existingPlan?.unitNo || '').trim();

      if (!subject || !classLevel) {
        res.status(400).json({
          status: 400,
          message: 'Subject and Class level are required.',
          error: 'Subject and Class level are required.',
          route: '/api/lesson',
        });
        return;
      }

      if (!topic && !unitTitle && !unitNo && !existingPlan) {
        res.status(400).json({
          status: 400,
          message: 'Please provide a Lesson Topic or Unit details.',
          error: 'Please provide a Lesson Topic or Unit details.',
          route: '/api/lesson',
        });
        return;
      }

      const result = await generateRebLessonPlan({
        language: body.language,
        subject,
        classLevel,
        topic,
        duration: body.duration,
        unitNo,
        unitTitle,
        lessonNo: body.lessonNo,
        learners: body.learners,
        term: body.term,
        date: body.date,
        sen: body.sen,
        schoolName: body.schoolName,
        teacherName: body.teacherName,
        extra: body.extra,
        mode: body.mode === 'complete_missing' ? 'complete_missing' : 'generate',
        confirmOverride: Boolean(body.confirmOverride),
        existingPlan,
      });

      if (result.clarificationRequired) {
        res.status(200).json({
          clarificationRequired: true,
          clarification: result.clarification,
        });
        return;
      }

      await recordActivity('lesson', subject, classLevel, body.language || 'en', `Generated lesson plan for ${subject} (${classLevel})`);
      res.json({ plan: result.plan, qualityReport: result.qualityReport });
    })
  );

  app.post(
    '/api/assistant',
    withApiErrorHandler<Request, Response>('/api/assistant', formatErrorResponse, async (req, res) => {
      const maintenance = await checkAiMaintenanceMode();
      if (maintenance.blocked) {
        res.status(503).json({
          status: 503,
          code: 'MAINTENANCE_MODE',
          maintenanceMode: true,
          title: maintenance.title,
          message: `${maintenance.title}. ${maintenance.message}`,
          error: `${maintenance.title}. ${maintenance.message}`,
          route: '/api/assistant',
        });
        return;
      }

      const body = req.body || {};
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
        language: body.language,
        message,
        history: body.history,
        useWebSearch: body.useWebSearch !== false,
      });

      await recordActivity('assistant', 'General', 'All', body.language || 'en', `AI Assistant answered query`);
      res.json({ reply: result.reply, sources: result.sources });
    })
  );

  app.post(
    '/api/assessment',
    withApiErrorHandler<Request, Response>('/api/assessment', formatErrorResponse, async (req, res) => {
      const maintenance = await checkAiMaintenanceMode();
      if (maintenance.blocked) {
        res.status(503).json({
          status: 503,
          code: 'MAINTENANCE_MODE',
          maintenanceMode: true,
          title: maintenance.title,
          message: `${maintenance.title}. ${maintenance.message}`,
          error: `${maintenance.title}. ${maintenance.message}`,
          route: '/api/assessment',
        });
        return;
      }

      const body = req.body || {};
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
        language: body.language,
        subject,
        classLevel,
        topic,
        count: body.count,
        difficulty: body.difficulty,
        type: body.type,
      });

      await recordActivity('assessment', subject, classLevel, body.language || 'en', `Generated assessment for ${subject} (${classLevel})`);
      res.json({ assessment });
    })
  );

  app.post(
    '/api/methodology',
    withApiErrorHandler<Request, Response>('/api/methodology', formatErrorResponse, async (req, res) => {
      const maintenance = await checkAiMaintenanceMode();
      if (maintenance.blocked) {
        res.status(503).json({
          status: 503,
          code: 'MAINTENANCE_MODE',
          maintenanceMode: true,
          title: maintenance.title,
          message: `${maintenance.title}. ${maintenance.message}`,
          error: `${maintenance.title}. ${maintenance.message}`,
          route: '/api/methodology',
        });
        return;
      }

      const body = req.body || {};
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
        language: body.language,
        subject,
        classLevel,
        topic,
        classSize: body.classSize,
      });

      await recordActivity('methodology', subject, classLevel, body.language || 'en', `Generated teaching methodology for ${subject} (${classLevel})`);
      res.json({ methodology });
    })
  );

  // Public settings & feedback
  app.get('/api/settings', async (_req: Request, res: Response) => {
    try {
      const settings = await getSiteSettings();
      const developer = await getDeveloperProfile();
      res.json({ settings, developer });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/feedback', async (req: Request, res: Response) => {
    try {
      const { name, email, message } = req.body || {};
      if (!message || !String(message).trim()) {
        res.status(400).json({ error: 'Feedback message is required.' });
        return;
      }
      const fb = await submitTeacherFeedback(name || '', email || '', message);
      await recordActivity('feedback', 'General', 'All', 'en', `Teacher feedback received from ${fb.name}`);
      res.json({ success: true, feedback: fb });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Admin Authentication & Endpoints
  app.get('/api/admin/auth', async (_req: Request, res: Response) => {
    try {
      res.json(await getAdminAuthStatus());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/admin/auth', async (req: Request, res: Response) => {
    try {
      const { action, password } = req.body || {};
      if (action === 'setup') {
        const result = await setupInitialAdminPassword(typeof password === 'string' ? password : '');
        if (!result.ok) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json({ success: true, token: result.token });
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
        res.json({ success: true, token });
      } else {
        res.status(401).json({ error: 'Invalid admin password' });
      }
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  const requireAdmin = async (req: Request, res: Response, next: () => void) => {
    try {
      const authHeader = req.headers.authorization || (req.headers['x-admin-token'] as string);
      if (await verifyAdminToken(authHeader)) {
        next();
      } else {
        res.status(401).json({ error: 'Unauthorized: Invalid or missing admin token' });
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized: Invalid or missing admin token' });
    }
  };

  app.get('/api/admin/settings', requireAdmin, async (_req: Request, res: Response) => {
    res.json(await getSiteSettings());
  });

  app.post('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
    const updated = await saveSiteSettings(req.body || {});
    res.json({ success: true, settings: updated });
  });

  app.get('/api/admin/stats', requireAdmin, async (_req: Request, res: Response) => {
    res.json(await getAnalyticsStats());
  });

  app.get('/api/admin/logs', requireAdmin, async (_req: Request, res: Response) => {
    res.json(await getActivityLogs());
  });

  app.get('/api/admin/feedback', requireAdmin, async (_req: Request, res: Response) => {
    res.json(await getTeacherFeedbackList());
  });

  app.delete('/api/admin/feedback/:id', requireAdmin, async (req: Request, res: Response) => {
    const success = await deleteTeacherFeedback(req.params.id);
    res.json({ success });
  });

  app.get('/api/admin/developer', requireAdmin, async (_req: Request, res: Response) => {
    res.json(await getDeveloperProfile());
  });

  app.post('/api/admin/developer', requireAdmin, async (req: Request, res: Response) => {
    const updated = await saveDeveloperProfile(req.body || {});
    res.json({ success: true, developer: updated });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    const viteDepsDir = path.resolve(__dirname, 'node_modules/.vite/deps');
    const getActiveBrowserHash = (): string | null => {
      const envClient = (
        vite as unknown as {
          environments?: { client?: { depsOptimizer?: { metadata?: { browserHash?: string } } } };
        }
      ).environments?.client;
      const memHash = envClient?.depsOptimizer?.metadata?.browserHash;
      if (typeof memHash === 'string' && memHash) return memHash;
      try {
        const raw = fs.readFileSync(path.join(viteDepsDir, '_metadata.json'), 'utf8');
        const parsed = JSON.parse(raw) as { browserHash?: string };
        return typeof parsed.browserHash === 'string' && parsed.browserHash ? parsed.browserHash : null;
      } catch {
        return null;
      }
    };

    app.use((req, res, next) => {
      const reqUrl = req.url || '/';
      const [pathname, search = ''] = reqUrl.split('?');

      // Guard /node_modules/.vite/deps/* against HTTP 504 (Outdated Optimize Dep),
      // which reverse proxies rewrite into text/html 504 error pages breaking ES module MIME checks.
      if (pathname.startsWith('/node_modules/.vite/deps/')) {
        const relFile = pathname.slice('/node_modules/.vite/deps/'.length);
        const safeRel = path.posix.normalize(relFile);
        const targetFile = path.resolve(viteDepsDir, safeRel);
        const isInsideDeps = targetFile.startsWith(viteDepsDir + path.sep);

        const params = new URLSearchParams(search);
        const reqVersion = params.get('v');
        const currentHash = getActiveBrowserHash();

        if (
          isInsideDeps &&
          currentHash &&
          reqVersion &&
          reqVersion !== currentHash &&
          fs.existsSync(targetFile)
        ) {
          params.set('v', currentHash);
          res.setHeader('Cache-Control', 'no-store');
          res.redirect(302, `${pathname}?${params.toString()}`);
          return;
        }

        const originalWriteHead = res.writeHead.bind(res) as (
          statusCode: number,
          ...args: unknown[]
        ) => typeof res;
        res.writeHead = ((statusCode: number, ...args: unknown[]) => {
          if (statusCode === 504) {
            const freshHash = getActiveBrowserHash();
            if (isInsideDeps && freshHash && freshHash !== reqVersion && fs.existsSync(targetFile)) {
              params.set('v', freshHash);
              res.setHeader('Cache-Control', 'no-store');
              res.setHeader('Location', `${pathname}?${params.toString()}`);
              return originalWriteHead(302, ...args);
            }
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            return originalWriteHead(404, ...args);
          }
          return originalWriteHead(statusCode, ...args);
        }) as typeof res.writeHead;
      }

      next();
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GHAD AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
