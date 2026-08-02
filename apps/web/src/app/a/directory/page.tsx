'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ROLES, DEMO_PASSWORD, type UserDTO } from '@smartwork/shared';
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  MailCheck,
  Plus,
  Search,
  UserCog,
  UserX,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { pop, spring, useReducedMotion } from '@/lib/motion';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/input';
import { EmptyState, SkeletonTable } from '@/components/ui/states';
import { PersonCell } from '@/components/avatar';
import { cn } from '@/lib/utils';

export default function DirectoryPage() {
  const { t, pick } = useI18n();
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [userModal, setUserModal] = useState<UserDTO | 'new' | null>(null);
  const [deptModal, setDeptModal] = useState(false);
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const params = useSearchParams();

  // The admin notification for a new registration deep-links straight to the tab.
  useEffect(() => {
    if (params.get('tab') === 'pending') setTab('pending');
  }, [params]);

  const pending = useQuery({
    queryKey: ['pending-users'],
    queryFn: () => api.pendingUsers(),
    refetchInterval: 20_000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.approveUser(id),
    onSuccess: (res) => {
      setToast(`${res.user.name} approved — welcome email sent.`);
      void qc.invalidateQueries({ queryKey: ['pending-users'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      setTimeout(() => setToast(null), 5000);
    },
    onError: (err) => {
      setToast(err instanceof Error ? err.message : 'Approval failed');
      setTimeout(() => setToast(null), 5000);
    },
  });

  const pendingCount = pending.data?.items.filter((u) => u.status === 'PENDING_APPROVAL').length ?? 0;

  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api.departments() });
  const users = useQuery({
    queryKey: ['users', q, deptFilter, roleFilter],
    queryFn: () =>
      api.users({
        q: q || undefined,
        departmentId: deptFilter || undefined,
        role: roleFilter || undefined,
        includeInactive: true,
      }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.updateUser(id, { active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <>
      <PageHeader
        title={t.nav.departments}
        subtitle={`${departments.data?.items.length ?? 0} departments · ${users.data?.total ?? 0} people`}
        breadcrumbs={[{ label: t.nav.admin }, { label: t.nav.departments }]}
        action={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeptModal(true)}>
              <Building2 className="h-4 w-4" aria-hidden />
              {t.admin.addDepartment}
            </Button>
            <Button size="sm" onClick={() => setUserModal('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              {t.admin.addUser}
            </Button>
          </>
        }
      />

      {/* Departments */}
      <Card className="mb-4">
        <CardHeader
          icon={<Building2 className="h-4 w-4 text-primary" aria-hidden />}
          title={t.admin.manageDepartments}
        />
        <ul className="grid gap-px bg-borderx sm:grid-cols-2 xl:grid-cols-4">
          {(departments.data?.items ?? []).map((d) => (
            <li key={d.id} className="bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-md font-semibold text-slate-900">
                    {pick(d.name, d.nameHi)}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500" lang="hi">
                    {d.nameHi}
                  </p>
                </div>
                <Badge tone="slate">{d.code}</Badge>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {d.userCount} people
              </p>
            </li>
          ))}
        </ul>
      </Card>

      {/* Users */}
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-borderx px-4 py-2.5">
          <div className="flex items-center gap-1" role="tablist" aria-label="User views">
            {(
              [
                ['all', t.admin.manageUsers],
                ['pending', 'Pending approvals'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-2 rounded-btn px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  tab === key ? 'bg-primary-50 text-primary' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {key === 'all' ? (
                  <UserCog className="h-4 w-4" aria-hidden />
                ) : (
                  <Clock className="h-4 w-4" aria-hidden />
                )}
                {label}
                {key === 'pending' && pendingCount > 0 ? (
                  <motion.span
                    // Pops when the count changes so a new registration is noticed
                    // without the admin having to be watching the tab.
                    key={pendingCount}
                    initial={reduced ? { opacity: 0 } : { scale: 0.6 }}
                    animate={reduced ? { opacity: 1 } : { scale: 1 }}
                    transition={pop}
                    className="grid h-5 min-w-5 place-items-center rounded-full bg-warning px-1 text-[11px] font-semibold text-white"
                  >
                    {pendingCount}
                  </motion.span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {toast ? (
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              className="overflow-hidden border-b border-borderx bg-success-soft"
            >
              <p className="flex items-center gap-2 px-4 py-2.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                {toast}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {tab === 'all' ? (
        <>
        <div className="flex flex-wrap items-center gap-3 border-b border-borderx p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email or designation…"
              aria-label={t.common.search}
              className="pl-9"
            />
          </div>
          <div className="w-44">
            <Select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              aria-label="Department filter"
            >
              <option value="">{t.common.all} departments</option>
              {(departments.data?.items ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role filter">
              <option value="">{t.common.all} roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {users.isLoading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : (users.data?.items ?? []).length === 0 ? (
          <EmptyState title={t.empty.noUsers} body={t.empty.noResults} />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <caption className="sr-only">User directory</caption>
              <thead>
                <tr className="border-b border-borderx bg-slate-50/70">
                  {['Person', 'Email', 'Role', 'Department', 'Status', ''].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      scope="col"
                      className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(users.data?.items ?? []).map((u) => (
                  <tr
                    key={u.id}
                    className={cn('border-b border-borderx last:border-0 hover:bg-slate-50', !u.active && 'opacity-55')}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setUserModal(u)}
                        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <PersonCell name={u.name} designation={u.designation} seed={u.avatarSeed} size="xs" />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">{u.email}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={u.role === 'ADMIN' ? 'violet' : u.role === 'MANAGER' ? 'blue' : 'slate'}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">{u.department?.name}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive.mutate({ id: u.id, active: !u.active })}
                        loading={toggleActive.isPending && toggleActive.variables?.id === u.id}
                      >
                        <UserX className="h-3.5 w-3.5" aria-hidden />
                        {u.active ? t.admin.deactivate : t.admin.activate}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>
        ) : (
          <PendingTable
            users={pending.data?.items ?? []}
            loading={pending.isLoading}
            onApprove={(id) => approve.mutate(id)}
            approvingId={approve.isPending ? (approve.variables as string) : null}
          />
        )}
      </Card>

      <UserModal
        state={userModal}
        onClose={() => setUserModal(null)}
        departments={departments.data?.items ?? []}
      />
      <DepartmentModal open={deptModal} onClose={() => setDeptModal(false)} />
    </>
  );
}

function UserModal({
  state,
  onClose,
  departments,
}: {
  state: UserDTO | 'new' | null;
  onClose: () => void;
  departments: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const isNew = state === 'new';
  const existing = state && state !== 'new' ? state : null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [role, setRole] = useState<string>('EMPLOYEE');
  const [departmentId, setDepartmentId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Sync the form when a different user is opened.
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const currentId = existing?.id ?? (isNew ? 'new' : null);
  if (currentId !== syncedId) {
    setSyncedId(currentId);
    setName(existing?.name ?? '');
    setEmail(existing?.email ?? '');
    setDesignation(existing?.designation ?? '');
    setRole(existing?.role ?? 'EMPLOYEE');
    setDepartmentId(existing?.departmentId ?? departments[0]?.id ?? '');
    setErrors({});
    setFormError(null);
  }

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.createUser({ name, email, designation, role, departmentId, password: DEMO_PASSWORD })
        : api.updateUser(existing!.id, { name, email, designation, role, departmentId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['departments'] });
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details?.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      } else {
        setFormError(err instanceof Error ? err.message : 'Save failed');
      }
    },
  });

  const valid = name.trim().length >= 2 && email.includes('@') && designation.trim() && departmentId;

  return (
    <Modal
      open={!!state}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? t.admin.addUser : `Edit ${existing?.name ?? ''}`}
      description={isNew ? `New accounts start with the password ${DEMO_PASSWORD}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" htmlFor="u-name" required error={errors.name}>
          <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Anita Rao" />
        </Field>
        <Field label="Email" htmlFor="u-email" required error={errors.email}>
          <Input
            id="u-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="anita.rao@gov.in"
          />
        </Field>
        <Field label="Designation" htmlFor="u-desig" required error={errors.designation}>
          <Input
            id="u-desig"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Section Officer"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" htmlFor="u-role" required>
            <Select id="u-role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department" htmlFor="u-dept" required>
            <Select id="u-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
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

function DepartmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.createDepartment({ code: code.toUpperCase(), name, nameHi }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['departments'] });
      setCode('');
      setName('');
      setNameHi('');
      setError(null);
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not create the department'),
  });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t.admin.addDepartment}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            disabled={code.length < 2 || name.length < 2 || nameHi.length < 1}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Code" htmlFor="d-code" required hint="2–12 letters, used in task reference numbers">
          <Input
            id="d-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="AGR"
            maxLength={12}
          />
        </Field>
        <Field label="Name (English)" htmlFor="d-name" required>
          <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agriculture" />
        </Field>
        <Field label="नाम (हिंदी)" htmlFor="d-namehi" required>
          <Input
            id="d-namehi"
            lang="hi"
            value={nameHi}
            onChange={(e) => setNameHi(e.target.value)}
            placeholder="कृषि"
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-btn bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * Registrations waiting on an administrator.
 *
 * Approved rows exit with a collapse+fade rather than vanishing, so the admin can
 * see which row they just acted on — with a list this short, an instant
 * disappearance reads as "did that work?".
 */
function PendingTable({
  users,
  loading,
  onApprove,
  approvingId,
}: {
  users: UserDTO[];
  loading?: boolean;
  onApprove: (id: string) => void;
  approvingId: string | null;
}) {
  const reduced = useReducedMotion();

  if (loading) return <SkeletonTable rows={3} cols={5} />;

  if (users.length === 0) {
    return (
      <EmptyState
        icon={<BadgeCheck className="h-5 w-5" aria-hidden />}
        title="Nothing awaiting approval"
        body="New self-registrations appear here once the applicant has verified their email address."
      />
    );
  }

  return (
    <div className="thin-scroll overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <caption className="sr-only">Registrations awaiting approval</caption>
        <thead>
          <tr className="border-b border-borderx bg-slate-50/70">
            {['Applicant', 'Department', 'Email verified', 'Registered', ''].map((h, i) => (
              <th
                key={`${h}-${i}`}
                scope="col"
                className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <AnimatePresence initial={false}>
          <tbody>
            {users.map((u) => {
              const verified = u.status === 'PENDING_APPROVAL';
              return (
                <motion.tr
                  key={u.id}
                  layout={!reduced}
                  exit={
                    reduced
                      ? { opacity: 0 }
                      : { opacity: 0, height: 0, transition: { duration: 0.3 } }
                  }
                  transition={spring}
                  className="border-b border-borderx last:border-0 hover:bg-slate-50"
                >
                  <td className="px-3 py-2.5">
                    <PersonCell name={u.name} designation={u.designation} seed={u.avatarSeed} size="xs" />
                    <span className="mt-0.5 block text-xs text-slate-500">{u.email}</span>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-600">{u.department?.name}</td>
                  <td className="px-3 py-2.5">
                    {verified ? (
                      <Badge tone="green">
                        <MailCheck className="h-3 w-3" aria-hidden />
                        Verified
                      </Badge>
                    ) : (
                      <Badge tone="amber">
                        <Clock className="h-3 w-3" aria-hidden />
                        Awaiting OTP
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-500">
                    {new Date(u.createdAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="success"
                      // An unverified applicant cannot be approved — the server
                      // rejects it too, but disabling explains why up front.
                      disabled={!verified}
                      loading={approvingId === u.id}
                      onClick={() => onApprove(u.id)}
                      title={verified ? undefined : 'Applicant has not verified their email yet'}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      Approve
                    </Button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </AnimatePresence>
      </table>
    </div>
  );
}
