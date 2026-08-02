/**
 * SMARTWORK 360 — deterministic seed.
 *
 * Run: `npm run seed`  (or `npm run demo:reset` — same script, same result)
 *
 * Everything below is driven by a fixed-seed PRNG, so the database is byte-identical
 * on every run. That matters for a demo: the burnout card, the fraud alerts and the
 * SLA trend must look the same on stage as they did in rehearsal.
 *
 * Three demo patterns are planted deliberately (search "PLANTED"):
 *   1. BURNOUT — Ramesh Patel (PWD): 9 explicitly planted active tasks (5 of them
 *      overdue) on top of his share of the random allocation, plus after-hours
 *      activity and rising negative sentiment → surfaces as CRITICAL risk.
 *   2. FRAUD   — Vikas Meena (REV): 14 night-time status changes over two nights,
 *      3 self-approvals, one task completed in 4 minutes → 12 org-wide alerts, 11 of
 *      which are labelled confirmed-on-review (the honest 92% precision figure).
 *   3. SLA     — Health department breach cluster in week 6, recovering afterwards,
 *      so the trend charts narrate the "30–40% faster" improvement story.
 */

import {
  PrismaClient,
  type Prisma,
  type Priority,
  type Role,
  type TaskStatus,
  type TaskUpdateType,
} from '@prisma/client';
import { DEFAULT_SLA_HOURS, DEMO_PASSWORD, ANCHOR_INTERVAL } from '@smartwork/shared';
import { hashPassword } from '../src/auth/password';
import { linkEvents, merkleRoot, type UnlinkedEvent } from '../src/audit/hash';
import { LEXICON_MODEL_VERSION, scoreSentiment } from '../src/ml/lexicon';
import {
  ADMIN,
  ANNOUNCEMENTS,
  DEPARTMENTS,
  EMPLOYEES,
  MANAGERS,
  REVIEW_NOTES,
  TASK_DESCRIPTIONS,
  TASK_TITLES,
  UPDATE_NOTES,
  type PersonSpec,
} from './seed-data';

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ prng */

/** mulberry32 — small, fast, and identical across Node versions. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(360360);
const rand = () => rng();
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;

/* ------------------------------------------------------------------ time */

const NOW = new Date();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const daysAgo = (d: number, hour = 10, minute = 0) => {
  const date = new Date(NOW.getTime() - d * DAY);
  date.setHours(hour, minute, Math.floor(rand() * 60), 0);
  return date;
};

const addHours = (date: Date, h: number) => new Date(date.getTime() + h * HOUR);

/**
 * Snaps a timestamp into a plausible government office working day.
 *
 * Without this, interpolated update times spread uniformly across 24 hours and
 * EVERY employee ends up with a ~50% night-time activity ratio — which would make
 * the after-hours burnout factor and the fraud detector's `night_hour_ratio`
 * signal meaningless. Only the deliberately planted personas work at night.
 */
function officeHours(date: Date): Date {
  const d = new Date(date);
  // ~12% of updates land in the early evening (18:00–20:00); the rest 09:00–17:59.
  d.setHours(chance(0.12) ? randInt(18, 19) : randInt(9, 17), randInt(0, 59), randInt(0, 59), 0);
  // Saturday/Sunday work is rare — push weekend updates to the following Monday.
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1);
  else if (day === 6) d.setDate(d.getDate() + 2);
  return d;
}

/** ISO week bucket label, used by the SLA story and the trend charts. */
function weekStartOf(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* --------------------------------------------------------------- helpers */

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '.');
const emailFor = (name: string) => `${slug(name)}@gov.in`;
/** Stable avatar seed so initials/colours never shuffle between runs. */
const avatarSeedFor = (name: string) => slug(name).replace(/\./g, '-');

/** Audit blocks are collected here and linked into a chain at the very end. */
const auditQueue: UnlinkedEvent[] = [];

function audit(
  entityType: string,
  entityId: string,
  action: string,
  actorId: string | null,
  payload: Prisma.JsonObject,
  createdAt: Date,
) {
  auditQueue.push({ entityType, entityId, action, actorId, payload, createdAt });
}

/* ------------------------------------------------------------------ main */

