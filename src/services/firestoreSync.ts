import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ChatThread,
  Lang,
  LessonPlanData,
  SavedAssessment,
  SavedMethodology,
  SavedPlan,
  TeacherProfile,
  ThemeMode,
} from '../types/ghad';

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}_${Date.now()}`;
}

function clampStr(val: unknown, maxLen: number): string {
  return String(val ?? '').slice(0, maxLen);
}

function normalizeLang(val: unknown): Lang {
  return val === 'rw' || val === 'fr' || val === 'sw' ? val : 'en';
}

function normalizeTheme(val: unknown): ThemeMode {
  return val === 'light' || val === 'dark' ? val : 'auto';
}

function normalizeTerm(val: unknown): 'Term 1' | 'Term 2' | 'Term 3' {
  if (val === 'Term 2' || val === 'Term 3') return val;
  return 'Term 1';
}

function sanitizePlanContent(plan: LessonPlanData): LessonPlanData {
  const stages = Array.isArray(plan.stages) ? plan.stages.slice(0, 15) : [];
  const durationMinutes = Math.max(1, Math.min(360, Math.round(Number(plan.durationMinutes) || 40)));

  return {
    schoolName: clampStr(plan.schoolName, 160),
    teacherName: clampStr(plan.teacherName, 120),
    term: clampStr(plan.term || 'Term 1', 40),
    date: clampStr(plan.date, 40),
    subject: clampStr(plan.subject, 120),
    classLevel: clampStr(plan.classLevel, 40),
    unitNo: clampStr(plan.unitNo, 40),
    lessonNo: clampStr(plan.lessonNo, 40),
    durationMinutes,
    classSize: clampStr(plan.classSize, 40),
    sen: clampStr(plan.sen, 1000),
    unitTitle: clampStr(plan.unitTitle, 500),
    keyUnitCompetence: clampStr(plan.keyUnitCompetence, 2000),
    lessonTitle: clampStr(plan.lessonTitle, 500),
    instructionalObjective: clampStr(plan.instructionalObjective, 2000),
    planLocation: clampStr(plan.planLocation, 200),
    learningMaterials: clampStr(plan.learningMaterials, 2000),
    references: clampStr(plan.references, 2000),
    activityOverview: clampStr(plan.activityOverview, 3000),
    stages: stages.map((st, idx) => ({
      id: sanitizeId(st?.id || `stage_${idx}`, 'stage'),
      stageType:
        st?.stageType === 'intro' || st?.stageType === 'conclusion' ? st.stageType : 'development',
      stageName: clampStr(st?.stageName || 'Development', 120),
      timingMinutes: Math.max(1, Math.min(360, Math.round(Number(st?.timingMinutes) || 5))),
      teacherActivities: clampStr(st?.teacherActivities, 3000),
      learnerActivities: clampStr(st?.learnerActivities, 3000),
      competencesAndIssues: clampStr(st?.competencesAndIssues, 2000),
      ...(typeof st?.observations === 'string' && st.observations.trim()
        ? { observations: clampStr(st.observations, 1500) }
        : {}),
    })),
    ...(typeof plan.assessmentCriteria === 'string' && plan.assessmentCriteria.trim()
      ? { assessmentCriteria: clampStr(plan.assessmentCriteria, 2000) }
      : {}),
    ...(typeof plan.homework === 'string' && plan.homework.trim()
      ? { homework: clampStr(plan.homework, 2000) }
      : {}),
    teacherSelfEvaluation: clampStr(plan.teacherSelfEvaluation, 2000),
  };
}

export async function ensureUserAccountDoc(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const displayName = clampStr(user.displayName || user.email?.split('@')[0] || 'Teacher', 120);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (snap.data()?.displayName !== displayName) {
      await updateDoc(userRef, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function saveProfileToCloud(
  user: User,
  profile: TeacherProfile,
  lang: Lang,
  theme: ThemeMode
): Promise<void> {
  if (!user.emailVerified) return;
  await ensureUserAccountDoc(user);
  const path = `users/${user.uid}/private/profile`;
  const ref = doc(db, 'users', user.uid, 'private', 'profile');

  try {
    const snap = await getDoc(ref);
    const basePayload = {
      email: clampStr(user.email || '', 254),
      schoolName: clampStr(profile.schoolName, 160),
      teacherName: clampStr(profile.teacherName, 120),
      defaultTerm: normalizeTerm(profile.defaultTerm),
      lang: normalizeLang(lang),
      theme: normalizeTheme(theme),
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        ...basePayload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, basePayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function savePlanToCloud(user: User, savedPlan: SavedPlan): Promise<void> {
  if (!user.emailVerified) return;
  await ensureUserAccountDoc(user);
  const planId = sanitizeId(savedPlan.id, 'plan');
  const path = `users/${user.uid}/plans/${planId}`;
  const ref = doc(db, 'users', user.uid, 'plans', planId);

  try {
    const snap = await getDoc(ref);
    const sanitizedPlan = sanitizePlanContent(savedPlan.plan);
    const updatedAtIso = clampStr(savedPlan.updatedAt || new Date().toISOString(), 40);

    if (!snap.exists()) {
      await setDoc(ref, {
        id: planId,
        uid: user.uid,
        language: normalizeLang(savedPlan.language),
        createdAtIso: clampStr(savedPlan.createdAt || updatedAtIso, 40),
        updatedAtIso,
        plan: sanitizedPlan,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        language: normalizeLang(savedPlan.language),
        updatedAtIso,
        plan: sanitizedPlan,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePlanFromCloud(user: User, planId: string): Promise<void> {
  if (!user.emailVerified) return;
  const safeId = sanitizeId(planId, 'plan');
  const path = `users/${user.uid}/plans/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'plans', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveChatToCloud(user: User, thread: ChatThread): Promise<void> {
  if (!user.emailVerified) return;
  await ensureUserAccountDoc(user);
  const chatId = sanitizeId(thread.id, 'chat');
  const path = `users/${user.uid}/chats/${chatId}`;
  const ref = doc(db, 'users', user.uid, 'chats', chatId);

  const validMessages = (Array.isArray(thread.messages) ? thread.messages : [])
    .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .slice(-100)
    .map((m, idx) => {
      const safeSources = Array.isArray(m.sources)
        ? m.sources
            .filter(
              (s) =>
                s &&
                typeof s.uri === 'string' &&
                (s.uri.startsWith('https://') || s.uri.startsWith('http://'))
            )
            .slice(0, 10)
            .map((s) => ({
              title: clampStr(s.title || s.uri, 200),
              uri: clampStr(s.uri, 1000),
            }))
        : [];
      return {
        id: sanitizeId(m.id || `msg_${idx}`, 'msg'),
        role: m.role === 'user' ? 'user' : 'bot',
        text: clampStr(m.text, 20000),
        timestamp: clampStr(m.timestamp || new Date().toISOString(), 40),
        ...(safeSources.length > 0 ? { sources: safeSources } : {}),
      };
    });

  try {
    const snap = await getDoc(ref);
    const updatedAtIso = clampStr(thread.updatedAt || new Date().toISOString(), 40);
    const title = clampStr(thread.title || 'Conversation', 200);

    if (!snap.exists()) {
      await setDoc(ref, {
        id: chatId,
        uid: user.uid,
        title,
        createdAtIso: clampStr(thread.createdAt || updatedAtIso, 40),
        updatedAtIso,
        messages: validMessages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title,
        updatedAtIso,
        messages: validMessages,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteChatFromCloud(user: User, chatId: string): Promise<void> {
  if (!user.emailVerified) return;
  const safeId = sanitizeId(chatId, 'chat');
  const path = `users/${user.uid}/chats/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'chats', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveAssessmentToCloud(user: User, item: SavedAssessment): Promise<void> {
  if (!user.emailVerified) return;
  await ensureUserAccountDoc(user);
  const assessmentId = sanitizeId(item.id, 'assess');
  const path = `users/${user.uid}/assessments/${assessmentId}`;
  const ref = doc(db, 'users', user.uid, 'assessments', assessmentId);

  const safeData = {
    title: clampStr(item.data?.title || item.topic || 'Assessment', 300),
    instructions: clampStr(item.data?.instructions || '', 2000),
    totalMarks: Math.max(0, Math.min(1000, Number(item.data?.totalMarks) || 0)),
    questions: (Array.isArray(item.data?.questions) ? item.data.questions : [])
      .slice(0, 40)
      .map((q, idx) => ({
        number: Number(q?.number) || idx + 1,
        type: clampStr(q?.type || 'short', 40),
        question: clampStr(q?.question || '', 3000),
        options: Array.isArray(q?.options) ? q.options.slice(0, 10).map((o) => clampStr(o, 500)) : [],
        marks: Math.max(0, Math.min(200, Number(q?.marks) || 1)),
        answer: clampStr(q?.answer || '', 3000),
        markingNotes: clampStr(q?.markingNotes || '', 2000),
      })),
  };

  try {
    const snap = await getDoc(ref);
    const payload = {
      language: normalizeLang(item.language),
      subject: clampStr(item.subject, 120),
      classLevel: clampStr(item.classLevel, 40),
      topic: clampStr(item.topic, 240),
      difficulty: clampStr(item.difficulty, 40),
      assessmentType: clampStr(item.assessmentType, 40),
      data: safeData,
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await setDoc(ref, {
        id: assessmentId,
        uid: user.uid,
        createdAtIso: clampStr(item.createdAt || new Date().toISOString(), 40),
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAssessmentFromCloud(
  user: User,
  assessmentId: string
): Promise<void> {
  if (!user.emailVerified) return;
  const safeId = sanitizeId(assessmentId, 'assess');
  const path = `users/${user.uid}/assessments/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'assessments', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveMethodologyToCloud(user: User, item: SavedMethodology): Promise<void> {
  if (!user.emailVerified) return;
  await ensureUserAccountDoc(user);
  const methodologyId = sanitizeId(item.id, 'method');
  const path = `users/${user.uid}/methodologies/${methodologyId}`;
  const ref = doc(db, 'users', user.uid, 'methodologies', methodologyId);

  const safeData = {
    title: clampStr(item.data?.title || item.topic || 'Methodology Guide', 300),
    coreApproach: clampStr(item.data?.coreApproach || '', 3000),
    strategies: (Array.isArray(item.data?.strategies) ? item.data.strategies : [])
      .slice(0, 20)
      .map((s) => ({
        name: clampStr(s?.name || 'Strategy', 200),
        durationHint: clampStr(s?.durationHint || '', 60),
        description: clampStr(s?.description || '', 2000),
        teacherRole: clampStr(s?.teacherRole || '', 1500),
        learnerRole: clampStr(s?.learnerRole || '', 1500),
      })),
    differentiationSen: clampStr(item.data?.differentiationSen || '', 3000),
    formativeChecks: (Array.isArray(item.data?.formativeChecks) ? item.data.formativeChecks : [])
      .slice(0, 20)
      .map((c) => clampStr(c, 1000)),
    recommendedMaterials: (
      Array.isArray(item.data?.recommendedMaterials) ? item.data.recommendedMaterials : []
    )
      .slice(0, 30)
      .map((m) => clampStr(m, 500)),
  };

  try {
    const snap = await getDoc(ref);
    const payload = {
      language: normalizeLang(item.language),
      subject: clampStr(item.subject, 120),
      classLevel: clampStr(item.classLevel, 40),
      topic: clampStr(item.topic, 240),
      data: safeData,
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await setDoc(ref, {
        id: methodologyId,
        uid: user.uid,
        createdAtIso: clampStr(item.createdAt || new Date().toISOString(), 40),
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMethodologyFromCloud(
  user: User,
  methodologyId: string
): Promise<void> {
  if (!user.emailVerified) return;
  const safeId = sanitizeId(methodologyId, 'method');
  const path = `users/${user.uid}/methodologies/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'methodologies', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface CloudSyncCallbacks {
  onProfile: (profile: TeacherProfile, lang: Lang, theme: ThemeMode) => void;
  onPlans: (plans: SavedPlan[]) => void;
  onChats: (chats: ChatThread[]) => void;
  onAssessments: (assessments: SavedAssessment[]) => void;
  onMethodologies: (methodologies: SavedMethodology[]) => void;
}

export function subscribeUserCloudData(
  user: User,
  callbacks: CloudSyncCallbacks
): () => void {
  if (!user.emailVerified) return () => {};

  const unsubs: Array<() => void> = [];

  void ensureUserAccountDoc(user).catch((err) => console.error(err));

  const profilePath = `users/${user.uid}/private/profile`;
  unsubs.push(
    onSnapshot(
      doc(db, 'users', user.uid, 'private', 'profile'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          callbacks.onProfile(
            {
              schoolName: typeof d.schoolName === 'string' ? d.schoolName : '',
              teacherName: typeof d.teacherName === 'string' ? d.teacherName : '',
              defaultTerm: normalizeTerm(d.defaultTerm),
            },
            normalizeLang(d.lang),
            normalizeTheme(d.theme)
          );
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, profilePath)
    )
  );

  const plansPath = `users/${user.uid}/plans`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', user.uid, 'plans'), where('uid', '==', user.uid)),
      (snapshot) => {
        const list: SavedPlan[] = snapshot.docs
          .map((d) => {
            const raw = d.data();
            return {
              id: String(raw.id || d.id),
              createdAt: String(raw.createdAtIso || new Date().toISOString()),
              updatedAt: String(raw.updatedAtIso || new Date().toISOString()),
              language: normalizeLang(raw.language),
              plan: raw.plan as LessonPlanData,
            };
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        callbacks.onPlans(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, plansPath)
    )
  );

  const chatsPath = `users/${user.uid}/chats`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', user.uid, 'chats'), where('uid', '==', user.uid)),
      (snapshot) => {
        const list: ChatThread[] = snapshot.docs
          .map((d) => {
            const raw = d.data();
            return {
              id: String(raw.id || d.id),
              title: String(raw.title || 'Conversation'),
              createdAt: String(raw.createdAtIso || new Date().toISOString()),
              updatedAt: String(raw.updatedAtIso || new Date().toISOString()),
              messages: Array.isArray(raw.messages) ? raw.messages : [],
            };
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        callbacks.onChats(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, chatsPath)
    )
  );

  const assessPath = `users/${user.uid}/assessments`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', user.uid, 'assessments'), where('uid', '==', user.uid)),
      (snapshot) => {
        const list: SavedAssessment[] = snapshot.docs
          .map((d) => {
            const raw = d.data();
            return {
              id: String(raw.id || d.id),
              createdAt: String(raw.createdAtIso || new Date().toISOString()),
              language: normalizeLang(raw.language),
              subject: String(raw.subject || ''),
              classLevel: String(raw.classLevel || ''),
              topic: String(raw.topic || ''),
              difficulty: String(raw.difficulty || 'medium'),
              assessmentType: String(raw.assessmentType || 'mixed'),
              data: raw.data,
            } as SavedAssessment;
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        callbacks.onAssessments(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, assessPath)
    )
  );

  const methodPath = `users/${user.uid}/methodologies`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', user.uid, 'methodologies'), where('uid', '==', user.uid)),
      (snapshot) => {
        const list: SavedMethodology[] = snapshot.docs
          .map((d) => {
            const raw = d.data();
            return {
              id: String(raw.id || d.id),
              createdAt: String(raw.createdAtIso || new Date().toISOString()),
              language: normalizeLang(raw.language),
              subject: String(raw.subject || ''),
              classLevel: String(raw.classLevel || ''),
              topic: String(raw.topic || ''),
              data: raw.data,
            } as SavedMethodology;
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        callbacks.onMethodologies(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, methodPath)
    )
  );

  return () => {
    unsubs.forEach((fn) => fn());
  };
}
