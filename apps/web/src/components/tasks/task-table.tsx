'use client';

import type { TaskDTO } from '@smartwork/shared';
import { ClipboardList } from 'lucide-react';
import { PriorityChip, SlaChip, StatusChip } from '../chips';
import { PersonCell } from '../avatar';
import { EmptyState, SkeletonTable } from '../ui/states';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/utils';

/**
 * Keyboard-accessible task table. Rows are real <button>s inside cells rather than
 * onClick <tr>s, so tabbing and Enter work without custom key handling.
 */
export function TaskTable({
  tasks,
  loading,
  onSelect,
  showAssignee = false,
  selectable,
  selectedIds,
  onToggleSelect,
}: {
  tasks: TaskDTO[];
  loading?: boolean;
  onSelect: (task: TaskDTO) => void;
  showAssignee?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const { t } = useI18n();

  if (loading) return <SkeletonTable rows={8} cols={showAssignee ? 6 : 5} />;
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-5 w-5" aria-hidden />}
        title={t.empty.noTasks}
        body={t.empty.noTasksBody}
      />
    );
  }

  return (
    <div className="thin-scroll overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <caption className="sr-only">Task list</caption>
        <thead>
          <tr className="border-b border-borderx bg-slate-50/70">
            {selectable ? <th scope="col" className="w-10 px-3 py-2.5" /> : null}
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reference
            </th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Title
            </th>
            {showAssignee ? (
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assignee
              </th>
            ) : null}
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Priority
            </th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t.employee.slaCountdown}
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, rowIndex) => (
            <tr
              key={task.id}
              {...(rowIndex === 0 ? { 'data-tour': 'task-row' } : {})}
              className={cn(
                'border-b border-borderx last:border-0 hover:bg-slate-50',
                task.isOverdue && 'bg-danger-soft/30',
              )}
            >
              {selectable ? (
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(task.id) ?? false}
                    onChange={() => onToggleSelect?.(task.id)}
                    aria-label={`Select ${task.refNo}`}
                    className="h-4 w-4 rounded border-borderx text-primary focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </td>
              ) : null}
              <td className="px-3 py-2.5">
                <button
                  onClick={() => onSelect(task)}
                  className="font-mono text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {task.refNo}
                </button>
              </td>
              <td className="max-w-[340px] px-3 py-2.5">
                <button
                  onClick={() => onSelect(task)}
                  className="block w-full truncate text-left text-base text-slate-800 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title={task.title}
                >
                  {task.title}
                </button>
              </td>
              {showAssignee ? (
                <td className="px-3 py-2.5">
                  {task.assignee ? (
                    <PersonCell
                      name={task.assignee.name}
                      designation={task.assignee.designation}
                      seed={task.assignee.avatarSeed}
                      size="xs"
                    />
                  ) : (
                    '—'
                  )}
                </td>
              ) : null}
              <td className="px-3 py-2.5">
                <PriorityChip priority={task.priority} />
              </td>
              <td className="px-3 py-2.5">
                <StatusChip status={task.status} />
              </td>
              <td className="px-3 py-2.5">
                {task.status === 'COMPLETED' ? (
                  <span className="text-sm text-slate-400">—</span>
                ) : (
                  <SlaChip hoursRemaining={task.hoursRemaining} isOverdue={task.isOverdue} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
