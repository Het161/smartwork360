'use client';

import { useEffect, useRef } from 'react';
import type { AuditEventDTO } from '@smartwork/shared';
import { Link2, Unlink } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTION_TONE: Record<string, string> = {
  GENESIS: 'bg-slate-800',
  TASK_CREATED: 'bg-primary',
  TASK_STATUS_CHANGED: 'bg-[#1D4ED8]',
  TASK_UPDATE_ADDED: 'bg-teal',
  TASK_APPROVED: 'bg-success',
  TASK_REJECTED: 'bg-danger',
  TASK_UPDATED: 'bg-[#6D28D9]',
  USER_CREATED: 'bg-slate-500',
  USER_UPDATED: 'bg-slate-500',
  DEPARTMENT_CREATED: 'bg-slate-500',
  SLA_POLICY_UPDATED: 'bg-warning',
  FRAUD_ALERT_REVIEWED: 'bg-warning',
  FRAUD_SCAN_RUN: 'bg-warning',
};

/**
 * Horizontal linked-block visual.
 *
 * Each card is one block; the connector between two cards is the prevHash link.
 * When verification reports a broken index, the connector INTO that block is drawn
 * severed — which is literally what failed, and reads instantly from the back of a
 * room.
 */
export function BlockChain({
  blocks,
  brokenIndex,
}: {
  blocks: AuditEventDTO[];
  brokenIndex?: number;
}) {
  const brokenRef = useRef<HTMLLIElement>(null);

  // The strip scrolls horizontally and only ~5 cards fit on screen. When a break
  // exists it must be the thing you see, not something you have to scroll to find.
  useEffect(() => {
    if (brokenIndex === undefined) return;
    brokenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [brokenIndex, blocks]);

  return (
    <div className="thin-scroll overflow-x-auto pb-2">
      <ol className="flex min-w-max items-stretch gap-0 px-1 py-2">
        {blocks.map((block, i) => {
          const isBroken = brokenIndex !== undefined && block.chainIndex === brokenIndex;
          const afterBroken = brokenIndex !== undefined && block.chainIndex > brokenIndex;

          return (
            <li
              key={block.id}
              ref={isBroken ? brokenRef : undefined}
              className="flex items-center"
            >
              {i > 0 ? <Connector severed={isBroken} dimmed={afterBroken} /> : null}

              <div
                className={cn(
                  'w-[168px] shrink-0 rounded-card border bg-white p-2.5 shadow-card transition-all',
                  isBroken
                    ? 'border-danger ring-2 ring-danger/40 animate-pulse-danger'
                    : afterBroken
                      ? 'border-borderx opacity-45'
                      : 'border-borderx',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[11px] font-semibold text-slate-500">
                    #{block.chainIndex}
                  </span>
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      ACTION_TONE[block.action] ?? 'bg-slate-400',
                    )}
                    aria-hidden
                  />
                </div>

                <p
                  className="mt-1.5 truncate text-[11px] font-medium text-slate-800"
                  title={block.action}
                >
                  {block.action.replace(/_/g, ' ').toLowerCase()}
                </p>
                <p className="truncate text-[11px] text-slate-500" title={block.actor?.name}>
                  {block.actor?.name ?? 'system'}
                </p>

                <p
                  className={cn(
                    'mt-1.5 truncate rounded bg-slate-50 px-1.5 py-1 font-mono text-[10px]',
                    isBroken ? 'text-danger' : 'text-slate-500',
                  )}
                  title={block.hash}
                >
                  {block.hash.slice(0, 12)}…
                </p>

                {isBroken ? (
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-danger">
                    Hash mismatch
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Connector({ severed, dimmed }: { severed: boolean; dimmed: boolean }) {
  if (severed) {
    return (
      <span className="flex w-10 shrink-0 items-center justify-center" aria-label="Broken link">
        <span className="h-0.5 w-3 bg-danger" />
        <Unlink className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
        <span className="h-0.5 w-3 bg-danger" />
      </span>
    );
  }
  return (
    <span
      className={cn('flex w-10 shrink-0 items-center justify-center', dimmed && 'opacity-40')}
      aria-hidden
    >
      <span className="h-0.5 w-3 bg-borderx" />
      <Link2 className="h-3 w-3 shrink-0 text-slate-300" />
      <span className="h-0.5 w-3 bg-borderx" />
    </span>
  );
}
