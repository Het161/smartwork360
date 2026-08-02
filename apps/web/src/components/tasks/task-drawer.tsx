'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskDTO } from '@smartwork/shared';
import { canTransition } from '@smartwork/shared';
import { CalendarClock, Link2, MessageSquarePlus, Send, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { Drawer } from '../ui/drawer';
import { Button } from '../ui/button';
import { Textarea } from '../ui/input';
import { Avatar, PersonCell } from '../avatar';
import { PriorityChip, SentimentChip, SlaChip, StatusChip } from '../chips';
import { Skeleton } from '../ui/states';
import { cn } from '@/lib/utils';
import { emitTourEvent, TOUR_EVENTS } from '@/components/guide/tours/targets';

export function TaskDrawer({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(50);
  const [error, setError] = useState<string | null>(null);

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.task(taskId!),
    enabled: !!taskId && open,
  });

  const { data: audit } = useQuery({
    queryKey: ['task-audit', taskId],
    queryFn: () => api.taskAudit(taskId!),
    enabled: !!taskId && open,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['task', taskId] });
    void qc.invalidateQueries({ queryKey: ['task-audit', taskId] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['kpis'] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const addUpdate = useMutation({
    mutationFn: () =>
      api.addUpdate(taskId!, { type: 'PROGRESS', note: note.trim(), progressPct: progress }),
    onSuccess: () => {
      setNote('');
      setError(null);
      invalidate();
      emitTourEvent(TOUR_EVENTS.progressAdded);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add the update'),
  });

  const changeStatus = useMutation({
    mutationFn: (status: string) => api.setStatus(taskId!, status),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not change the status'),
  });

  // Announce a genuinely-open drawer (data loaded), so a guided tour can wait for
  // it rather than for the click that may still be fetching.
  useEffect(() => {
    if (open && task) emitTourEvent(TOUR_EVENTS.taskOpened, { id: task.id });
  }, [open, task]);

  const isMine = task?.assigneeId === user?.id;
  const canStart = task && isMine && canTransition(task.status, 'IN_PROGRESS');
  const canSubmit = task && isMine && canTransition(task.status, 'UNDER_REVIEW');

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={
        isLoading || !task ? (
          <Skeleton className="h-5 w-48" />
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm text-primary">{task.refNo}</span>
            <StatusChip status={task.status} />
          </span>
        )
      }
      description={task?.title}
      footer={
        task && isMine ? (
          <div className="flex flex-wrap gap-2">
            {canStart ? (
              <Button
                onClick={() => changeStatus.mutate('IN_PROGRESS')}
                loading={changeStatus.isPending}
              >
                {t.employee.startTask}
              </Button>
            ) : null}
            {canSubmit ? (
              <Button
                variant="success"
                onClick={() => changeStatus.mutate('UNDER_REVIEW')}
                loading={changeStatus.isPending}
              >
                <Send className="h-4 w-4" aria-hidden />
                {t.employee.requestReview}
              </Button>
            ) : null}
            {task.status === 'UNDER_REVIEW' ? (
              <p className="self-center text-sm text-slate-500">
                Waiting for your manager to review this task.
              </p>
            ) : null}
          </div>
        ) : null
      }
    >
      {isLoading || !task ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-20" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Meta */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Meta label="Priority">
              <PriorityChip priority={task.priority} />
            </Meta>
            <Meta label={t.employee.slaCountdown}>
              {task.status === 'COMPLETED' ? (
                <span className="text-sm text-success">Completed within the workflow</span>
              ) : (
                <SlaChip hoursRemaining={task.hoursRemaining} isOverdue={task.isOverdue} />
              )}
            </Meta>
            <Meta label="Assignee">
              {task.assignee ? (
                <PersonCell
                  name={task.assignee.name}
                  designation={task.assignee.designation}
                  seed={task.assignee.avatarSeed}
                  size="xs"
                />
              ) : null}
            </Meta>
            <Meta label="Raised by">
              {task.creator ? (
                <PersonCell
                  name={task.creator.name}
                  designation={task.creator.designation}
                  seed={task.creator.avatarSeed}
                  size="xs"
                />
              ) : null}
            </Meta>
            <Meta label="Due">
              <span className="flex items-center gap-1.5 text-base text-slate-700">
                <CalendarClock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {new Date(task.dueDate).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </Meta>
            <Meta label="SLA window">
              <span className="text-base text-slate-700">{task.slaHours} hours</span>
            </Meta>
          </div>

          <section>
            <h3 className="gt-label mb-1.5">Description</h3>
            <p className="whitespace-pre-line rounded-btn bg-slate-50 p-3 text-base leading-relaxed text-slate-700">
              {task.description}
            </p>
          </section>

          {/* Progress */}
          {task.progressPct !== undefined ? (
            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="gt-label">{t.employee.progress}</h3>
                <span className="tabular text-sm font-medium text-slate-700">
                  {task.progressPct}%
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={task.progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t.employee.progress}
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    task.status === 'COMPLETED' ? 'bg-success' : 'bg-primary',
                  )}
                  style={{ width: `${task.progressPct}%` }}
                />
              </div>
            </section>
          ) : null}

          {/* Add update */}
          {isMine && task.status !== 'COMPLETED' ? (
            <section data-tour="add-progress" className="scroll-mt-24 rounded-card border border-borderx p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <MessageSquarePlus className="h-4 w-4 text-primary" aria-hidden />
                {t.employee.addUpdate}
              </h3>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.employee.writeUpdate}
                aria-label={t.employee.addUpdate}
              />
              <div className="mt-3">
                <label htmlFor="progress-slider" className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-600">{t.employee.progress}</span>
                  <span className="tabular font-medium text-slate-800">{progress}%</span>
                </label>
                <input
                  id="progress-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full accent-[#14417B]"
                />
              </div>
              {error ? (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <Button
                className="mt-3"
                size="sm"
                disabled={!note.trim()}
                loading={addUpdate.isPending}
                onClick={() => addUpdate.mutate()}
              >
                {t.common.submit}
              </Button>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="h-3 w-3 text-success" aria-hidden />
                This update is scored for sentiment and written into the audit chain.
              </p>
            </section>
          ) : null}

          {/* Timeline */}
          <section>
            <h3 className="gt-label mb-3">{t.employee.timeline}</h3>
            {!task.updates?.length ? (
              <p className="text-sm text-slate-500">No updates recorded yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-borderx pl-5">
                {task.updates.map((u) => (
                  <li key={u.id} className="relative">
                    <span
                      className="absolute -left-[26px] top-1 grid h-3 w-3 place-items-center rounded-full border-2 border-white bg-primary"
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {u.author ? (
                        <Avatar name={u.author.name} seed={u.author.avatarSeed} size="xs" />
                      ) : null}
                      <span className="text-sm font-medium text-slate-800">{u.author?.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {u.type.replace('_', ' ')}
                      </span>
                      {u.sentiment ? (
                        <SentimentChip label={u.sentiment.label} score={u.sentiment.score} />
                      ) : null}
                      <span className="ml-auto text-xs text-slate-400">
                        {new Date(u.createdAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-base leading-relaxed text-slate-700">{u.note}</p>
                    {u.progressPct != null ? (
                      <p className="mt-0.5 text-xs text-slate-500">Progress set to {u.progressPct}%</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Audit blocks for this task */}
          {audit?.items.length ? (
            <section>
              <h3 className="gt-label mb-2 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                Audit chain ({audit.total} blocks)
              </h3>
              <ul className="thin-scroll max-h-48 space-y-1 overflow-y-auto rounded-btn bg-slate-50 p-2">
                {audit.items.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-400">#{e.chainIndex}</span>
                    <span className="font-medium text-slate-700">{e.action}</span>
                    <span className="text-slate-500">{e.actor?.name ?? 'system'}</span>
                    <span className="ml-auto font-mono text-slate-400">{e.hash.slice(0, 10)}…</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="gt-label mb-1">{label}</p>
      {children}
    </div>
  );
}
