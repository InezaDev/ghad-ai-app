import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage, ChatThread, Lang } from '../types/ghad';
import { AiClientError, requestAssistantReply } from '../services/aiClient';
import { translate } from '../i18n/translations';
import { buildAssistantHistory } from '../utils/assistantHistory';

export type AssistantPhase = 'preparing' | 'generating' | 'slow' | 'retrying';

export interface QueuedAssistantJob {
  id: string;
  threadId: string;
  userMessageId?: string;
  text: string;
  skipAppendUser?: boolean;
  useWebSearch?: boolean;
  enqueuedAt: number;
}

export interface ActiveAssistantJob extends QueuedAssistantJob {
  phase: AssistantPhase;
  attempt: number;
  maxAttempts: number;
  elapsedSec: number;
  retryInSeconds: number;
}

export interface FailedAssistantJob {
  threadId: string;
  userMessageId?: string;
  text: string;
  useWebSearch?: boolean;
  error: string;
}

interface UseAssistantQueueParams {
  lang: Lang;
  threads: ChatThread[];
  activeThreadId: string | null;
  onUpdateThreads: (threads: ChatThread[], nextActiveId: string | null) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

const MAX_AUTO_ATTEMPTS = 2;
const HIGH_DEMAND_COOLDOWN_SEC = 3;

export function useAssistantQueue({
  lang,
  threads,
  activeThreadId,
  onUpdateThreads,
  onToast,
}: UseAssistantQueueParams) {
  const [queuedJobs, setQueuedJobs] = useState<QueuedAssistantJob[]>([]);
  const [activeJob, setActiveJob] = useState<ActiveAssistantJob | null>(null);
  const [failedJob, setFailedJob] = useState<FailedAssistantJob | null>(null);

  const threadsRef = useRef(threads);
  const activeThreadIdRef = useRef(activeThreadId);
  const langRef = useRef(lang);
  const onUpdateThreadsRef = useRef(onUpdateThreads);
  const onToastRef = useRef(onToast);

  threadsRef.current = threads;
  activeThreadIdRef.current = activeThreadId;
  langRef.current = lang;
  onUpdateThreadsRef.current = onUpdateThreads;
  onToastRef.current = onToast;

  const queueRef = useRef<QueuedAssistantJob[]>([]);
  const processingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipWaitResolveRef = useRef<(() => void) | null>(null);
  const cancelledFlagRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledFlagRef.current = true;
      abortControllerRef.current?.abort();
      skipWaitResolveRef.current?.();
    };
  }, []);

  // Elapsed timer while an active job is running
  useEffect(() => {
    if (!activeJob) return;
    const timer = setInterval(() => {
      setActiveJob((prev) => {
        if (!prev) return null;
        const nextElapsed = prev.elapsedSec + 1;
        let nextPhase = prev.phase;
        if (prev.phase !== 'retrying') {
          if (nextElapsed >= 10) nextPhase = 'slow';
          else if (nextElapsed >= 3) nextPhase = 'generating';
          else nextPhase = 'preparing';
        }
        return { ...prev, elapsedSec: nextElapsed, phase: nextPhase };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeJob?.id]);

  const appendUserMessageToThread = useCallback(
    (text: string, preferredThreadId: string | null): { threadId: string; userMessageId: string } => {
      const now = new Date().toISOString();
      const currentThreads = [...threadsRef.current];
      const existing = preferredThreadId
        ? currentThreads.find((th) => th.id === preferredThreadId)
        : null;

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_u`,
        role: 'user',
        text,
        timestamp: now,
      };

      let targetId: string;
      let nextThreads: ChatThread[];

      if (!existing) {
        targetId = `chat_${Date.now()}`;
        const newThread: ChatThread = {
          id: targetId,
          title: text.length > 48 ? `${text.slice(0, 48)}…` : text,
          createdAt: now,
          updatedAt: now,
          messages: [userMsg],
        };
        nextThreads = [newThread, ...currentThreads];
      } else {
        targetId = existing.id;
        nextThreads = currentThreads.map((th) =>
          th.id === targetId
            ? {
                ...th,
                title:
                  th.messages.length === 0
                    ? text.length > 48
                      ? `${text.slice(0, 48)}…`
                      : text
                    : th.title,
                updatedAt: now,
                messages: [...th.messages, userMsg],
              }
            : th
        );
      }

      threadsRef.current = nextThreads;
      activeThreadIdRef.current = targetId;
      onUpdateThreadsRef.current(nextThreads, targetId);
      return { threadId: targetId, userMessageId: userMsg.id };
    },
    []
  );

  const waitCooldown = useCallback(async (seconds: number) => {
    for (let remaining = seconds; remaining > 0; remaining--) {
      if (cancelledFlagRef.current || !mountedRef.current) return;
      setActiveJob((prev) =>
        prev ? { ...prev, phase: 'retrying', retryInSeconds: remaining } : null
      );
      let skipped = false;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          skipWaitResolveRef.current = null;
          resolve();
        }, 1000);
        skipWaitResolveRef.current = () => {
          skipped = true;
          clearTimeout(timer);
          skipWaitResolveRef.current = null;
          resolve();
        };
      });
      if (skipped || cancelledFlagRef.current || !mountedRef.current) return;
    }
  }, []);

  const pumpQueue = useCallback(async () => {
    if (processingRef.current) return;
    const nextJob = queueRef.current.shift();
    if (!nextJob) {
      if (mountedRef.current) setActiveJob(null);
      return;
    }

    processingRef.current = true;
    cancelledFlagRef.current = false;
    if (mountedRef.current) {
      setQueuedJobs([...queueRef.current]);
      setFailedJob((prev) => (prev?.threadId === nextJob.threadId ? null : prev));
    }

    // Ensure the user message exists in the target thread before calling AI
    let targetThreadId = nextJob.threadId;
    let activeUserMsgId = nextJob.userMessageId;
    const threadExists = threadsRef.current.some((th) => th.id === targetThreadId);
    if (!nextJob.skipAppendUser || !threadExists) {
      const appended = appendUserMessageToThread(
        nextJob.text,
        threadExists ? targetThreadId : activeThreadIdRef.current
      );
      targetThreadId = appended.threadId;
      activeUserMsgId = appended.userMessageId;
    }

    if (mountedRef.current) {
      setActiveJob({
        ...nextJob,
        threadId: targetThreadId,
        userMessageId: activeUserMsgId,
        phase: 'preparing',
        attempt: 1,
        maxAttempts: MAX_AUTO_ATTEMPTS,
        elapsedSec: 0,
        retryInSeconds: 0,
      });
    }

    let completed = false;
    let attempt = 1;

    while (!completed && attempt <= MAX_AUTO_ATTEMPTS && !cancelledFlagRef.current && mountedRef.current) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (mountedRef.current) {
        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                attempt,
                phase: attempt > 1 ? 'generating' : prev.phase === 'retrying' ? 'generating' : prev.phase,
                retryInSeconds: 0,
              }
            : null
        );
      }

      try {
        const currentThread = threadsRef.current.find((th) => th.id === targetThreadId);
        if (!currentThread) {
          // User deleted thread while request was pending
          break;
        }

        const historyWithoutCurrent = buildAssistantHistory(
          currentThread.messages,
          activeUserMsgId
        );

        const result = await requestAssistantReply({
          lang: langRef.current,
          message: nextJob.text,
          history: historyWithoutCurrent,
          useWebSearch: nextJob.useWebSearch,
          signal: controller.signal,
        });

        const reply = (result?.reply || '').trim();
        if (!reply) {
          throw new AiClientError('Assistant returned an empty response. Please click Retry.', 502);
        }

        if (cancelledFlagRef.current || !mountedRef.current) break;

        const botMsg: ChatMessage = {
          id: `msg_${Date.now()}_b`,
          role: 'bot',
          text: reply,
          timestamp: new Date().toISOString(),
          ...(result.sources.length > 0 ? { sources: result.sources } : {}),
        };

        const latestThreads = threadsRef.current;
        if (latestThreads.some((th) => th.id === targetThreadId)) {
          const updatedThreads = latestThreads.map((th) =>
            th.id === targetThreadId
              ? { ...th, updatedAt: botMsg.timestamp, messages: [...th.messages, botMsg] }
              : th
          );
          threadsRef.current = updatedThreads;
          const keepActiveId = activeThreadIdRef.current ?? targetThreadId;
          onUpdateThreadsRef.current(updatedThreads, keepActiveId);
        }

        completed = true;
      } catch (err) {
        if (cancelledFlagRef.current || (err instanceof AiClientError && err.isAborted)) {
          break;
        }

        const isHighDemand = err instanceof AiClientError && err.isHighDemand;
        if (isHighDemand && attempt < MAX_AUTO_ATTEMPTS) {
          attempt += 1;
          await waitCooldown(HIGH_DEMAND_COOLDOWN_SEC);
          continue;
        }

        const msg = err instanceof Error ? err.message : translate(langRef.current, 'toast_net');
        if (mountedRef.current) {
          setFailedJob({
            threadId: targetThreadId,
            userMessageId: activeUserMsgId,
            text: nextJob.text,
            useWebSearch: nextJob.useWebSearch,
            error: msg,
          });
          onToastRef.current(`${translate(langRef.current, 'toast_net')}: ${msg}`, 'error');
        }
        break;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    }

    processingRef.current = false;
    if (mountedRef.current) {
      setActiveJob(null);
      void pumpQueue();
    }
  }, [appendUserMessageToThread, waitCooldown]);

  const enqueueMessage = useCallback(
    (
      rawText: string,
      opts?: {
        targetThreadId?: string | null;
        skipAppendUser?: boolean;
        userMessageId?: string;
        useWebSearch?: boolean;
      }
    ) => {
      const text = rawText.trim();
      if (!text) return;

      const requestedThreadId = opts?.targetThreadId ?? activeThreadIdRef.current;
      let resolvedThreadId = requestedThreadId || '';
      let resolvedUserMessageId = opts?.userMessageId;

      // If idle, append immediately to thread so UI feels instant; if already busy, hold in queuedJobs strip
      if (!processingRef.current && !opts?.skipAppendUser) {
        const appended = appendUserMessageToThread(text, requestedThreadId);
        resolvedThreadId = appended.threadId;
        resolvedUserMessageId = appended.userMessageId;
      } else if (!resolvedThreadId) {
        // Reserve or create an empty/named thread when queueing from a fresh chat
        const now = new Date().toISOString();
        resolvedThreadId = `chat_${Date.now()}`;
        const stubThread: ChatThread = {
          id: resolvedThreadId,
          title: text.length > 48 ? `${text.slice(0, 48)}…` : text,
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        const nextThreads = [stubThread, ...threadsRef.current];
        threadsRef.current = nextThreads;
        activeThreadIdRef.current = resolvedThreadId;
        onUpdateThreadsRef.current(nextThreads, resolvedThreadId);
      }

      const job: QueuedAssistantJob = {
        id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        threadId: resolvedThreadId,
        userMessageId: resolvedUserMessageId,
        text,
        skipAppendUser: !processingRef.current || Boolean(opts?.skipAppendUser),
        useWebSearch: opts?.useWebSearch ?? true,
        enqueuedAt: Date.now(),
      };

      queueRef.current.push(job);
      setQueuedJobs([...queueRef.current]);
      setFailedJob((prev) => (prev?.threadId === resolvedThreadId ? null : prev));
      void pumpQueue();
    },
    [appendUserMessageToThread, pumpQueue]
  );

  const retryFailed = useCallback(() => {
    if (!failedJob) return;
    const { threadId, userMessageId, text, useWebSearch } = failedJob;
    setFailedJob(null);
    enqueueMessage(text, {
      targetThreadId: threadId,
      skipAppendUser: true,
      userMessageId,
      useWebSearch,
    });
  }, [failedJob, enqueueMessage]);

  const retryNow = useCallback(() => {
    skipWaitResolveRef.current?.();
  }, []);

  const cancelActive = useCallback(() => {
    cancelledFlagRef.current = true;
    skipWaitResolveRef.current?.();
    abortControllerRef.current?.abort();
    onToastRef.current(translate(langRef.current, 'queue_cancelled_msg'), 'info');
  }, []);

  const removeQueued = useCallback((jobId: string) => {
    queueRef.current = queueRef.current.filter((j) => j.id !== jobId);
    setQueuedJobs([...queueRef.current]);
  }, []);

  const dismissFailed = useCallback(() => {
    setFailedJob(null);
  }, []);

  return {
    activeJob,
    queuedJobs,
    failedJob,
    enqueueMessage,
    retryFailed,
    retryNow,
    cancelActive,
    removeQueued,
    dismissFailed,
  };
}
