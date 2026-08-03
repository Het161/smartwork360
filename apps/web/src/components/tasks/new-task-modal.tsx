'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRIORITIES, DEFAULT_SLA_HOURS } from '@smartwork/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { Modal } from '../ui/drawer';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/input';
import { LoadChip } from '../chips';
import { cn } from '@/lib/utils';

/** Default deadline: 3 working days out, at 17:00. */
function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(17, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewTaskModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const deptId = user?.departmentId ?? undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState(defaultDue);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // The assignee picker shows each person's CURRENT LOAD, so a manager does not
  // pile another file onto whoever is already drowning.
  const workload = useQuery({
    queryKey: ['workload', deptId],
    queryFn: () => api.workload(deptId),
    enabled: !!deptId && open,
  });

  const sorted = useMemo(
    () => [...(workload.data?.items ?? [])].sort((a, b) => a.activeLoad - b.activeLoad),
    [workload.data],
  );

  const create = useMutation({
    mutationFn: () =>
      api.createTask({
        title: title.trim(),
        description: description.trim(),
        priority,
        assigneeId,
        departmentId: deptId,
        dueDate: new Date(dueDate).toISOString(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['kpis'] });
      void qc.invalidateQueries({ queryKey: ['workload'] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details?.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        setFormError(null);
      } else {
        setFormError(err instanceof Error ? err.message : 'Could not create the task');
      }
    },
  });

  function reset() {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setAssigneeId('');
    setDueDate(defaultDue());
    setErrors({});
    setFormError(null);
  }

  const valid = title.trim().length >= 5 && description.trim().length > 0 && assigneeId;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t.manager.newTask}
      description="The task and its audit block are written in one transaction."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>
            {t.common.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="task-title" required error={errors.title}>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Verify land mutation records — Ward 12"
            aria-invalid={!!errors.title}
          />
        </Field>

        <Field label="Description" htmlFor="task-desc" required error={errors.description}>
          <Textarea
            id="task-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What exactly must be done, and what evidence should be attached?"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Priority"
            htmlFor="task-priority"
            required
            hint={`Default SLA ${DEFAULT_SLA_HOURS[priority as keyof typeof DEFAULT_SLA_HOURS]}h`}
          >
            <Select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t.priority[p]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Due date" htmlFor="task-due" required error={errors.dueDate}>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>

        {/* Assignee picker with live workload */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Assignee<span className="ml-0.5 text-danger">*</span>
          </p>
          <p className="mb-2 text-xs text-slate-500">
            Sorted by current load — lightest first.
          </p>
          <div className="thin-scroll max-h-56 space-y-1 overflow-y-auto rounded-btn border border-borderx p-1.5">
            {sorted.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">{t.common.loading}</p>
            ) : (
              sorted.map((w) => (
                <button
                  key={w.userId}
                  type="button"
                  onClick={() => setAssigneeId(w.userId)}
                  aria-pressed={assigneeId === w.userId}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    assigneeId === w.userId
                      ? 'bg-primary-50 ring-1 ring-primary-200'
                      : 'hover:bg-slate-50',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{w.name}</span>
                    <span className="block truncate text-xs text-slate-500">{w.designation}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {w.overdue > 0 ? (
                      <span className="text-xs font-medium text-danger">{w.overdue} overdue</span>
                    ) : null}
                    <LoadChip band={w.band} />
                    <span className="tabular w-5 text-right text-sm font-semibold text-slate-700">
                      {w.activeLoad}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          {errors.assigneeId ? (
            <p className="mt-1 text-sm text-danger" role="alert">
              {errors.assigneeId}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p role="alert" className="rounded-btn bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
