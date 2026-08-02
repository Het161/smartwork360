'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRIORITIES, type Priority } from '@smartwork/shared';
import { CheckCircle2, Clock, Globe, Link2, Plug, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { SkeletonCard } from '@/components/ui/states';
import { cn } from '@/lib/utils';

const INTEGRATIONS = [
  {
    name: 'Parichay SSO',
    detail: 'NIC single sign-on for government employees',
    status: 'sandbox' as const,
    note: 'Simulated flow — real integration needs NIC onboarding and a departmental MoU.',
  },
  {
    name: 'NIC Cloud (MeghRaj)',
    detail: 'Government cloud hosting',
    status: 'planned' as const,
    note: 'Deployment target for production; the prototype runs locally.',
  },
  {
    name: 'Ethereum / Hyperledger anchoring',
    detail: 'Publish Merkle checkpoints to a public chain',
    status: 'planned' as const,
    note: 'Merkle roots are already computed every 100 blocks; no chain transaction is made.',
  },
  {
    name: 'e-Office file movement',
    detail: 'Two-way sync with the existing file system',
    status: 'planned' as const,
    note: 'Requires departmental API access.',
  },
];

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const qc = useQueryClient();

  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api.departments() });
  const [deptId, setDeptId] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!deptId && departments.data?.items.length) setDeptId(departments.data.items[0].id);
  }, [departments.data, deptId]);

  const policies = useQuery({
    queryKey: ['sla-policies', deptId],
    queryFn: () => api.slaPolicies(deptId),
    enabled: !!deptId,
  });

  const [draft, setDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    if (policies.data) {
      setDraft(Object.fromEntries(policies.data.items.map((p) => [p.priority, p.hours])));
    }
  }, [policies.data]);

  const save = useMutation({
    mutationFn: ({ priority, hours }: { priority: Priority; hours: number }) =>
      api.setSlaPolicy(deptId, { departmentId: deptId, priority, hours }),
    onSuccess: (_res, vars) => {
      setSaved(`${t.priority[vars.priority]} SLA saved — the change is recorded in the audit chain.`);
      void qc.invalidateQueries({ queryKey: ['sla-policies', deptId] });
      void qc.invalidateQueries({ queryKey: ['sla'] });
    },
  });

  return (
    <>
      <PageHeader
        title={t.nav.settings}
        breadcrumbs={[{ label: t.nav.admin }, { label: t.nav.settings }]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* SLA policy editor */}
        <Card data-tour="sla-editor" className="scroll-mt-24">
          <CardHeader
            icon={<Clock className="h-4 w-4 text-primary" aria-hidden />}
            title={t.admin.slaPolicies}
            hint="Deadline window applied to new tasks, per priority"
            action={
              <div className="w-40">
                <Select
                  value={deptId}
                  onChange={(e) => setDeptId(e.target.value)}
                  aria-label="Department"
                >
                  {(departments.data?.items ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
            }
          />
          <CardBody>
            {policies.isLoading ? (
              <SkeletonCard rows={4} className="border-0 shadow-none" />
            ) : (
              <ul className="space-y-2.5">
                {PRIORITIES.map((priority) => {
                  const current = policies.data?.items.find((p) => p.priority === priority);
                  const value = draft[priority] ?? current?.hours ?? 0;
                  const changed = current ? value !== current.hours : false;
                  return (
                    <li key={priority} className="flex items-center gap-3">
                      <span className="w-24 text-base text-slate-700">{t.priority[priority]}</span>
                      <Input
                        type="number"
                        min={1}
                        value={value}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [priority]: Number(e.target.value) }))
                        }
                        className="w-28"
                        aria-label={`${t.priority[priority]} SLA hours`}
                      />
                      <span className="text-sm text-slate-500">hours</span>
                      <Button
                        size="sm"
                        variant={changed ? 'primary' : 'ghost'}
                        disabled={!changed || value < 1}
                        loading={save.isPending && save.variables?.priority === priority}
                        onClick={() => save.mutate({ priority, hours: value })}
                        className="ml-auto"
                      >
                        {t.common.save}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {saved ? (
              <p className="mt-3 flex items-center gap-2 rounded-btn bg-success-soft px-3 py-2 text-sm text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {saved}
              </p>
            ) : null}
          </CardBody>
        </Card>

        {/* Language */}
        <Card className="h-fit">
          <CardHeader
            icon={<Globe className="h-4 w-4 text-primary" aria-hidden />}
            title={t.admin.defaultLanguage}
            hint="Applies to this browser; stored locally"
          />
          <CardBody>
            <div className="flex gap-2">
              {(
                [
                  ['en', 'English'],
                  ['hi', 'हिंदी'],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  className={cn(
                    'flex-1 rounded-btn border px-4 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    lang === code
                      ? 'border-primary bg-primary-50 font-medium text-primary'
                      : 'border-borderx text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Navigation, page titles, KPI labels, status names and buttons are translated. Task
              content stays in the language it was authored in — translating a citizen&apos;s file note
              would misrepresent the record.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Integrations */}
      <Card className="mt-4">
        <CardHeader
          icon={<Plug className="h-4 w-4 text-primary" aria-hidden />}
          title={t.admin.integrations}
          hint="Honest status of each external system"
        />
        <ul className="divide-y divide-borderx">
          {INTEGRATIONS.map((integration) => (
            <li key={integration.name} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-md font-medium text-slate-900">
                  {integration.name}
                  {integration.status === 'sandbox' ? (
                    <Badge tone="saffron">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      Sandbox
                    </Badge>
                  ) : (
                    <Badge tone="slate">
                      <Link2 className="h-3 w-3" aria-hidden />
                      Planned
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{integration.detail}</p>
                <p className="mt-1 text-sm text-slate-500">{integration.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
