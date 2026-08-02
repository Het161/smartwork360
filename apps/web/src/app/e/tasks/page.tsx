'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PRIORITIES, TASK_STATUSES, type TaskDTO, type TaskStatus } from '@smartwork/shared';
import { KanbanSquare, Search, Table2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { TaskTable } from '@/components/tasks/task-table';
import { TaskDrawer } from '@/components/tasks/task-drawer';
import { PriorityChip, SlaChip, StatusChip } from '@/components/chips';
import { EmptyState, SkeletonCard } from '@/components/ui/states';
import { cn } from '@/lib/utils';

export default function MyTasksPage() {
  return (
    <Suspense fallback={<SkeletonCard rows={6} />}>
      <MyTasks />
    </Suspense>
  );
}

function MyTasks() {
  const { t } = useI18n();
  const params = useSearchParams();

  const [view, setView] = useState<'table' | 'board'>('table');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [selected, setSelected] = useState<string | null>(params.get('task'));

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'mine', q, status, priority],
    queryFn: () =>
      api.tasks({
        q: q || undefined,
        status: status || undefined,
        priority: priority || undefined,
        pageSize: 100,
        sort: 'dueDate',
        order: 'asc',
      }),
  });

  const tasks = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t.nav.myTasks}
        subtitle={`${data?.total ?? 0} tasks assigned to you`}
        breadcrumbs={[{ label: t.nav.employee }, { label: t.nav.myTasks }]}
        action={
          <div className="flex items-center rounded-btn border border-borderx p-0.5" role="group">
            <button
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
              className={cn(
                'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs font-medium',
                view === 'table' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <Table2 className="h-3.5 w-3.5" aria-hidden />
              {t.employee.tableView}
            </button>
            <button
              onClick={() => setView('board')}
              aria-pressed={view === 'board'}
              className={cn(
                'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs font-medium',
                view === 'board' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <KanbanSquare className="h-3.5 w-3.5" aria-hidden />
              {t.employee.boardView}
            </button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-3">
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
          <div className="w-40">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
              <option value="">{t.common.all} statuses</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.status[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              aria-label="Priority filter"
            >
              <option value="">{t.common.all} priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t.priority[p]}
                </option>
              ))}
            </Select>
          </div>
          {(q || status || priority) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ('');
                setStatus('');
                setPriority('');
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {view === 'table' ? (
        <Card>
          <TaskTable tasks={tasks} loading={isLoading} onSelect={(task) => setSelected(task.id)} />
        </Card>
      ) : (
        <BoardView tasks={tasks} loading={isLoading} onSelect={setSelected} />
      )}

      <TaskDrawer taskId={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}

function BoardView({
  tasks,
  loading,
  onSelect,
}: {
  tasks: TaskDTO[];
  loading?: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((s) => (
          <SkeletonCard key={s} rows={3} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((task) => task.status === status);
        return (
          <section key={status} className="gt-card flex flex-col" aria-label={t.status[status]}>
            <div className="flex items-center justify-between border-b border-borderx px-3 py-2.5">
              <StatusChip status={status as TaskStatus} />
              <span className="tabular text-sm font-medium text-slate-500">{column.length}</span>
            </div>
            <div className="thin-scroll flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: 560 }}>
              {column.length === 0 ? (
                <EmptyState title={t.common.none} className="py-6" />
              ) : (
                column.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onSelect(task.id)}
                    className="w-full rounded-btn border border-borderx bg-white p-2.5 text-left transition-shadow hover:shadow-cardHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-primary">{task.refNo}</span>
                      <PriorityChip priority={task.priority} />
                    </span>
                    <span className="mt-1.5 block text-sm leading-snug text-slate-800">
                      {task.title}
                    </span>
                    {task.status !== 'COMPLETED' ? (
                      <span className="mt-2 block">
                        <SlaChip hoursRemaining={task.hoursRemaining} isOverdue={task.isOverdue} />
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
