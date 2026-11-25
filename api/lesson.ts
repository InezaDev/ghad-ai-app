import { ExistingLessonDraft, formatErrorResponse, generateRebLessonPlan } from '../server/aiService.js';
import { ApiRequest, ApiResponse, parseRequestBody, withApiErrorHandler } from './_utils.js';

export default withApiErrorHandler<ApiRequest, ApiResponse>(
  '/api/lesson',
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
        route: '/api/lesson',
      });
      return;
    }

    const parsedBody = parseRequestBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({
        status: 400,
        message: parsedBody.error,
        error: parsedBody.error,
        route: '/api/lesson',
      });
      return;
    }
    const body = parsedBody.body;
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
      language: typeof body.language === 'string' ? body.language : undefined,
      subject,
      classLevel,
      topic,
      duration: typeof body.duration === 'number' ? body.duration : Number(body.duration) || undefined,
      unitNo,
      unitTitle,
      lessonNo: typeof body.lessonNo === 'string' ? body.lessonNo : undefined,
      learners: typeof body.learners === 'number' ? body.learners : Number(body.learners) || undefined,
      term: typeof body.term === 'string' ? body.term : undefined,
      date: typeof body.date === 'string' ? body.date : undefined,
      sen: typeof body.sen === 'string' ? body.sen : undefined,
      schoolName: typeof body.schoolName === 'string' ? body.schoolName : undefined,
      teacherName: typeof body.teacherName === 'string' ? body.teacherName : undefined,
      extra: typeof body.extra === 'string' ? body.extra : undefined,
      mode: body.mode === 'complete_missing' ? 'complete_missing' : 'generate',
      existingPlan,
    });

    res.status(200).json({ plan });
  }
);

