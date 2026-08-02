'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditEventDTO } from '@smartwork/shared';
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState, SkeletonTable } from '@/components/ui/states';
import { BlockChain } from '@/components/audit/block-chain';
import { cn } from '@/lib/utils';
import { emitTourEvent, TOUR_EVENTS } from '@/components/guide/tours/targets';

const ACTIONS = [
  'GENESIS',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_STATUS_CHANGED',
  'TASK_UPDATE_ADDED',
  'TASK_APPROVED',
  'TASK_REJECTED',
  'USER_CREATED',
  'USER_UPDATED',
  'DEPARTMENT_CREATED',
  'SLA_POLICY_UPDATED',
  'FRAUD_ALERT_REVIEWED',
  'FRAUD_SCAN_RUN',
];

export default function AuditExplorerPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  /** When set, the ledger shows only the window around the tampered block. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<AuditEventDTO | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verify = useQuery({ queryKey: ['verify'], queryFn: () => api.verifyChain() });
  const anchors = useQuery({ queryKey: ['anchors'], queryFn: () => api.anchors() });

  const brokenIndex = verify.data?.intact === false ? verify.data.firstBrokenIndex : undefined;

  /**
   * The linked-block strip shows the newest 12 blocks — UNLESS the chain is broken,
   * in which case it centres on the break. Showing the tail of a 960-block chain
   * while the failure sits at block #386 would hide the one thing the visual exists
   * to show.
   */
  const recent = useQuery({
    queryKey: ['audit-recent', brokenIndex],
    queryFn: () =>
      brokenIndex !== undefined
        ? api.auditEvents({
            fromIndex: Math.max(0, brokenIndex - 4),
            toIndex: brokenIndex + 4,
            pageSize: 12,
            order: 'asc',
          })
        : api.auditEvents({ page: 1, pageSize: 12 }),
  });

  const events = useQuery({
    queryKey: ['audit-events', page, action, entityId, focusIndex],
    queryFn: () =>
      api.auditEvents({
        page,
        pageSize: 25,
        action: action || undefined,
        entityId: entityId || undefined,
        ...(focusIndex !== null
          ? { fromIndex: Math.max(0, focusIndex - 12), toIndex: focusIndex + 12 }
          : {}),
      }),
  });

  /**
   * Re-verify with a brief deliberate delay.
   *
   * Verification of ~1000 blocks completes in about 10ms, which on stage looks
   * like nothing happened at all. A short spinner makes the work visible without
   * misrepresenting it — the real duration is printed alongside.
   */
  const runVerify = useMutation({
    mutationFn: async () => {
      setVerifying(true);
      const [result] = await Promise.all([
        api.verifyChain(),
        new Promise((r) => setTimeout(r, 650)),
      ]);
      return result;
    },
    onSuccess: (result) => {
      qc.setQueryData(['verify'], result);
      emitTourEvent(TOUR_EVENTS.chainVerified, { intact: result.intact });
      void qc.invalidateQueries({ queryKey: ['audit-recent'] });
      void qc.invalidateQueries({ queryKey: ['audit-events'] });
      setVerifying(false);
    },
    onError: () => setVerifying(false),
  });

  const chain = verify.data;
  const intact = chain?.intact ?? true;
  // The break window already arrives oldest-first; the newest-12 view is
  // newest-first and needs reversing so the visual reads left to right in order.
  const blocks =
    brokenIndex !== undefined
      ? (recent.data?.items ?? [])
      : [...(recent.data?.items ?? [])].reverse();

  return (
    <>
      <PageHeader
        title={t.audit.title}
        subtitle={t.audit.subtitle}
        breadcrumbs={[{ label: t.nav.admin }, { label: t.nav.auditExplorer }]}
        action={
          <Button
            data-tour="verify-chain"
            size="sm"
            variant={intact ? 'primary' : 'danger'}
            loading={verifying}
            onClick={() => runVerify.mutate()}
          >
            {!verifying ? <RefreshCw className="h-4 w-4" aria-hidden /> : null}
            {verifying ? t.audit.verifying : t.audit.verify}
          </Button>
        }
      />

      {/* Status banner — the moment the whole demo turns on. */}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'mb-4 flex flex-wrap items-center gap-4 rounded-card border p-5 transition-colors',
          verify.isLoading
            ? 'border-borderx bg-white'
            : intact
              ? 'border-success/30 bg-success-soft'
              : 'border-danger/40 bg-danger-soft animate-pulse-danger',
        )}
      >
        <span
          className={cn(
            'grid h-14 w-14 shrink-0 place-items-center rounded-full',
            verify.isLoading ? 'bg-slate-100 text-slate-400' : intact ? 'bg-success text-white' : 'bg-danger text-white',
          )}
          aria-hidden
        >
          {verifying || verify.isLoading ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : intact ? (
            <ShieldCheck className="h-7 w-7" />
          ) : (
            <ShieldAlert className="h-7 w-7" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          {verify.isLoading ? (
            <p className="text-xl font-semibold text-slate-500">{t.audit.verifying}</p>
          ) : intact ? (
            <>
              <p className="text-2xl font-semibold text-success">{t.audit.intact}</p>
              <p className="mt-0.5 text-base text-slate-700">
                <strong className="tabular">{chain?.checkedCount ?? 0}</strong> {t.audit.intactBody}
                {' · '}
                {t.audit.verifiedIn} <strong className="tabular">{chain?.durationMs ?? 0}ms</strong>
              </p>
              {chain?.headHash ? (
                <p className="mt-1 truncate font-mono text-xs text-slate-500">
                  head {chain.headHash.slice(0, 32)}…
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold text-danger">
                {t.audit.broken} — {t.audit.brokenAt} #{chain?.firstBrokenIndex}
              </p>
              <p className="mt-0.5 text-base text-slate-700">{chain?.brokenReason}</p>
              <p className="mt-1 text-sm text-slate-600">
                {chain?.checkedCount ?? 0} blocks scanned in {chain?.durationMs ?? 0}ms. Restore with{' '}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">npm run demo:reset</code>.
              </p>
              <Button
                variant="danger"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setFocusIndex(chain?.firstBrokenIndex ?? null);
                  setPage(1);
                  document
                    .getElementById('audit-ledger')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                Show block #{chain?.firstBrokenIndex} in the ledger
              </Button>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={intact ? 'green' : 'red'}>SHA-256 hash chain</Badge>
          <Badge tone="slate">
            {anchors.data?.total ?? 0} {t.audit.checkpoints}
          </Badge>
        </div>
      </div>

      {/* Linked blocks */}
      <Card className="mb-4">
        <CardHeader
          icon={<Boxes className="h-4 w-4 text-primary" aria-hidden />}
          title={t.audit.recentBlocks}
          hint="Each connector is a prevHash link — a severed link is a failed verification"
        />
        <CardBody className="pt-2">
          {recent.isLoading ? (
            <SkeletonTable rows={2} cols={6} />
          ) : (
            <BlockChain blocks={blocks} brokenIndex={intact ? undefined : chain?.firstBrokenIndex} />
          )}
        </CardBody>
      </Card>

      {!intact ? (
        <Card className="mb-4 border-l-[3px] border-l-danger">
          <CardBody className="flex flex-wrap items-start gap-3">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0 flex-1 text-sm text-slate-700">
              <p className="font-medium text-slate-900">What just happened</p>
              <p className="mt-1">
                A row in <code className="font-mono text-xs">smartwork.audit_events</code> was edited
                by direct SQL, bypassing the service that appends blocks. The row still looks normal
                in the database — nothing about it is marked as altered. Only recomputing the chain
                reveals it, because block #{chain?.firstBrokenIndex} no longer hashes to the value
                stored alongside it, and every block after it inherits the break.
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* Checkpoints */}
      {anchors.data?.items.length ? (
        <Card className="mb-4">
          <CardHeader
            title={t.audit.checkpoints}
            hint="A Merkle root is computed every 100 blocks. No real chain transaction is made."
          />
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Merkle checkpoints</caption>
              <thead>
                <tr className="border-b border-borderx bg-slate-50/70">
                  {['Checkpoint', 'Blocks', t.audit.merkleRoot, t.audit.anchorStatus].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {anchors.data.items.map((a) => (
                  <tr key={a.id} className="border-b border-borderx last:border-0">
                    <td className="tabular px-3 py-2 text-base text-slate-800">#{a.anchorIndex}</td>
                    <td className="tabular px-3 py-2 text-sm text-slate-600">
                      {a.fromIndex}–{a.toIndex}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">
                      {a.merkleRoot.slice(0, 28)}…
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="slate">{a.externalTxHash}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Searchable ledger */}
      <Card id="audit-ledger">
        <CardHeader
          title={t.audit.allEvents}
          hint={
            focusIndex !== null
              ? `Showing blocks ${Math.max(0, focusIndex - 12)}–${focusIndex + 12} around the break`
              : `${events.data?.total ?? 0} blocks`
          }
          action={
            <div className="flex flex-wrap gap-2">
              {focusIndex !== null ? (
                <Button variant="secondary" size="sm" onClick={() => setFocusIndex(null)}>
                  Clear focus
                </Button>
              ) : null}
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  value={entityId}
                  onChange={(e) => {
                    setEntityId(e.target.value);
                    setPage(1);
                  }}
                  data-tour="audit-search"
                  placeholder="Entity ID…"
                  aria-label="Filter by entity"
                  className="w-52 pl-9"
                />
              </div>
              <Select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by action"
                className="w-52"
              >
                <option value="">{t.common.all} actions</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {events.isLoading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : (events.data?.items ?? []).length === 0 ? (
          <EmptyState title={t.empty.noResults} body="No audit blocks match these filters." />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <caption className="sr-only">Audit ledger</caption>
              <thead>
                <tr className="border-b border-borderx bg-slate-50/70">
                  {[t.audit.block, t.audit.action, t.audit.actor, t.audit.entity, t.audit.hash, t.audit.time].map(
                    (h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {(events.data?.items ?? []).map((e) => {
                  const isBroken = !intact && e.chainIndex === chain?.firstBrokenIndex;
                  return (
                    <tr
                      key={e.id}
                      className={cn(
                        'border-b border-borderx last:border-0 hover:bg-slate-50',
                        isBroken && 'bg-danger-soft',
                      )}
                    >
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setSelected(e)}
                          className="tabular font-mono text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          #{e.chainIndex}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-base text-slate-800">
                        {e.action.replace(/_/g, ' ').toLowerCase()}
                        {isBroken ? (
                          <Badge tone="red" className="ml-2">
                            tampered
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-600">
                        {e.actor?.name ?? 'system'}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-500">
                        {e.entityType}
                        <span className="ml-1 font-mono text-xs text-slate-400">
                          {e.entityId.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {e.hash.slice(0, 16)}…
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-500">
                        {new Date(e.createdAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-borderx px-4 py-2.5">
          <p className="text-sm text-slate-500">
            {t.common.page} {events.data?.page ?? 1} {t.common.of} {events.data?.totalPages ?? 1}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={(events.data?.page ?? 1) <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              {t.common.previous}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={(events.data?.page ?? 1) >= (events.data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              {t.common.next}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </Card>

      <BlockDrawer block={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function BlockDrawer({ block, onClose }: { block: AuditEventDTO | null; onClose: () => void }) {
  const { t } = useI18n();

  const entity = useQuery({
    queryKey: ['audit-entity', block?.entityType, block?.entityId],
    queryFn: () => api.auditEntity(block!.entityType, block!.entityId),
    enabled: !!block,
  });

  return (
    <Drawer
      open={!!block}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={block ? `${t.audit.block} #${block.chainIndex}` : ''}
      description={block?.action.replace(/_/g, ' ').toLowerCase()}
    >
      {block ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Meta label={t.audit.actor} value={block.actor?.name ?? 'system'} />
            <Meta label={t.audit.time} value={new Date(block.createdAt).toLocaleString('en-IN')} />
            <Meta label={t.audit.entity} value={`${block.entityType} · ${block.entityId}`} mono />
            <Meta label="Role" value={block.actor?.role ?? '—'} />
          </div>

          <div>
            <p className="gt-label mb-1">{t.audit.prevHash}</p>
            <p className="break-all rounded-btn bg-slate-50 p-2.5 font-mono text-xs text-slate-600">
              {block.prevHash}
            </p>
          </div>
          <div>
            <p className="gt-label mb-1">{t.audit.hash}</p>
            <p className="break-all rounded-btn bg-primary-50 p-2.5 font-mono text-xs text-primary">
              {block.hash}
            </p>
          </div>

          <div>
            <p className="gt-label mb-1">{t.audit.payload}</p>
            <pre className="thin-scroll max-h-64 overflow-auto rounded-btn bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(block.payload, null, 2)}
            </pre>
          </div>

          <div>
            <p className="gt-label mb-2">
              Full history for this {block.entityType.toLowerCase()} ({entity.data?.total ?? 0} blocks)
            </p>
            <ul className="thin-scroll max-h-56 space-y-1 overflow-y-auto rounded-btn bg-slate-50 p-2">
              {(entity.data?.items ?? []).map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    'flex items-center gap-2 rounded px-1.5 py-1 text-xs',
                    e.id === block.id && 'bg-primary-100',
                  )}
                >
                  <span className="font-mono text-slate-400">#{e.chainIndex}</span>
                  <span className="font-medium text-slate-700">
                    {e.action.replace(/_/g, ' ').toLowerCase()}
                  </span>
                  <span className="text-slate-500">{e.actor?.name ?? 'system'}</span>
                  <span className="ml-auto font-mono text-slate-400">{e.hash.slice(0, 10)}…</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="gt-label mb-0.5">{label}</p>
      <p className={cn('truncate text-base text-slate-800', mono && 'font-mono text-xs')} title={value}>
        {value}
      </p>
    </div>
  );
}
