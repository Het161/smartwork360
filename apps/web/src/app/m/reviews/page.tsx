'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskDTO } from '@smartwork/shared';
import { CheckCircle2, ClipboardCheck, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/drawer';
import { Textarea } from '@/components/ui/input';
import { PriorityChip, SlaChip } from '@/components/chips';
import { PersonCell } from '@/components/avatar';
import { EmptyState, SkeletonCard } from '@/components/ui/states';
import { TaskDrawer } from '@/components/tasks/task-drawer';

export default function ReviewsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ task: TaskDTO; kind: 'APPROVE' | 'REJECT' } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'reviews'],
    queryFn: () => api.tasks({ status: 'UNDER_REVIEW', pageSize: 50, sort: 'dueDate', order: 'asc' }),
  });

  const review = useMutation({
    mutationFn: () => api.review(decision!.task.id, decision!.kind, note.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['kpis'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      setDecision(null);
      setNote('');
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Review failed'),
  });

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t.manager.reviewQueue}
        subtitle={`${items.length} tasks waiting for your decision`}
        breadcrumbs={[{ label: t.nav.manager }, { label: t.nav.reviews }]}
      />

      <Card data-tour="review-queue" className="scroll-mt-24">
        {isLoading ? (
          <SkeletonCard rows={5} className="border-0 shadow-none" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
            title={t.manager.noReviews}
            body="Tasks appear here as soon as an employee submits them for review."
          />
        ) : (
          <ul className="divide-y divide-borderx">
            {items.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setSelected(task.id)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-primary">{task.refNo}</span>
                    <PriorityChip priority={task.priority} />
                    {task.status !== 'COMPLETED' ? (
                      <SlaChip hoursRemaining={task.hoursRemaining} isOverdue={task.isOverdue} />
                    ) : null}
                  </span>
                  <span className="mt-1 block truncate text-base text-slate-800">{task.title}</span>
                </button>

                {task.assignee ? (
                  <PersonCell
                    name={task.assignee.name}
                    designation={task.assignee.designation}
                    seed={task.assignee.avatarSeed}
                    size="xs"
                  />
                ) : null}

                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => {
                      setDecision({ task, kind: 'APPROVE' });
                      setNote('');
                      setError(null);
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    {t.manager.approve}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDecision({ task, kind: 'REJECT' });
                      setNote('');
                      setError(null);
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden />
                    {t.manager.reject}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        title={
          decision?.kind === 'APPROVE'
            ? `${t.manager.approve} — ${decision?.task.refNo}`
            : `${t.manager.reject} — ${decision?.task.refNo}`
        }
        description={decision?.task.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant={decision?.kind === 'APPROVE' ? 'success' : 'danger'}
              disabled={note.trim().length < 5}
              loading={review.isPending}
              onClick={() => review.mutate()}
            >
              {decision?.kind === 'APPROVE' ? t.manager.approve : t.manager.reject}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="review-note" className="mb-1.5 block text-sm font-medium text-slate-700">
              {t.manager.reviewNote}
              <span className="ml-0.5 text-danger">*</span>
            </label>
            <Textarea
              id="review-note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                decision?.kind === 'APPROVE'
                  ? 'Records verified and found in order.'
                  : 'Chamber photographs are missing. Please attach and resubmit.'
              }
              autoFocus
            />
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3 w-3 text-success" aria-hidden />
              {t.manager.reviewNoteHint}
            </p>
            {note.trim().length > 0 && note.trim().length < 5 ? (
              <p className="mt-1 text-sm text-danger">A note of at least 5 characters is required.</p>
            ) : null}
          </div>

          <div className="flex items-start gap-2 rounded-btn bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            {decision?.kind === 'APPROVE'
              ? 'Approving moves this task to Completed and stops its SLA clock.'
              : 'Sending back returns the task to In Progress so the assignee can correct it.'}
          </div>

          {error ? (
            <p role="alert" className="rounded-btn bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>

      <TaskDrawer taskId={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
