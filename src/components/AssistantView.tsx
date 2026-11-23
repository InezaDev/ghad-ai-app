import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  Clock,
  Copy,
  History,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ChatThread, Lang } from '../types/ghad';
import { translate } from '../i18n/translations';
import { useAssistantQueue } from '../hooks/useAssistantQueue';

interface AssistantViewProps {
  lang: Lang;
  threads: ChatThread[];
  activeThreadId: string | null;
  onUpdateThreads: (threads: ChatThread[], nextActiveId: string | null) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  onCopy: (text: string) => void;
}

const STARTER_PROMPTS = [
  'How do I write a REB CBC instructional objective with all 4 parts?',
  'Suggest a 10-minute group discovery activity for S2 Photosynthesis.',
  'How can I integrate Gender & Inclusive Education in P5 Mathematics?',
  'Translate a P4 Social Studies lesson objective into Ikinyarwanda.',
];

export const AssistantView: React.FC<AssistantViewProps> = ({
  lang,
  threads,
  activeThreadId,
  onUpdateThreads,
  onToast,
  onCopy,
}) => {
  const t = (k: string) => translate(lang, k);
  const [input, setInput] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClearChats, setConfirmClearChats] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const {
    activeJob,
    queuedJobs,
    failedJob,
    enqueueMessage,
    retryFailed,
    retryNow,
    cancelActive,
    removeQueued,
    dismissFailed,
  } = useAssistantQueue({
    lang,
    threads,
    activeThreadId,
    onUpdateThreads,
    onToast,
  });

  const activeThread = threads.find((th) => th.id === activeThreadId) || null;
  const activeJobInCurrentThread = activeJob && activeJob.threadId === activeThread?.id;
  const failedInCurrentThread = failedJob && (!activeThread || failedJob.threadId === activeThread.id);
  const pendingForCurrentThread = queuedJobs.filter(
    (j) => !activeThread || j.threadId === activeThread.id
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeThread?.messages.length, activeJob?.id, activeJob?.phase, queuedJobs.length]);

  const startNewChat = () => {
    dismissFailed();
    onUpdateThreads(threads, null);
    setInput('');
  };

  const selectThread = (threadId: string) => {
    onUpdateThreads(threads, threadId);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setDrawerOpen(false);
    }
  };

  const deleteThread = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (activeJob?.threadId === id) {
      cancelActive();
    }
    const next = threads.filter((th) => th.id !== id);
    const nextActive = activeThreadId === id ? (next[0]?.id ?? null) : activeThreadId;
    onUpdateThreads(next, nextActive);
    onToast('Conversation deleted.', 'info');
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!activeThread) return;
    const nextMessages = activeThread.messages.filter((m) => m.id !== messageId);
    if (nextMessages.length === 0) {
      deleteThread(activeThread.id);
    } else {
      const nextThreads = threads.map((th) =>
        th.id === activeThread.id
          ? { ...th, messages: nextMessages, updatedAt: new Date().toISOString() }
          : th
      );
      onUpdateThreads(nextThreads, activeThread.id);
      onToast('Message deleted.', 'info');
    }
  };

  const handleClearAllChats = () => {
    if (threads.length === 0) return;
    if (activeJob) {
      cancelActive();
    }
    onUpdateThreads([], null);
    onToast('All conversations cleared.', 'info');
  };

  const handleSubmit = (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    enqueueMessage(text, { targetThreadId: activeThread?.id ?? null });
    if (!overrideText) setInput('');
  };

  const handleCopyMessage = (id: string, text: string) => {
    onCopy(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 1800);
  };

  const getActiveStatusText = () => {
    if (!activeJob) return '';
    switch (activeJob.phase) {
      case 'retrying':
        return `${t('queue_retrying')} ${activeJob.retryInSeconds}s…`;
      case 'slow':
        return t('queue_slow');
      case 'generating':
        return t('queue_generating');
      case 'preparing':
      default:
        return t('queue_preparing');
    }
  };

  return (
    <section id="view-assistant" className="view-animate space-y-4">
      {/* Top Bar Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0284C7] dark:text-[#38BDF8] mb-1">
            <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>REB Competence-Based Pedagogy Advisor</span>
          </div>
          <h1 data-i18n="assistant_title" className="font-display text-2xl font-bold text-[var(--text)]">
            {t('assistant_title')}
          </h1>
          <p data-i18n="assistant_sub" className="text-sm text-[var(--muted)] mt-0.5">
            {t('assistant_sub')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Delete Current Active Chat button */}
          {activeThread && (
            <button
              type="button"
              onClick={() => deleteThread(activeThread.id)}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-semibold rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('delete_chat')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
          >
            {drawerOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            <span data-i18n="prev_chats">{t('prev_chats')}</span>
            <span className="font-mono-tabular text-[var(--muted)]">({threads.length})</span>
          </button>

          <button
            type="button"
            onClick={startNewChat}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] text-xs font-semibold rounded-xl bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer whitespace-nowrap shadow-xs"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span data-i18n="new_chat">{t('new_chat')}</span>
          </button>
        </div>
      </div>

      {/* Compact indicator if a background thread is actively generating */}
      {activeJob && !activeJobInCurrentThread && (
        <div className="px-4 py-2.5 rounded-xl border border-[#0284C7]/30 bg-[#0284C7]/5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-[var(--muted)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#15803D]" />
            <span>
              <strong className="text-[var(--text)]">
                {threads.find((th) => th.id === activeJob.threadId)?.title || 'Conversation'}:
              </strong>{' '}
              {getActiveStatusText()} ({activeJob.elapsedSec}s)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => selectThread(activeJob.threadId)}
              className="px-2.5 py-1 font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:border-[#15803D] text-[var(--text)] cursor-pointer"
            >
              Open
            </button>
            <button
              type="button"
              onClick={cancelActive}
              className="px-2.5 py-1 font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
            >
              {t('queue_cancel')}
            </button>
          </div>
        </div>
      )}

      {failedInCurrentThread && failedJob && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-3 text-sm text-red-800 dark:text-red-200"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{failedJob.error}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={retryFailed}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('retry')}
            </button>
            <button
              type="button"
              onClick={dismissFailed}
              aria-label="Dismiss error"
              className="p-1 hover:opacity-75 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Previous Chats Sidebar */}
        {drawerOpen && (
          <aside className="lg:col-span-4 xl:col-span-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs flex flex-col max-h-[68vh]">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <History className="w-3.5 h-3.5 text-[#0284C7]" />
                <span data-i18n="prev_chats">{t('prev_chats')}</span>
              </span>
              <span className="text-xs font-mono-tabular text-[var(--muted)]">{threads.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
              {threads.length === 0 ? (
                <div className="p-5 text-xs text-[var(--muted)] leading-relaxed">
                  No saved conversations yet. Ask a question or tap one of the Rwanda CBC prompts to start.
                </div>
              ) : (
                threads.map((th) => {
                  const isActive = th.id === activeThread?.id;
                  const isBusy = activeJob?.threadId === th.id;
                  return (
                    <div
                      key={th.id}
                      onClick={() => selectThread(th.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          selectThread(th.id);
                        }
                      }}
                      className={`p-3.5 flex items-start justify-between gap-2 cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-[#15803D]/10 text-[var(--text)]'
                          : 'hover:bg-[var(--surface-subtle)] text-[var(--text)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                          {isBusy && <Loader2 className="w-3 h-3 animate-spin text-[#15803D] shrink-0" />}
                          <span className={isActive ? 'text-[#15803D] dark:text-[#4ade80] truncate' : 'truncate'}>
                            {th.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--muted)] font-mono-tabular mt-0.5">
                          {new Date(th.updatedAt).toLocaleDateString()} · {th.messages.length} msgs
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => deleteThread(th.id, e)}
                        title={t('delete_chat')}
                        className="p-1.5 rounded-lg text-[var(--muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {threads.length > 0 && (
              <div className="p-2.5 border-t border-[var(--border)] bg-[var(--surface-subtle)]">
                {!confirmClearChats ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClearChats(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('clear_all_chats')}</span>
                  </button>
                ) : (
                  <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 space-y-2">
                    <p className="text-[11px] font-semibold text-red-700 dark:text-red-300 text-center">
                      Delete all {threads.length} conversations?
                    </p>
                    <div className="flex items-center gap-1.5 justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmClearChats(false);
                          handleClearAllChats();
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                      >
                        Yes, Delete All
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearChats(false)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* Active Chat Panel */}
        <div
          className={`${
            drawerOpen ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'
          } flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs overflow-hidden h-[68vh] min-h-[460px]`}
        >
          {/* Active Chat Conversation Bar */}
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-subtle)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-md bg-[#15803D]/15 text-[#15803D] dark:text-[#4ade80] grid place-items-center shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-[var(--text)] truncate">
                  {activeThread?.title || 'GHAD AI · Rwanda CBC Advisor'}
                </h2>
                <span className="text-[10px] text-[var(--muted)] font-mono-tabular">
                  {activeThread ? `${activeThread.messages.length} messages` : 'Ready to assist'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {activeThread && (
                <button
                  type="button"
                  onClick={() => deleteThread(activeThread.id)}
                  title={t('delete_chat')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-800 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('delete_chat')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={startNewChat}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('new_chat')}</span>
              </button>
            </div>
          </div>

          <div id="chatMessages" className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[var(--surface)]">
            {(!activeThread || activeThread.messages.length === 0) && !activeJobInCurrentThread && (
              <div className="space-y-5 max-w-3xl">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-[#0284C7]/15 text-[#0284C7] dark:text-[#38BDF8] grid place-items-center">
                      <Bot className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-[var(--text)]">GHAD AI · CBC Teaching Assistant</span>
                  </div>
                  <div className="px-4 py-3.5 text-sm text-[var(--text)] leading-relaxed">
                    <span data-i18n="chat_welcome">{t('chat_welcome')}</span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-[var(--muted)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span>Rwanda CBC Starter Prompts</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSubmit(prompt)}
                        className="text-left text-xs font-medium leading-relaxed px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] hover:border-[#15803D] hover:bg-[#15803D]/5 text-[var(--text)] transition-colors cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeThread?.messages
              .filter((m) => m.text && m.text.trim().length > 0)
              .map((m) => {
                const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex flex-col items-end group">
                      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 text-sm bg-[#15803D] text-white whitespace-pre-wrap leading-relaxed shadow-xs">
                        {m.text}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                        <span className="font-mono-tabular">{timeStr}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(m.id)}
                          title={t('delete_message')}
                          aria-label={t('delete_message')}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-[var(--muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                const isCopied = copiedId === m.id;
                return (
                  <div key={m.id} className="flex flex-col items-start group">
                    <div className="w-full max-w-3xl rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface-subtle)] overflow-hidden shadow-xs">
                      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-[#0284C7]/15 text-[#0284C7] dark:text-[#38BDF8] grid place-items-center shrink-0">
                            <Bot className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-xs font-semibold text-[var(--text)] truncate">
                            GHAD AI · CBC Assistant
                          </span>
                          <span className="text-[11px] text-[var(--muted)] font-mono-tabular shrink-0">
                            {timeStr}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(m.id, m.text)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] hover:border-[#15803D] text-[11px] font-semibold text-[var(--text)] transition-colors cursor-pointer"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-[#15803D]" />
                                <span className="text-[#15803D]">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-[var(--muted)]" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(m.id)}
                            title={t('delete_message')}
                            aria-label={t('delete_message')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 text-[11px] font-semibold text-[var(--muted)] hover:text-red-600 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      <div className="px-4 py-3.5 text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                        {m.text}
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Graceful Active Loading Status Manager Card */}
            {activeJobInCurrentThread && activeJob && (
              <div className="flex items-start">
                <div className="w-full max-w-xl rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] px-4 py-3.5 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-[var(--text)] font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-[#15803D] shrink-0" />
                      <span>{getActiveStatusText()}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-mono-tabular text-[var(--muted)] shrink-0">
                      <Clock className="w-3 h-3" />
                      {activeJob.elapsedSec}s
                    </span>
                  </div>

                  {/* Smooth progress track */}
                  <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        activeJob.phase === 'retrying'
                          ? 'bg-[#F59E0B] w-2/3'
                          : activeJob.phase === 'slow'
                          ? 'bg-[#F59E0B] w-4/5'
                          : activeJob.phase === 'generating'
                          ? 'bg-[#15803D] w-3/5'
                          : 'bg-[#0284C7] w-1/4'
                      }`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {activeJob.phase === 'retrying' && (
                      <button
                        type="button"
                        onClick={retryNow}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {t('queue_retry_now')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={cancelActive}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-red-600 hover:border-red-300 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      {t('queue_cancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Pending Queue Strip */}
          {pendingForCurrentThread.length > 0 && (
            <div className="px-3 sm:px-4 py-2 border-t border-[var(--border)] bg-[var(--surface)] flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide shrink-0">
                {t('queue_pending_label')} ({pendingForCurrentThread.length}):
              </span>
              {pendingForCurrentThread.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1.5 max-w-[240px] px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-xs text-[var(--text)]"
                >
                  <span className="truncate">{item.text}</span>
                  <button
                    type="button"
                    onClick={() => removeQueued(item.id)}
                    aria-label="Remove queued question"
                    className="text-[var(--muted)] hover:text-red-600 cursor-pointer shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <form
            className="p-3 sm:p-4 border-t border-[var(--border)] bg-[var(--surface-subtle)] flex items-center gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <input
              id="chatInput"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              data-i18n-ph="chat_ph"
              placeholder={t('chat_ph')}
              className="flex-1 px-4 min-h-[44px] text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
            <button
              id="sendChat"
              type="submit"
              disabled={!input.trim()}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] text-sm font-semibold rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Send className="w-4 h-4" />
              <span data-i18n={activeJob ? 'queue_btn_queue' : 'send'}>
                {activeJob ? t('queue_btn_queue') : t('send')}
              </span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};
