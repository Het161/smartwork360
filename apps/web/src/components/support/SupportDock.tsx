'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Send, X, WifiOff, Paperclip, Loader2 } from 'lucide-react';
import { streamSupportChat, type SupportReplyDTO } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import {
  describeError,
  latestError,
  serialiseError,
  type CapturedError,
} from '@/lib/error-capture';
import { SaarthiFace } from '@/components/guide/SaarthiFace';
import { FixCard } from './FixCard';
import { cn } from '@/lib/utils';

export interface DockMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reply?: SupportReplyDTO;
  streaming?: boolean;
}

const SUGGESTIONS: Record<string, string[]> = {
  ADMIN: [
    'Why did creating a critical task fail?',
    'What does the fraud centre actually detect?',
    'Someone is stuck at pending approval',
  ],
  MANAGER: [
    'Why did the card spring back?',
    'What does the burnout score measure?',
    'How do I reassign work from someone who left?',
  ],
  EMPLOYEE: [
    'Why can I not mark my own task complete?',
    'How do I add progress to a task?',
    'What is my performance score based on?',
  ],
};

/**
 * The support panel.
 *
 * A sheet on mobile, a docked column on desktop. Nothing here decides what is
 * safe — the answer arriving over the stream has already been through the
 * server's scope guard, and any fix it carries is re-authorised when applied.
 */