async function main() {
  const isReset = process.argv.includes('--reset');
  console.log(`\n  SMARTWORK 360 — ${isReset ? 'resetting' : 'seeding'} database\n`);

  await wipe();

  /* -------------------------------------------------- departments + SLA */

  const deptByCode = new Map<string, { id: string; code: string; name: string }>();
  for (const spec of DEPARTMENTS) {
    const dept = await prisma.department.create({ data: spec });
    deptByCode.set(spec.code, dept);
    audit(
      'DEPARTMENT',
      dept.id,
      'DEPARTMENT_CREATED',
      null,
      { code: dept.code, name: dept.name },
      daysAgo(92, 9),
    );
  }

  // Health runs a tighter SLA than the rest — this is what makes its week-6
  // breach cluster (PLANTED #3) plausible rather than arbitrary.
  const slaOverrides: Record<string, Partial<Record<Priority, number>>> = {
    HLT: { CRITICAL: 12, HIGH: 24 },
    REV: { LOW: 240 },
  };

  for (const [code, dept] of deptByCode) {
    for (const priority of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Priority[]) {
      await prisma.sLAPolicy.create({
        data: {
          departmentId: dept.id,
          priority,
          hours: slaOverrides[code]?.[priority] ?? DEFAULT_SLA_HOURS[priority],
        },
      });
    }
  }

  /* ------------------------------------------------------------- users */

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const userByName = new Map<string, { id: string; name: string; departmentId: string; role: Role }>();

  async function createPerson(spec: PersonSpec, role: Role, createdDaysAgo: number) {
    const dept = deptByCode.get(spec.dept);
    if (!dept) throw new Error(`Unknown department ${spec.dept}`);
    const user = await prisma.user.create({
      data: {
        name: spec.name,
        email: emailFor(spec.name),
        passwordHash,
        role,
        designation: spec.designation,
        departmentId: dept.id,
        avatarSeed: avatarSeedFor(spec.name),
        createdAt: daysAgo(createdDaysAgo, 9),
      },
    });
    userByName.set(spec.name, user);
    audit(
      'USER',
      user.id,
      'USER_CREATED',
      null,
      { name: user.name, email: user.email, role, designation: spec.designation },
      daysAgo(createdDaysAgo, 9),
    );
    return user;
  }

  const admin = await createPerson(ADMIN, 'ADMIN', 91);
  const managers = new Map<string, { id: string; name: string }>();
  for (const spec of MANAGERS) {
    managers.set(spec.dept, await createPerson(spec, 'MANAGER', 90));
  }
  const employees: { spec: PersonSpec; user: { id: string; name: string; departmentId: string } }[] = [];
  for (const spec of EMPLOYEES) {
    employees.push({ spec, user: await createPerson(spec, 'EMPLOYEE', randInt(80, 89)) });
  }

  console.log(`  ✓ ${DEPARTMENTS.length} departments, ${userByName.size} users`);

  /* ------------------------------------------------------------- tasks */

  const refCounters = new Map<string, number>();
  const nextRefNo = (code: string, date: Date) => {
    const n = (refCounters.get(code) ?? 0) + 1;
    refCounters.set(code, n);
    return `${code}/${date.getFullYear()}/${String(n).padStart(4, '0')}`;
  };

  interface SeededTask {
    id: string;
    refNo: string;
    title: string;
    status: TaskStatus;
    priority: Priority;
    assigneeId: string;
    assigneeName: string;
    creatorId: string;
    departmentId: string;
    deptCode: string;
    createdAt: Date;
    dueDate: Date;
    completedAt: Date | null;
    slaHours: number;
  }

  const tasks: SeededTask[] = [];
  const titleCursor = new Map<string, number>();

  function nextTitle(code: string) {
    const pool = TASK_TITLES[code];
    const i = titleCursor.get(code) ?? 0;
    titleCursor.set(code, i + 1);
    // Cycle the pool, appending a batch marker so repeats still read naturally.
    const round = Math.floor(i / pool.length);
    const title = pool[i % pool.length];
    return round === 0 ? title : `${title} (batch ${round + 1})`;
  }

  async function createTask(opts: {
    deptCode: string;
    assignee: { id: string; name: string };
    status: TaskStatus;
    priority: Priority;
    createdDaysAgo: number;
    /** Hours from creation to due; defaults to the department SLA. */
    slaHours?: number;
    forceOverdue?: boolean;
    completeAfterHours?: number;
    /** Pins the deadline to N hours from now — used for the "Due Today" KPI. */
    dueInHours?: number;
  }): Promise<SeededTask> {
    const dept = deptByCode.get(opts.deptCode)!;
    const manager = managers.get(opts.deptCode)!;
    const createdAt = daysAgo(opts.createdDaysAgo, randInt(9, 16), randInt(0, 59));
    const slaHours =
      opts.slaHours ??
      (slaOverrides[opts.deptCode]?.[opts.priority] ?? DEFAULT_SLA_HOURS[opts.priority]);

    let dueDate = addHours(createdAt, slaHours);
    if (opts.forceOverdue && dueDate > NOW) {
      dueDate = new Date(NOW.getTime() - randInt(6, 96) * HOUR);
    } else if (opts.dueInHours !== undefined) {
      dueDate = new Date(NOW.getTime() + opts.dueInHours * HOUR);
    } else if (!opts.forceOverdue && opts.status !== 'COMPLETED' && dueDate < NOW) {
      // An open task whose SLA window has silently elapsed would read as overdue
      // without ever being counted as such. Push it into the future instead, so
      // the overdue total equals exactly the tasks we intended to be late.
      dueDate = new Date(NOW.getTime() + randInt(12, 260) * HOUR);
    }

    const refNo = nextRefNo(opts.deptCode, createdAt);

    const cycle =
      opts.status === 'COMPLETED'
        ? (opts.completeAfterHours ??
          randInt(Math.floor(slaHours * 0.3), Math.floor(slaHours * 1.2)))
        : null;

    // A sub-hour cycle is the planted "physically impossible turnaround" case. It
    // must survive verbatim, so the whole start→complete pair stays in minutes and
    // skips the working-hours snap entirely.
    const isSprint = cycle !== null && cycle < 1;

    // Workflow transitions otherwise happen during the working day — these become
    // audit blocks, and the fraud detector reads their hour-of-day.
    let startedAt: Date | null = null;
    if (opts.status !== 'PENDING') {
      startedAt = isSprint
        ? addHours(createdAt, cycle! * 0.3)
        : officeHours(addHours(createdAt, randInt(2, 30)));
    }

    let completedAt: Date | null = null;
    if (cycle !== null) {
      completedAt = isSprint ? addHours(createdAt, cycle) : officeHours(addHours(createdAt, cycle));
      if (completedAt > NOW) completedAt = new Date(NOW.getTime() - randInt(1, 20) * HOUR);
      // Snapping to office hours must never invert the workflow order.
      if (!isSprint && startedAt && completedAt <= startedAt) {
        completedAt = addHours(startedAt, randInt(2, 8));
      }
      if (completedAt > NOW) completedAt = new Date(NOW.getTime() - HOUR);
    }

    const task = await prisma.task.create({
      data: {
        refNo,
        title: nextTitle(opts.deptCode),
        description: pick(TASK_DESCRIPTIONS[opts.deptCode]),
        priority: opts.priority,
        status: opts.status,
        creatorId: manager.id,
        assigneeId: opts.assignee.id,
        departmentId: dept.id,
        dueDate,
        slaHours,
        startedAt,
        completedAt,
        createdAt,
        updatedAt: completedAt ?? startedAt ?? createdAt,
      },
    });

    audit(
      'TASK',
      task.id,
      'TASK_CREATED',
      manager.id,
      { refNo, title: task.title, priority: opts.priority, assigneeId: opts.assignee.id },
      createdAt,
    );

    // Each status transition is its own block — the chain tells the whole story.
    if (startedAt) {
      audit('TASK', task.id, 'TASK_STATUS_CHANGED', opts.assignee.id, { refNo, from: 'PENDING', to: 'IN_PROGRESS' }, startedAt);
    }
    if (opts.status === 'UNDER_REVIEW' && startedAt) {
      const reviewAt = officeHours(addHours(startedAt, randInt(4, 40)));
      audit('TASK', task.id, 'TASK_STATUS_CHANGED', opts.assignee.id, { refNo, from: 'IN_PROGRESS', to: 'UNDER_REVIEW' }, reviewAt > NOW ? NOW : reviewAt);
    }
    if (completedAt && startedAt) {
      const candidate = new Date(completedAt.getTime() - randInt(1, 8) * HOUR);
      const reviewAt = candidate > startedAt ? candidate : addHours(startedAt, 1);
      audit('TASK', task.id, 'TASK_STATUS_CHANGED', opts.assignee.id, { refNo, from: 'IN_PROGRESS', to: 'UNDER_REVIEW' }, reviewAt);
      audit('TASK', task.id, 'TASK_APPROVED', manager.id, { refNo, note: pick(REVIEW_NOTES.approve) }, completedAt);
      audit('TASK', task.id, 'TASK_STATUS_CHANGED', manager.id, { refNo, from: 'UNDER_REVIEW', to: 'COMPLETED' }, completedAt);
    }

    const seeded: SeededTask = {
      id: task.id,
      refNo,
      title: task.title,
      status: opts.status,
      priority: opts.priority,
      assigneeId: opts.assignee.id,
      assigneeName: opts.assignee.name,
      creatorId: manager.id,
      departmentId: dept.id,
      deptCode: opts.deptCode,
      createdAt,
      dueDate,
      completedAt,
      slaHours,
    };
    tasks.push(seeded);
    return seeded;
  }

  const employeesByDept = new Map<string, typeof employees>();
  for (const e of employees) {
    const list = employeesByDept.get(e.spec.dept) ?? [];
    list.push(e);
    employeesByDept.set(e.spec.dept, list);
  }

  const rameshEntry = employees.find((e) => e.spec.persona === 'burnout')!;
  const vikasEntry = employees.find((e) => e.spec.persona === 'fraud')!;

  /**
   * Target mix (~140 tasks):
   *   55 COMPLETED · 30 IN_PROGRESS · 22 PENDING · 13 UNDER_REVIEW · ~20 OVERDUE
   * The overdue ones are drawn from the non-completed buckets, matching reality —
   * a task is overdue *and* in-progress, not overdue instead of in-progress.
   */
  const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const weightedPriority = (): Priority => {
    const r = rand();
    if (r < 0.12) return 'CRITICAL';
    if (r < 0.4) return 'HIGH';
    if (r < 0.8) return 'MEDIUM';
    return 'LOW';
  };

  const plan: { status: TaskStatus; count: number; overdue: number }[] = [
    { status: 'COMPLETED', count: 55, overdue: 0 },
    { status: 'IN_PROGRESS', count: 30, overdue: 9 },
    { status: 'PENDING', count: 22, overdue: 6 },
    { status: 'UNDER_REVIEW', count: 13, overdue: 3 },
  ];

  for (const bucket of plan) {
    for (let i = 0; i < bucket.count; i += 1) {
      const deptCode = pick(DEPARTMENTS).code;
      const pool = employeesByDept.get(deptCode)!;
      const assignee = pick(pool).user;
      const forceOverdue = i < bucket.overdue;

      // Completed work is spread across the full 90-day window so the trend charts
      // have history; open work stays recent, because a real office does not carry
      // three-month-old pending files in its active queue.
      let createdDaysAgo = bucket.status === 'COMPLETED' ? randInt(2, 88) : randInt(1, 20);
      let slaHours: number | undefined;
      let completeAfterHours: number | undefined;
      // A handful of open tasks land inside today to populate the "Due Today" KPI.
      const dueInHours = !forceOverdue && bucket.status !== 'COMPLETED' && i < bucket.overdue + 3
        ? randInt(2, 9)
        : undefined;

      // PLANTED #3 — Health department SLA story. Tasks completed in week 6 (≈ days
      // 45–36 ago) get a compressed deadline so they breach; everything after week 5
      // recovers. This produces a visible dip-and-recovery in the trend charts.

      if (deptCode === 'HLT' && bucket.status === 'COMPLETED' && chance(0.45)) {
        createdDaysAgo = randInt(36, 45);
        slaHours = 18;
        completeAfterHours = randInt(30, 70); // breaches
      } else if (bucket.status === 'COMPLETED') {
        // Cycle times shrink over the window: older tasks are slower than recent
        // ones. This is what the "30–40% faster" analytics chart measures.
        const recencyFactor = createdDaysAgo > 45 ? randInt(75, 115) : randInt(40, 70);
        const base = DEFAULT_SLA_HOURS[weightedPriority()];
        completeAfterHours = Math.max(2, Math.round((base * recencyFactor) / 100));
      }

      await createTask({
        deptCode,
        assignee,
        status: bucket.status,
        priority: weightedPriority(),
        createdDaysAgo,
        slaHours,
        forceOverdue,
        completeAfterHours,
        dueInHours,
      });
    }
  }

  /* --------------- PLANTED #0 — Kavita Joshi, the demo EMPLOYEE account ---- */

  // The login screen offers Kavita as the Employee quick-login, so her dashboard is
  // the first thing a judge sees. She needs a full, healthy queue: a strong
  // completion record (all within SLA) plus live work in every column.
  const kavitaEntry = employees.find((e) => e.spec.name === 'Kavita Joshi')!;
  for (let i = 0; i < 10; i += 1) {
    await createTask({
      deptCode: 'REV',
      assignee: kavitaEntry.user,
      status: 'COMPLETED',
      priority: i % 3 === 0 ? 'HIGH' : 'MEDIUM',
      createdDaysAgo: randInt(8, 70),
      // Comfortably inside SLA — this is what a 90%+ on-time record looks like.
      completeAfterHours: randInt(14, 40),
    });
  }
  for (const [i, status] of (['IN_PROGRESS', 'IN_PROGRESS', 'PENDING', 'UNDER_REVIEW'] as TaskStatus[]).entries()) {
    await createTask({
      deptCode: 'REV',
      assignee: kavitaEntry.user,
      status,
      priority: i === 0 ? 'HIGH' : 'MEDIUM',
      createdDaysAgo: randInt(1, 9),
      dueInHours: i === 0 ? 6 : undefined,
    });
  }

  /* ------------------------------- PLANTED #1 — Ramesh Patel, burnout ---- */

  const rameshTasks: SeededTask[] = [];
  for (let i = 0; i < 9; i += 1) {
    rameshTasks.push(
      await createTask({
        deptCode: 'PWD',
        assignee: rameshEntry.user,
        status: i < 6 ? 'IN_PROGRESS' : 'PENDING',
        priority: i < 4 ? 'HIGH' : 'CRITICAL',
        createdDaysAgo: randInt(6, 26),
        forceOverdue: i < 5, // 5 overdue out of 9 active
      }),
    );
  }

  /* ---------------------------------- PLANTED #2 — Vikas Meena, fraud ---- */

  // 14 status changes squeezed into 01:00–03:00 on two consecutive nights.
  const vikasNightTasks: SeededTask[] = [];
  for (let i = 0; i < 14; i += 1) {
    vikasNightTasks.push(
      await createTask({
        deptCode: 'REV',
        assignee: vikasEntry.user,
        status: 'COMPLETED',
        priority: 'MEDIUM',
        createdDaysAgo: randInt(9, 14),
        completeAfterHours: randInt(20, 60),
      }),
    );
  }

  const nightAudit: { at: Date; task: SeededTask }[] = [];
  vikasNightTasks.forEach((task, i) => {
    const night = i < 7 ? 8 : 6; // two separate nights
    // All seven changes on each night land inside a SINGLE hour. A bulk record
    // rewrite is one sitting, not a leisurely spread — and this is what makes the
    // burst detectable as `actionsPerHour` rather than only as a night-time ratio.
    const at = daysAgo(night, i < 7 ? 1 : 2, randInt(0, 59));
    nightAudit.push({ at, task });
    audit('TASK', task.id, 'TASK_STATUS_CHANGED', vikasEntry.user.id, { refNo: task.refNo, from: 'IN_PROGRESS', to: 'UNDER_REVIEW', afterHours: true }, at);
  });

  // 3 self-approvals: the same user both submits and approves.
  const selfApproved = vikasNightTasks.slice(0, 3);
  selfApproved.forEach((task, i) => {
    const at = daysAgo(6, 2, 10 + i * 7);
    audit('TASK', task.id, 'TASK_APPROVED', vikasEntry.user.id, { refNo: task.refNo, note: 'Verified.', selfApproved: true }, at);
  });

  // One task completed in 4 minutes — physically impossible for a field verification.
  const sprintTask = await createTask({
    deptCode: 'REV',
    assignee: vikasEntry.user,
    status: 'COMPLETED',
    priority: 'HIGH',
    createdDaysAgo: 7,
    completeAfterHours: 4 / 60,
  });

  console.log(`  ✓ ${tasks.length} tasks (incl. planted burnout / fraud / SLA patterns)`);

  /* ------------------------------------------------------- task updates */

  interface SeededUpdate {
    id: string;
    taskId: string;
    authorId: string;
    note: string;
    createdAt: Date;
  }
  const updates: SeededUpdate[] = [];

  async function addUpdate(
    task: SeededTask,
    authorId: string,
    tone: 'positive' | 'neutral' | 'negative',
    type: TaskUpdateType,
    createdAt: Date,
    progressPct?: number,
    explicitNote?: string,
  ) {
    const note = explicitNote ?? pick(UPDATE_NOTES[tone]);
    const row = await prisma.taskUpdate.create({
      data: { taskId: task.id, authorId, type, note, progressPct, createdAt },
    });
    updates.push({ id: row.id, taskId: task.id, authorId, note, createdAt });
    audit('TASK', task.id, 'TASK_UPDATE_ADDED', authorId, { refNo: task.refNo, type, progressPct: progressPct ?? null }, createdAt);
    return row;
  }

  for (const task of tasks) {
    const isRamesh = task.assigneeId === rameshEntry.user.id;
    const count = task.status === 'PENDING' ? randInt(0, 1) : randInt(1, 4);

    for (let i = 0; i < count; i += 1) {
      const raw = new Date(
        task.createdAt.getTime() + ((i + 1) / (count + 1)) * (Math.min(NOW.getTime(), (task.completedAt ?? NOW).getTime()) - task.createdAt.getTime()),
      );
      const at = officeHours(raw);
      if (at > NOW) continue;

      // Overdue work and Ramesh's queue skew negative; everything else is mixed.
      const overdueNow = task.dueDate < NOW && task.status !== 'COMPLETED';
      let tone: 'positive' | 'neutral' | 'negative';
      if (isRamesh) tone = chance(0.62) ? 'negative' : chance(0.6) ? 'neutral' : 'positive';
      else if (overdueNow) tone = chance(0.5) ? 'negative' : 'neutral';
      else if (task.status === 'COMPLETED') tone = chance(0.55) ? 'positive' : 'neutral';
      else tone = chance(0.25) ? 'negative' : chance(0.5) ? 'positive' : 'neutral';

      await addUpdate(
        task,
        task.assigneeId,
        tone,
        i === count - 1 && task.status !== 'PENDING' ? 'PROGRESS' : 'COMMENT',
        at,
        i === count - 1 ? randInt(20, 95) : undefined,
      );
    }

    // Managers leave review notes on reviewed / completed work.
    if (task.status === 'UNDER_REVIEW' || task.status === 'COMPLETED') {
      if (chance(0.55)) {
        const at = officeHours(task.completedAt ?? new Date(NOW.getTime() - randInt(2, 40) * HOUR));
        await addUpdate(task, task.creatorId, 'positive', 'REVIEW_NOTE', at > NOW ? NOW : at, undefined, pick(REVIEW_NOTES.approve));
      }
    }
  }

  // Ramesh's after-hours notes — explicit, escalating, and the evidence the
  // Burnout screen quotes back to the manager.
  const rameshBurnoutNotes = [
    'Bahut load is there this week, I am not able to finish this on time.',
    'I am exhausted, too many tasks assigned this week and everything is urgent.',
    'Working late again to clear the measurement books. Pareshan ho gaya.',
    'Delay ho raha hai on three sites, no vehicle and no support staff.',
    'This is the fourth site inspection this week. Very frustrating, cannot keep up.',
  ];
  for (let i = 0; i < rameshBurnoutNotes.length; i += 1) {
    const task = rameshTasks[i % rameshTasks.length];
    await addUpdate(task, rameshEntry.user.id, 'negative', 'COMMENT', daysAgo(i + 2, 22, randInt(0, 59)), undefined, rameshBurnoutNotes[i]);
  }

  console.log(`  ✓ ${updates.length} task updates`);

  /* --------------------------------------------------- sentiment records */

  // Precomputed with the same lexicon the API falls back to, so morale dashboards
  // are populated on a fresh seed even if the Python service never starts.
  const sentimentRows: Prisma.SentimentRecordCreateManyInput[] = updates.map((u) => {
    const { score, label } = scoreSentiment(u.note);
    return {
      taskUpdateId: u.id,
      userId: u.authorId,
      score,
      label,
      modelVersion: LEXICON_MODEL_VERSION,
      createdAt: u.createdAt,
    };
  });
  await prisma.sentimentRecord.createMany({ data: sentimentRows });
  console.log(`  ✓ ${sentimentRows.length} sentiment records`);

  /* ------------------------------------------------------ burnout scores */

  const weekStart = weekStartOf(NOW);
  const burnoutRows: Prisma.BurnoutScoreCreateManyInput[] = [];

  for (const { user } of employees) {
    const mine = tasks.filter((t) => t.assigneeId === user.id);
    const active = mine.filter((t) => t.status !== 'COMPLETED');
    const overdueCount = active.filter((t) => t.dueDate < NOW).length;

    const myUpdates = updates.filter(
      (u) => u.authorId === user.id && u.createdAt > new Date(NOW.getTime() - 14 * DAY),
    );
    const afterHours = myUpdates.filter((u) => {
      const h = u.createdAt.getHours();
      return h >= 21 || h < 6;
    }).length;
    const negatives = myUpdates.filter((u) => scoreSentiment(u.note).label === 'NEGATIVE').length;

    const factors = {
      activeLoad: active.length,
      overdueCount,
      afterHoursPct: myUpdates.length ? Math.round((afterHours / myUpdates.length) * 100) : 0,
      avgDailyUpdates: Number((myUpdates.length / 14).toFixed(2)),
      negSentimentPct: myUpdates.length ? Math.round((negatives / myUpdates.length) * 100) : 0,
    };

    const score = burnoutScoreFrom(factors);
    burnoutRows.push({
      userId: user.id,
      weekStart,
      score,
      riskLevel: riskFrom(score),
      factors: factors as unknown as Prisma.InputJsonValue,
      createdAt: NOW,
    });
  }
  await prisma.burnoutScore.createMany({ data: burnoutRows });

  const rameshScore = burnoutRows.find((b) => b.userId === rameshEntry.user.id);
  console.log(
    `  ✓ ${burnoutRows.length} burnout scores (Ramesh Patel: ${rameshScore?.score} / ${rameshScore?.riskLevel})`,
  );

  /* --------------------------------------------------------- fraud alerts */

  const vikas = vikasEntry.user;
  const alerts: Prisma.FraudAlertCreateManyInput[] = [];

  // 1 — bulk night-time status changes (2 alerts, one per night)
  for (const [i, night] of [8, 6].entries()) {
    const changes = nightAudit.filter((n) => Math.round((NOW.getTime() - n.at.getTime()) / DAY) === night);
    alerts.push({
      type: 'BULK_STATUS_CHANGE',
      severity: 'CRITICAL',
      userId: vikas.id,
      taskId: changes[0]?.task.id ?? null,
      anomalyScore: 0.94 - i * 0.03,
      status: 'OPEN',
      labelConfirmed: true,
      createdAt: daysAgo(night, 6),
      details: {
        window: '01:00–03:00 IST',
        statusChanges: changes.length || 7,
        expectedRange: '0–2 for this user at this hour',
        reasons: ['night_hour_ratio', 'action_burst'],
        affectedRefNos: changes.slice(0, 5).map((c) => c.task.refNo),
        narrative: `${changes.length || 7} task status changes recorded between 01:00 and 03:00 — the user's median night-time activity is 0.`,
      } as Prisma.InputJsonValue,
    });
  }

  // 2 — after-hours activity spike (3 alerts)
  for (let i = 0; i < 3; i += 1) {
    alerts.push({
      type: 'AFTER_HOURS_SPIKE',
      severity: i === 0 ? 'HIGH' : 'MODERATE',
      userId: i === 2 ? rameshEntry.user.id : vikas.id,
      anomalyScore: 0.81 - i * 0.06,
      status: 'OPEN',
      // The Ramesh one is a TRUE POSITIVE for burnout but NOT fraud — this is the
      // single labelled miss that makes the precision figure 11/12, not 12/12.
      labelConfirmed: i === 2 ? false : true,
      createdAt: daysAgo(5 + i, 7),
      details: {
        afterHoursPct: [78, 64, 52][i],
        baselinePct: 6,
        reasons: ['night_hour_ratio'],
        narrative:
          i === 2
            ? 'Sustained late-evening activity. On review this was workload-driven, not misuse — see the burnout score for this user.'
            : 'Activity concentrated outside 09:00–18:00 well beyond this user’s own baseline.',
      } as Prisma.InputJsonValue,
    });
  }

  // 3 — self-approval (3 alerts)
  selfApproved.forEach((task, i) => {
    alerts.push({
      type: 'SELF_APPROVAL',
      severity: 'CRITICAL',
      userId: vikas.id,
      taskId: task.id,
      anomalyScore: 0.97 - i * 0.01,
      status: 'OPEN',
      labelConfirmed: true,
      createdAt: daysAgo(6, 8, i * 5),
      details: {
        refNo: task.refNo,
        submittedBy: vikas.name,
        approvedBy: vikas.name,
        policy: 'Maker-checker separation — the submitter must not be the approver',
        reasons: ['self_approval'],
        narrative: `${task.refNo} was moved to COMPLETED by the same user who submitted it for review.`,
      } as Prisma.InputJsonValue,
    });
  });

  // 4 — impossible cycle time (4 alerts)
  const fastTasks = [sprintTask, ...vikasNightTasks.slice(3, 6)];
  fastTasks.forEach((task, i) => {
    alerts.push({
      type: 'UNUSUAL_CYCLE_TIME',
      severity: i === 0 ? 'CRITICAL' : 'HIGH',
      userId: vikas.id,
      taskId: task.id,
      anomalyScore: 0.92 - i * 0.04,
      status: 'OPEN',
      labelConfirmed: true,
      createdAt: daysAgo(7 - i, 9),
      details: {
        refNo: task.refNo,
        cycleTimeMinutes: i === 0 ? 4 : randInt(35, 90),
        departmentMedianHours: 41,
        zScore: Number((-3.8 + i * 0.3).toFixed(2)),
        reasons: ['cycle_time_zscore'],
        narrative:
          i === 0
            ? `${task.refNo} moved from IN_PROGRESS to COMPLETED in 4 minutes. A field verification of this type takes 41 hours on median.`
            : `${task.refNo} closed far faster than the departmental median for its priority.`,
      } as Prisma.InputJsonValue,
    });
  });

  await prisma.fraudAlert.createMany({ data: alerts });

  const confirmed = alerts.filter((a) => a.labelConfirmed === true).length;
  console.log(
    `  ✓ ${alerts.length} fraud alerts (${confirmed}/${alerts.length} confirmed on review → ${Math.round((confirmed / alerts.length) * 100)}% precision)`,
  );

  /* -------------------------------------------------------- notifications */

  const notifications: Prisma.NotificationCreateManyInput[] = [];
  for (const task of tasks) {
    if (task.status === 'COMPLETED') continue;
    const hoursLeft = (task.dueDate.getTime() - NOW.getTime()) / HOUR;
    if (hoursLeft < 0 && notifications.length < 40) {
      notifications.push({
        userId: task.assigneeId,
        title: 'SLA breached',
        body: `${task.refNo} — ${task.title} passed its deadline ${Math.abs(Math.round(hoursLeft))}h ago.`,
        link: `/tasks/${task.id}`,
        read: chance(0.35),
        createdAt: new Date(task.dueDate.getTime() + HOUR),
      });
    } else if (hoursLeft > 0 && hoursLeft < 24 && notifications.length < 60) {
      notifications.push({
        userId: task.assigneeId,
        title: 'Due within 24 hours',
        body: `${task.refNo} — ${task.title} is due in ${Math.round(hoursLeft)}h.`,
        link: `/tasks/${task.id}`,
        read: chance(0.2),
        createdAt: new Date(NOW.getTime() - randInt(1, 10) * HOUR),
      });
    }
  }
  // Announcements go to everyone — the Employee dashboard has an Announcements
  // card, and it must never be empty on a fresh seed.
  for (const a of ANNOUNCEMENTS) {
    for (const u of [admin, ...managers.values(), ...employees.map((e) => e.user)]) {
      notifications.push({
        userId: u.id,
        title: a.title,
        body: a.body,
        link: null,
        read: chance(0.4),
        createdAt: daysAgo(randInt(1, 9), 11),
      });
    }
  }
  await prisma.notification.createMany({ data: notifications });
  console.log(`  ✓ ${notifications.length} notifications`);

  /* ---------------------------------------------------------- audit chain */

  auditQueue.push({
    entityType: 'FRAUD',
    entityId: 'SCAN',
    action: 'FRAUD_SCAN_RUN',
    actorId: admin.id,
    payload: { alertsCreated: alerts.length, engine: 'IsolationForest + rules', mode: 'seed' },
    createdAt: daysAgo(1, 8),
  });

  // Genesis first, then everything else in chronological order.
  const genesis: UnlinkedEvent = {
    entityType: 'SYSTEM',
    entityId: 'GENESIS',
    action: 'GENESIS',
    actorId: null,
    payload: {
      system: 'SMARTWORK 360',
      note: 'Genesis block — start of the tamper-evident audit ledger',
      version: 1,
    },
    createdAt: daysAgo(93, 8),
  };

  const ordered = [genesis, ...auditQueue.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())];
  const linked = linkEvents(ordered);

  await prisma.auditEvent.createMany({
    data: linked.map((e) => ({
      chainIndex: e.chainIndex,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      actorId: e.actorId,
      payload: e.payload as Prisma.InputJsonValue,
      createdAt: e.createdAt,
      prevHash: e.prevHash,
      hash: e.hash,
    })),
  });

  // Merkle checkpoints every ANCHOR_INTERVAL blocks.
  const anchors: Prisma.AnchorCreateManyInput[] = [];
  for (let from = 0; from + ANCHOR_INTERVAL <= linked.length; from += ANCHOR_INTERVAL) {
    const to = from + ANCHOR_INTERVAL - 1;
    anchors.push({
      anchorIndex: anchors.length,
      fromIndex: from,
      toIndex: to,
      merkleRoot: merkleRoot(linked.slice(from, to + 1).map((e) => e.hash)),
      externalTxHash: 'pending — Polygon Amoy (planned)',
      createdAt: linked[to].createdAt,
    });
  }
  if (anchors.length) await prisma.anchor.createMany({ data: anchors });

  console.log(`  ✓ ${linked.length} audit blocks, ${anchors.length} Merkle checkpoints`);

  /* ------------------------------------------------------------- summary */

  console.log('\n  Demo accounts — password for all: ' + DEMO_PASSWORD);
  console.log(`    ADMIN     ${emailFor(ADMIN.name)}   (${ADMIN.designation})`);
  console.log(`    MANAGER   ${emailFor(MANAGERS[0].name)}  (${MANAGERS[0].designation}, Revenue)`);
  console.log(`    EMPLOYEE  ${emailFor(EMPLOYEES[1].name)}     (${EMPLOYEES[1].designation}, Revenue)`);
  console.log(`\n  Planted for the demo:`);
  console.log(`    burnout   ${rameshEntry.spec.name} (PWD)`);
  console.log(`    fraud     ${vikasEntry.spec.name} (REV)`);
  console.log(`    SLA story Health department, week 6 breach cluster\n`);
}

