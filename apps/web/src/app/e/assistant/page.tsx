'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ChatReplyDTO } from '@smartwork/shared';
import { Bot, CornerDownLeft, Loader2, Sparkles, User2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { emitTourEvent, TOUR_EVENTS } from '@/components/guide/tours/targets';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  intent?: string;
  links?: { label: string; href: string }[];
  pending?: boolean;
}

export default function AssistantPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const suggestions = useQuery({
    queryKey: ['chat-suggestions'],
    queryFn: () => api.chatSuggestions(),
  });

  const ask = useMutation({
    mutationFn: (message: string) => api.chat(message),
    onSuccess: (reply: ChatReplyDTO, message) => {
      setMessages((prev) => [
        ...prev.filter((m) => !m.pending),
        { id: `a-${Date.now()}`, role: 'assistant', text: reply.reply, intent: reply.intent, links: reply.links },
      ]);
      void message;
      emitTourEvent(TOUR_EVENTS.assistantReplied, { intent: reply.intent });
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev.filter((m) => !m.pending),
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text:
            err instanceof Error
              ? `I could not reach the task service — ${err.message}`
              : 'Something went wrong.',
          intent: 'error',
        },
      ]);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || ask.isPending) return;
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: trimmed },
      { id: 'pending', role: 'assistant', text: t.assistant.thinking, pending: true },
    ]);
    setInput('');
    ask.mutate(trimmed);
  }

  return (
    <>
      <PageHeader
        title={t.assistant.title}
        subtitle={t.assistant.subtitle}
        breadcrumbs={[{ label: t.nav.employee }, { label: t.nav.assistant }]}
      />

      <Card className="flex h-[calc(100vh-230px)] min-h-[440px] flex-col">
        <div className="thin-scroll flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary-50 text-primary">
                <Sparkles className="h-5 w-5" aria-hidden />
              </div>
              <p className="text-md font-medium text-slate-800">{t.assistant.emptyTitle}</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">{t.assistant.emptyBody}</p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex gap-2.5', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {m.role === 'assistant' ? (
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-white">
                    <Bot className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}

                <div className={cn('max-w-[76%]', m.role === 'user' && 'order-first')}>
                  <div
                    className={cn(
                      'rounded-card px-3.5 py-2.5 text-base leading-relaxed',
                      m.role === 'user'
                        ? 'bg-primary text-white'
                        : 'border border-borderx bg-white text-slate-800',
                    )}
                  >
                    {m.pending ? (
                      <span className="flex items-center gap-2 text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        {m.text}
                      </span>
                    ) : (
                      <p className="whitespace-pre-line">{m.text}</p>
                    )}
                  </div>

                  {m.links?.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.links.map((link) => (
                        <Button key={link.href} asChild variant="secondary" size="sm">
                          <Link href={link.href}>{link.label}</Link>
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  {m.intent && !m.pending && m.role === 'assistant' ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      {t.assistant.intent}: <span className="font-mono">{m.intent}</span>
                    </p>
                  ) : null}
                </div>

                {m.role === 'user' ? (
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600">
                    <User2 className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {/* Suggested questions */}
        <div className="border-t border-borderx px-4 py-2.5">
          <p className="mb-2 text-xs font-medium text-slate-500">{t.assistant.suggestions}</p>
          <div data-tour="assistant-chips" className="flex flex-wrap gap-1.5">
            {(suggestions.data?.items ?? []).map((s) => {
              const text = lang === 'hi' ? s.hi : s.en;
              return (
                <button
                  key={s.en}
                  onClick={() => send(text)}
                  disabled={ask.isPending}
                  className="rounded-full border border-borderx px-3 py-1 text-sm text-slate-700 transition-colors hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {text}
                </button>
              );
            })}
            <button
              onClick={() => send('mere pending kaam kitne hain?')}
              disabled={ask.isPending}
              className="rounded-full border border-saffron/40 bg-saffron-soft px-3 py-1 text-sm text-saffron-deep transition-colors hover:border-saffron disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              mere pending kaam kitne hain?
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-borderx p-3"
        >
          <Input
            data-tour="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.assistant.placeholder}
            aria-label={t.assistant.placeholder}
            disabled={ask.isPending}
          />
          <Button type="submit" disabled={!input.trim()} loading={ask.isPending}>
            <CornerDownLeft className="h-4 w-4" aria-hidden />
            {t.assistant.send}
          </Button>
        </form>
      </Card>

      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <Badge tone="teal">Grounded</Badge>
        Every figure in a reply is read from {user?.name?.split(' ')[0]}&apos;s live task records —
        the assistant classifies intent and fills a template, it does not generate numbers.
      </p>
    </>
  );
}