export function SupportDock({
  open,
  onClose,
  seedError,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-attached failure when opened from "Ask Saarthi about this". */
  seedError?: CapturedError | null;
}) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();

  const [messages, setMessages] = useState<DockMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [attached, setAttached] = useState<CapturedError | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Attach whatever failure the user opened this from.
  useEffect(() => {
    if (open) setAttached(seedError ?? null);
  }, [open, seedError]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Esc closes, and an in-flight stream is cancelled rather than left running.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        abortRef.current?.abort();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const userMsg: DockMessage = { id: `u-${Date.now()}`, role: 'user', text: question };
      const botId = `a-${Date.now()}`;
      setMessages((m) => [
        ...m,
        userMsg,
        { id: botId, role: 'assistant', text: '', streaming: true },
      ]);
      setInput('');
      setBusy(true);

      const errorContext = attached;
      setAttached(null);
      const paste = pasted.trim();
      setPasted('');
      setPasteOpen(false);

      const controller = new AbortController();
      abortRef.current = controller;

      await streamSupportChat(
        {
          message: question,
          conversationId,
          lang,
          currentRoute: typeof window !== 'undefined' ? window.location.pathname : '/',
          correlationId: errorContext?.correlationId ?? undefined,
          pastedError: paste || (errorContext ? serialiseError(errorContext) : undefined),
        },
        {
          onToken: (chunk) =>
            setMessages((m) =>
              m.map((msg) => (msg.id === botId ? { ...msg, text: msg.text + chunk } : msg)),
            ),
          onDone: (reply) => {
            setConversationId(reply.conversationId);
            setMessages((m) =>
              m.map((msg) =>
                msg.id === botId
                  ? { ...msg, text: reply.answer, reply, streaming: false }
                  : msg,
              ),
            );
            setBusy(false);
          },
          onError: (message) => {
            setMessages((m) =>
              m.map((msg) => (msg.id === botId ? { ...msg, text: message, streaming: false } : msg)),
            );
            setBusy(false);
          },
        },
        controller.signal,
      );
    },
    [attached, busy, conversationId, lang, pasted],
  );

  const suggestions = SUGGESTIONS[user?.role ?? 'EMPLOYEE'] ?? SUGGESTIONS.EMPLOYEE;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-slate-900/20 sm:hidden"
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="false"
            aria-label={t.support.title}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            data-tour="support-dock"
            className="fixed inset-x-0 bottom-0 z-[61] flex h-[85vh] flex-col overflow-hidden rounded-t-card border border-borderx bg-white shadow-pop sm:inset-x-auto sm:bottom-24 sm:right-5 sm:h-[560px] sm:w-[400px] sm:rounded-card"
          >
            {/* header */}
            <div className="flex items-center gap-2 border-b border-borderx bg-primary px-3 py-2.5 text-white">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15">
                <SaarthiFace size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.support.title}</p>
                <p className="truncate text-xs text-white/70">
                  {user?.role ? `${user.role} · ` : ''}
                  {t.support.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.close}
                className="rounded-btn p-1.5 hover:bg-white/15"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* messages */}
            <div
              ref={listRef}
              role="log"
              aria-live="polite"
              aria-label={t.support.title}
              className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
            >
              {messages.length === 0 ? (
                <div className="pt-4 text-center">
                  <SaarthiFace size={56} className="mx-auto" />
                  <p className="mt-2 font-semibold text-slate-900">{t.support.emptyTitle}</p>
                  <p className="mx-auto mt-1 max-w-[19rem] text-sm text-slate-500">
                    {t.support.emptyBody}
                  </p>
                  <div className="mt-3 flex flex-col gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-btn border border-borderx px-3 py-1.5 text-left text-sm text-slate-700 hover:border-primary hover:text-primary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((m) => (
                <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] space-y-2', m.role === 'user' && 'items-end')}>
                    <div
                      className={cn(
                        'rounded-card px-3 py-2 text-sm',
                        m.role === 'user'
                          ? 'bg-primary text-white'
                          : 'border border-borderx bg-white text-slate-800',
                      )}
                    >
                      {m.text || (m.streaming ? t.support.thinking : '')}
                      {m.streaming && m.text ? (
                        <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-slate-400 align-middle" />
                      ) : null}
                    </div>

                    {m.reply ? (
                      <>
                        {m.reply.offline ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            <WifiOff className="h-3 w-3" aria-hidden />
                            {t.support.offline}
                          </span>
                        ) : null}
                        {m.reply.citations.length ? (
                          <p className="text-xs text-slate-400">
                            {t.support.sources}: {m.reply.citations.join(', ')}
                          </p>
                        ) : null}
                        <FixCard reply={m.reply} />
                        {m.reply.followUps.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {m.reply.followUps.map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => void send(f)}
                                className="rounded-full border border-borderx px-2.5 py-1 text-xs text-slate-600 hover:border-primary hover:text-primary"
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {/* attached error chip */}
            {attached ? (
              <div className="mx-3 mb-2 flex items-center gap-2 rounded-btn border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono">{describeError(attached)}</span>
                <button type="button" onClick={() => setAttached(null)} className="underline">
                  {t.support.clear}
                </button>
              </div>
            ) : null}

            {pasteOpen ? (
              <div className="mx-3 mb-2">
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={3}
                  placeholder={t.support.pastePlaceholder}
                  className="w-full rounded-btn border border-borderx px-2 py-1.5 text-sm"
                />
              </div>
            ) : null}

            {/* composer */}
            <div className="border-t border-borderx px-3 py-2">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasteOpen((v) => !v)}
                  aria-label={t.support.pasteError}
                  title={t.support.pasteError}
                  className={cn(
                    'rounded-btn p-2 text-slate-500 hover:bg-slate-100',
                    pasteOpen && 'bg-slate-100 text-primary',
                  )}
                >
                  <Paperclip className="h-4 w-4" aria-hidden />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  placeholder={t.support.placeholder}
                  aria-label={t.support.placeholder}
                  className="max-h-24 min-h-[38px] flex-1 resize-none rounded-btn border border-borderx px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={busy || !input.trim()}
                  aria-label={t.support.send}
                  className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-btn bg-primary text-white disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-slate-400">{t.support.scopeNote}</p>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/** Opens the dock with the most recent failure already attached. */
export function useLatestError(): CapturedError | null {
  const [err, setErr] = useState<CapturedError | null>(null);
  useEffect(() => setErr(latestError()), []);
  return err;
}
