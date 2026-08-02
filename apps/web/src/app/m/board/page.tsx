'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  TASK_STATUSES,
  canTransition,
  type Paginated,
  type TaskDTO,
  type TaskStatus,
} from '@smartwork/shared';
import { AlertCircle, GripVertical, Plus, Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/drawer';
import { PriorityChip, SlaChip, StatusChip } from '@/components/chips';
import { Avatar } from '@/components/avatar';
import { EmptyState, SkeletonCard } from '@/components/ui/states';
import { TaskDrawer } from '@/components/tasks/task-drawer';
import { NewTaskModal } from '@/components/tasks/new-task-modal';
import { cn } from '@/lib/utils';
import { emitTourEvent, TOUR_EVENTS } from '@/components/guide/tours/targets';

export default function BoardPage() {
  return (
    <Suspense fallback={<SkeletonCard rows={6} />}>
      <Board />
    </Suspense>
  );
}

function Board() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get('q') ?? '');
  const [assignee, setAssignee] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dragging, setDragging] = useState<TaskDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ['tasks', 'board', q, assignee] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api.tasks({ q: q || undefined, assigneeId: assignee || undefined, pageSize: 100 }),
  });

  const workload = useQuery({
    queryKey: ['workload', user?.departmentId],
    queryFn: () => api.workload(user?.departmentId),
    enabled: !!user?.departmentId,
  });

  /**
   * Optimistic status change. The card moves the moment it is dropped; if the API
   * rejects the transition the previous board is restored and the reason shown.
   */
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<Paginated<TaskDTO>>(queryKey);
      qc.setQueryData<Paginated<TaskDTO>>(queryKey, (old) =>
        old
          ? { ...old, items: old.items.map((task) => (task.id === id ? { ...task, status } : task)) }
          : old,
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
      setError(err instanceof Error ? err.message : 'Could not move that task');
    },
    onSuccess: () => {
      setError(null);
      emitTourEvent(TOUR_EVENTS.taskMoved);
      void qc.invalidateQueries({ queryKey: ['kpis'] });
      void qc.invalidateQueries({ queryKey: ['workload'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey }),
  });

  const sensors = useSensors(
    // 6px activation distance so a click to open the drawer is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const tasks = useMemo(() => data?.items ?? [], [data]);

  function onDragStart(event: DragStartEvent) {
    setDragging(tasks.find((task) => task.id === event.active.id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;

    const task = tasks.find((x) => x.id === active.id);
    const target = over.id as TaskStatus;
    if (!task || task.status === target) return;

    // Same rule the API enforces — fail fast with a readable message instead of
    // firing a request that will be rejected.
    if (!canTransition(task.status, target)) {
      setError(
        `${task.refNo} cannot move from ${t.status[task.status]} to ${t.status[target]} — that is not an allowed transition.`,
      );
      return;
    }
    move.mutate({ id: task.id, status: target });
  }

  return (
    <>
      <PageHeader
        title={t.nav.taskBoard}
        subtitle={`${tasks.length} tasks in ${user?.department?.name ?? 'your department'}`}
        breadcrumbs={[{ label: t.nav.manager }, { label: t.nav.taskBoard }]}
        action={
          <>
            <Button variant="secondary" size="sm" onClick={() => setBulkOpen(true)}>
              <Users className="h-4 w-4" aria-hidden />
              {t.manager.bulkAssign}
            </Button>
            <Button data-tour="new-task-btn" size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              {t.manager.newTask}
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Reference number or title…"
              aria-label={t.common.search}
              className="pl-9"
            />
          </div>
          <div className="w-56">
            <Select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              aria-label="Filter by assignee"
            >
              <option value="">{t.common.all} assignees</option>
              {(workload.data?.items ?? []).map((w) => (
                <option key={w.userId} value={w.userId}>
                  {w.name} ({w.activeLoad})
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="font-medium underline">
            {t.common.close}
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUSES.map((s) => (
            <SkeletonCard key={s} rows={4} />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div data-tour="kanban-board" className="grid gap-3 scroll-mt-24 md:grid-cols-2 xl:grid-cols-4">
            {TASK_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={tasks.filter((task) => task.status === status)}
                onSelect={setSelected}
                draggingFrom={dragging?.status}
              />
            ))}
          </div>

          <DragOverlay>
            {dragging ? (
              <div className="w-64 rotate-2 rounded-btn border border-primary-200 bg-white p-2.5 shadow-pop">
                <span className="font-mono text-[11px] text-primary">{dragging.refNo}</span>
                <p className="mt-1 text-sm text-slate-800">{dragging.title}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Drag a card between columns to change its status. Every move is validated against the
        workflow rules and written to the audit chain.
      </p>

      <TaskDrawer taskId={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
      <NewTaskModal open={newOpen} onOpenChange={setNewOpen} />
      <BulkAssignModal open={bulkOpen} onOpenChange={setBulkOpen} tasks={tasks} />
    </>
  );
}

function Column({
  status,
  tasks,
  onSelect,
  draggingFrom,
}: {
  status: TaskStatus;
  tasks: TaskDTO[];
  onSelect: (id: string) => void;
  draggingFrom?: TaskStatus;
}) {
  const { t } = useI18n();
  const { isOver, setNodeRef } = useDroppable({ id: status });

  // Highlight only the columns this card is actually allowed to move to.
  const allowed = draggingFrom ? canTransition(draggingFrom, status) : true;
  const isSource = draggingFrom === status;

  return (
    <section
      ref={setNodeRef}
      aria-label={t.status[status]}
      className={cn(
        'gt-card flex flex-col transition-colors',
        isOver && allowed && 'ring-2 ring-primary',
        draggingFrom && !allowed && !isSource && 'opacity-45',
      )}
    >
      <div className="flex items-center justify-between border-b border-borderx px-3 py-2.5">
        <StatusChip status={status} />
        <span className="tabular text-sm font-medium text-slate-500">{tasks.length}</span>
      </div>
      <div className="thin-scroll flex-1 space-y-2 overflow-y-auto p-2" style={{ minHeight: 200, maxHeight: 620 }}>
        {tasks.length === 0 ? (
          <EmptyState title={t.common.none} className="py-6" />
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} onSelect={onSelect} />)
        )}
      </div>
    </section>
  );
}

function TaskCard({ task, onSelect }: { task: TaskDTO; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-btn border border-borderx bg-white p-2.5 transition-shadow hover:shadow-cardHover',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle is separate from the click target so keyboard users can still
            open the drawer without triggering a drag. */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none rounded text-slate-300 hover:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
          aria-label={`Drag ${task.refNo}`}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>

        <button onClick={() => onSelect(task.id)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-primary">{task.refNo}</span>
            <PriorityChip priority={task.priority} />
          </span>
          <span className="mt-1.5 block text-sm leading-snug text-slate-800">{task.title}</span>
          <span className="mt-2 flex items-center justify-between gap-2">
            {task.assignee ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Avatar name={task.assignee.name} seed={task.assignee.avatarSeed} size="xs" />
                <span className="truncate text-xs text-slate-500">{task.assignee.name}</span>
              </span>
            ) : (
              <span />
            )}
            {task.status !== 'COMPLETED' ? (
              <SlaChip hoursRemaining={task.hoursRemaining} isOverdue={task.isOverdue} />
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
}

function BulkAssignModal({
  open,
  onOpenChange,
  tasks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: TaskDTO[];
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const workload = useQuery({
    queryKey: ['workload', user?.departmentId],
    queryFn: () => api.workload(user?.departmentId),
    enabled: !!user?.departmentId && open,
  });

  const assign = useMutation({
    mutationFn: () => api.bulkAssign([...selected], assigneeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['workload'] });
      setSelected(new Set());
      setAssigneeId('');
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Bulk assignment failed'),
  });

  const open_tasks = tasks.filter((task) => task.status !== 'COMPLETED');

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t.manager.bulkAssign}
      description="Each reassignment is recorded as its own audit block."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            disabled={selected.size === 0 || !assigneeId}
            loading={assign.isPending}
            onClick={() => assign.mutate()}
          >
            Assign {selected.size || ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Assign to</p>
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assign to">
            <option value="">Select a person…</option>
            {[...(workload.data?.items ?? [])]
              .sort((a, b) => a.activeLoad - b.activeLoad)
              .map((w) => (
                <option key={w.userId} value={w.userId}>
                  {w.name} — {w.activeLoad} active
                </option>
              ))}
          </Select>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Tasks ({selected.size} selected)
          </p>
          <div className="thin-scroll max-h-72 space-y-1 overflow-y-auto rounded-btn border border-borderx p-1.5">
            {open_tasks.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">{t.empty.noTasks}</p>
            ) : (
              open_tasks.map((task) => (
                <label
                  key={task.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-btn px-2.5 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(task.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                      })
                    }
                    className="h-4 w-4 rounded border-borderx text-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-[11px] text-primary">{task.refNo}</span>
                    <span className="block truncate text-sm text-slate-800">{task.title}</span>
                  </span>
                  <StatusChip status={task.status} />
                </label>
              ))
            )}
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-btn bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
