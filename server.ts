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

      const plan = await generateRebLessonPlan({
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
        existingPlan,
      });

      res.json({ plan });
    })
  );

  app.post(
    '/api/assistant',
    withApiErrorHandler<Request, Response>('/api/assistant', formatErrorResponse, async (req, res) => {
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
      });

      res.json({ reply: result.reply, sources: result.sources });
    })
  );

  app.post(
    '/api/assessment',
    withApiErrorHandler<Request, Response>('/api/assessment', formatErrorResponse, async (req, res) => {
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

      res.json({ assessment });
    })
  );

  app.post(
    '/api/methodology',
    withApiErrorHandler<Request, Response>('/api/methodology', formatErrorResponse, async (req, res) => {
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

      res.json({ methodology });
    })
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
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