/* ------------------------------------------------------------- scoring */

interface Factors {
  activeLoad: number;
  overdueCount: number;
  afterHoursPct: number;
  avgDailyUpdates: number;
  negSentimentPct: number;
}

/**
 * Weighted burnout score, 0–100. Mirrors the weights the ML service uses in
 * heuristic mode so a seeded score and a recomputed score agree.
 */
export function burnoutScoreFrom(f: Factors): number {
  const load = Math.min(1, f.activeLoad / 10) * 28;
  const overdue = Math.min(1, f.overdueCount / 6) * 30;
  const afterHours = Math.min(1, f.afterHoursPct / 60) * 18;
  const negative = Math.min(1, f.negSentimentPct / 60) * 19;
  const churn = Math.min(1, f.avgDailyUpdates / 4) * 5;
  return Math.round(Math.min(100, load + overdue + afterHours + negative + churn));
}

export function riskFrom(score: number): 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' {
  if (score >= 80) return 'CRITICAL';
  if (score >= 62) return 'HIGH';
  if (score >= 40) return 'MODERATE';
  return 'LOW';
}

/* ---------------------------------------------------------------- wipe */

/** Deletes in FK-safe order. Only touches SMARTWORK 360 tables. */
async function wipe() {
  await prisma.notification.deleteMany();
  await prisma.sentimentRecord.deleteMany();
  await prisma.burnoutScore.deleteMany();
  await prisma.fraudAlert.deleteMany();
  await prisma.taskUpdate.deleteMany();
  await prisma.task.deleteMany();
  await prisma.anchor.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.sLAPolicy.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('  Seed complete.\n');
  })
  .catch(async (e) => {
    console.error('\n  Seed failed:\n', e);
    await prisma.$disconnect();
    process.exit(1);
  });
