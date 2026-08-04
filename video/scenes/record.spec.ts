import { test, expect } from '@playwright/test';
import { click, moveTo, typeInto, park, emphasise } from './cursor';
import {
  BASE, USERS, Pacer, openScene, login, navTo, waitLoaded, waitCharts,
  dismissWelcome, openCard, runRepoScript, playTerminal, warmup, ensureAudio,
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

test.beforeAll(async ({ browser }) => {
  ensureAudio();
  await warmup(browser);
});

/* ═══════════════════════════════════════════════════ 01 — Title (card) ═══ */

test('scene-01 title', async ({ browser }) => {
  const s = await openScene(browser, 'scene-01');
  const p = new Pacer(s.page, 'scene-01');
  await openCard(s.page, 'title.html');
  for (let i = 0; i < 4; i++) await p.cue(i);
  await p.finish();
  console.log(p.report('scene-01'));
  await s.done();
});

/* ═════════════════════════════════════════════ 02 — The problem (card) ═══ */

test('scene-02 the problem', async ({ browser }) => {
  const s = await openScene(browser, 'scene-02');
  const p = new Pacer(s.page, 'scene-02');
  await openCard(s.page, 'problem.html');

  await p.cue(0);
  // Sentence 1 names the three levels near its end; light them on the words.
  const s0 = p.marks[0];
  const s1 = p.marks[1] ?? p.duration;
  const span = s1 - s0;
  for (let i = 0; i < 3; i++) {
    const at = s0 + span * (0.56 + i * 0.13);
    while (p.elapsed < at) await s.page.waitForTimeout(60);
    await s.page.evaluate((n) => (window as any).__cue?.(n), i + 1);
  }
  await p.atSentence(1);
  await s.page.evaluate(() => (window as any).__cue?.(4));
  await p.finish();
  console.log(p.report('scene-02'));
  await s.done();
});

/* ══════════════════════════════════════════ 03 — Login and Parichay ═══════ */

test('scene-03 login and parichay', async ({ browser }) => {
  const s = await openScene(browser, 'scene-03');
  const { page } = s;
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const p = new Pacer(page, 'scene-03');

  await moveTo(page, '#email');
  await moveTo(page, 'a[href="/auth/parichay"]');

  await p.atSentence(1);
  await click(page, 'a[href="/auth/parichay"]');
  await page.waitForURL(/\/auth\/parichay/);
  await page.waitForTimeout(600);
  await emphasise(page, page.getByText('Sandbox mode').first(), 1800);
  await moveTo(page, '#userId');

  await p.atSentence(2);
  await click(page, 'a[href="/login"]');
  await page.waitForURL(/\/login/);
  await click(page, page.getByRole('button', { name: /Kavita Joshi/ }));
  await page.waitForTimeout(500);
  await click(page, 'form button[type="submit"]');
  await page.waitForURL(/\/e\/dashboard/, { timeout: 30_000 });
  await page.locator('aside[aria-label="Main navigation"]').waitFor();
  await waitLoaded(page);
  await dismissWelcome(page);
  await park(page);
  await p.finish();
  console.log(p.report('scene-03'));
  await s.done();
});

/* ══════════════════════════════════ 04 — Employee, individual level ═══════ */

test('scene-04 employee individual level', async ({ browser }) => {
  const s = await openScene(browser, 'scene-04');
  const { page } = s;
  await login(page, USERS.employee, '/e/dashboard');
  const p = new Pacer(page, 'scene-04');

  await p.atSentence(1);
  await emphasise(page, '[data-tour="my-kpis"]', 2600, 1.04);
  await moveTo(page, page.getByRole('heading', { name: "Today's Focus" }));

  await p.atSentence(2);
  await navTo(page, '/e/tasks');
  await page.locator('tr[data-tour="task-row"]').waitFor({ timeout: 20_000 });
  await click(page, page.locator('tr[data-tour="task-row"]').getByRole('button').first());

  const drawer = page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: 'Close panel' }),
  });
  await drawer.waitFor({ timeout: 15_000 });
  await expect(drawer.getByRole('heading').first()).toContainText(/[A-Z]{2,4}\/\d{4}\//, { timeout: 15_000 });
  await moveTo(page, drawer.getByRole('heading', { name: 'Activity timeline' }));

  await p.atSentence(3);
  const note = 'Site inspection completed. Measurement book updated and placed before the accounts branch.';
  await typeInto(page, page.getByPlaceholder('What is the current status?'), note);
  await click(page, '#progress-slider');
  await page.locator('#progress-slider').fill('75');
  await page.waitForTimeout(500);
  const addSection = page.locator('section[data-tour="add-progress"]');
  await click(page, addSection.getByRole('button', { name: 'Submit' }));
  await page.waitForTimeout(1600);

  await p.atSentence(4);
  const audit = drawer.getByRole('heading', { name: /^Audit chain \(\d+ blocks\)$/ });
  await audit.scrollIntoViewIfNeeded();
  await emphasise(page, audit, 2400, 1.1);
  await p.finish();
  console.log(p.report('scene-04'));
  await s.done();
});

/* ═════════════════════════════ 05 — Employee assistant and performance ═══ */

test('scene-05 assistant and performance', async ({ browser }) => {
  const s = await openScene(browser, 'scene-05');
  const { page } = s;
  await login(page, USERS.employee, '/e/dashboard');
  await navTo(page, '/e/assistant');
  // The API-driven chips pop in after the hardcoded Hinglish one.
  await expect(page.locator('[data-tour="assistant-chips"] button')).toHaveCount(4, { timeout: 20_000 });
  const p = new Pacer(page, 'scene-05');

  await p.atSentence(1);
  await click(page, page.getByRole('button', { name: 'mere pending kaam kitne hain?', exact: true }));
  await page.getByText('Checking your tasks…').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  await page.locator('p:has(> span.font-mono)').last().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await emphasise(page, page.locator('p:has(> span.font-mono)').last(), 1900, 1.14);

  await p.atSentence(2);
  await navTo(page, '/e/performance');
  await waitCharts(page, 2);
  await moveTo(page, page.getByRole('heading', { name: 'Completed per month' }));

  await p.atSentence(3);
  await emphasise(page, '[data-tour="perf-trend"]', 2400, 1.03);
  await park(page);
  await p.finish();
  console.log(p.report('scene-05'));
  await s.done();
});

/* ═══════════════════════════════════════ 06 — Manager, team level ════════ */

test('scene-06 manager team level', async ({ browser }) => {
  const s = await openScene(browser, 'scene-06');
  const { page } = s;
  await login(page, USERS.manager, '/m/dashboard');
  await page.waitForTimeout(1500); // the department-scoped second wave
  const p = new Pacer(page, 'scene-06');

  await p.atSentence(1);
  await emphasise(page, page.locator('.gt-card').filter({ has: page.getByRole('heading', { name: 'SLA compliance' }) }), 2600, 1.04);

  await p.atSentence(2);
  await emphasise(page, '[data-tour="morale-gauge"]', 3200, 1.05);

  await p.atSentence(3);
  await emphasise(page, '[data-tour="burnout-list"]', 2200, 1.04);
  await navTo(page, '/m/burnout');
  const ramesh = page.locator('li').filter({ hasText: 'Ramesh Patel' }).first();
  await ramesh.scrollIntoViewIfNeeded();
  await emphasise(page, ramesh, 2600, 1.03);

  await p.atSentence(4);
  await navTo(page, '/m/board');
  await page.locator('[data-tour="kanban-board"]').waitFor({ timeout: 20_000 });
  await dragCard(page);

  await p.atSentence(5);
  await navTo(page, '/m/reviews');
  await page.locator('[data-tour="review-queue"]').waitFor({ timeout: 20_000 });
  await moveTo(page, page.getByRole('button', { name: 'Approve' }).first());
  await p.finish();
  console.log(p.report('scene-06'));
  await s.done();
});

/**
 * dnd-kit ignores Playwright's dragTo. Two reasons, both in the installed source:
 * the move that crosses the 6px activation threshold returns before dispatching
 * onMove, and `over` is only committed after a React render + effect. So the
 * sequence needs a threshold-crossing nudge, real travel, a final nudge, and a
 * pause before release.
 */
async function dragCard(page: import('@playwright/test').Page) {
  const handle = page.locator('section[aria-label="Pending"] button[aria-label^="Drag "]').first();
  const target = page.locator('section[aria-label="In Progress"]');
  await handle.waitFor({ timeout: 15_000 });

  const hb = (await handle.boundingBox())!;
  const tb = (await target.boundingBox())!;
  const sx = Math.round(hb.x + hb.width / 2);
  const sy = Math.round(hb.y + hb.height / 2);
  const tx = Math.round(tb.x + tb.width / 2);
  const ty = Math.round(tb.y + 150);

  await moveTo(page, handle);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy, { steps: 5 });          // cross the 6px threshold
  await page.evaluate(([x, y]) => (window as any).__sw360MoveCursor?.(x, y), [sx + 12, sy]);
  await page.waitForTimeout(220);
  await page.mouse.move(tx, ty, { steps: 28 });              // real travel -> collisions
  await page.evaluate(([x, y]) => (window as any).__sw360MoveCursor?.(x, y), [tx, ty]);
  await page.mouse.move(tx, ty + 1, { steps: 2 });           // guarantee a final onMove
  await page.waitForTimeout(320);                            // let React commit `over`
  await page.mouse.up();
  await page.waitForTimeout(1400);
}

/* ═════════════════════════════════════════ 07 — Manager analytics ════════ */

test('scene-07 manager analytics', async ({ browser }) => {
  const s = await openScene(browser, 'scene-07');
  const { page } = s;
  await login(page, USERS.manager, '/m/dashboard');
  await navTo(page, '/m/analytics');
  await waitCharts(page, 4);
  const p = new Pacer(page, 'scene-07');

  const card = (title: string) =>
    page.locator('.gt-card').filter({ has: page.getByRole('heading', { name: title }) });

  const titles = ['Weekly throughput', 'Avg cycle time by priority', 'SLA breaches by week', 'Sentiment vs task load'];
  for (let i = 0; i < titles.length; i++) {
    await p.atSentence(i + 1);
    await emphasise(page, card(titles[i]), 2200, 1.05);
  }
  await park(page);
  await p.finish();
  console.log(p.report('scene-07'));
  await s.done();
});

/* ═══════════════════════════════════ 08 — Admin, organisation level ══════ */

test('scene-08 admin organisation level', async ({ browser }) => {
  const s = await openScene(browser, 'scene-08');
  const { page } = s;
  await login(page, USERS.admin, '/a/overview');
  // Morale and At-risk arrive in a visible second wave (one call per department).
  // Recording before it lands shows 0.00 in every row.
  await page
    .waitForFunction(() => !/(^|\s)0\.00(\s|$)/.test(
      document.querySelector('[data-tour="dept-table"] tbody')?.textContent ?? '0.00'), undefined, { timeout: 25_000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  const p = new Pacer(page, 'scene-08');

  await emphasise(page, '[data-tour="org-kpis"]', 2400, 1.03);
  await emphasise(page, '[data-tour="dept-table"]', 3000, 1.02);

  await p.atSentence(1);
  const heat = page.locator('.gt-card').filter({ has: page.getByRole('heading', { name: 'SLA breach heatmap' }) });
  await heat.scrollIntoViewIfNeeded();
  await emphasise(page, heat, 3200, 1.03);

  await p.atSentence(2);
  await navTo(page, '/a/directory');
  await moveTo(page, page.getByRole('tab').first());
  await park(page);
  await p.finish();
  console.log(p.report('scene-08'));
  await s.done();
});

/* ═════════════════════════════════════════════ 09 — Fraud and risk ═══════ */

test('scene-09 fraud and risk', async ({ browser }) => {
  const s = await openScene(browser, 'scene-09');
  const { page } = s;
  await login(page, USERS.admin, '/a/overview');
  await navTo(page, '/a/fraud');
  await waitCharts(page, 1);
  const p = new Pacer(page, 'scene-09');

  await p.atSentence(1);
  await emphasise(page, page.locator('.gt-card').filter({ has: page.getByRole('heading', { name: 'Detection precision' }) }), 2400, 1.04);
  await emphasise(page, page.locator('.gt-card').filter({ has: page.getByRole('heading', { name: 'Anomaly scatter' }) }), 3000, 1.03);

  await p.atSentence(2);
  await click(page, page.locator('tr', { hasText: 'Vikas Meena' }).first().getByRole('button').first());
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close panel' }) });
  await drawer.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(900);
  await moveTo(page, drawer.getByText('Why this fired'));
  await emphasise(page, drawer.locator('pre').first(), 2600, 1.03);

  await p.atSentence(3);
  await park(page, 1500, 900);
  await p.finish();
  console.log(p.report('scene-09'));
  await s.done();
});

/* ══════════════════════════════════ 10 — The audit trail (showpiece) ═════ */

test('scene-10 the audit trail', async ({ browser }) => {
  const s = await openScene(browser, 'scene-10');
  const { page } = s;
  await login(page, USERS.admin, '/a/overview');
  await navTo(page, '/a/audit');
  const banner = page.locator('[role="status"][aria-live="polite"]');
  await banner.waitFor({ timeout: 25_000 });
  const p = new Pacer(page, 'scene-10');

  await p.atSentence(1);
  await emphasise(page, page.locator('.gt-card').filter({ has: page.getByRole('heading', { name: 'Recent blocks' }) }), 2800, 1.03);

  await p.atSentence(2);
  await click(page, 'button[data-tour="verify-chain"]');
  await expect(banner).toContainText('Chain intact', { timeout: 20_000 });
  await page.waitForTimeout(2000); // hold on green

  // Tamper for real, straight against the database, while the camera is on the
  // green banner. That is exactly the threat model — it bypasses the API.
  await p.atSentence(3);
  const tamper = runRepoScript('npm run demo:tamper');
  await openCard(page, 'terminal.html');
  await playTerminal(page, 'npm run demo:tamper', tamper.lines,
    'A raw SQL UPDATE against the table — the service that appends blocks is never involved.');
  await page.waitForTimeout(1200);

  // A fresh navigation restarts the 30s background refetch, so the button press
  // is what flips the banner on camera rather than a poll landing mid-take.
  await p.atSentence(4);
  await page.goto(`${BASE}/a/audit`, { waitUntil: 'domcontentloaded' });
  await banner.waitFor({ timeout: 25_000 });
  await waitLoaded(page);
  await click(page, 'button[data-tour="verify-chain"]');
  await expect(banner).toContainText('TAMPER DETECTED', { timeout: 20_000 });

  await p.atSentence(5);
  await emphasise(page, banner.locator('p.text-2xl'), 2600, 1.12);
  await page.waitForTimeout(2000); // hold on red
  await click(page, page.getByRole('button', { name: /Show block #\d+ in the ledger/ }));
  await page.waitForTimeout(1400);

  await p.atSentence(6);
  const brokenBlock = page.locator('li').filter({ hasText: 'Hash mismatch' }).first();
  if (await brokenBlock.isVisible().catch(() => false)) await emphasise(page, brokenBlock, 2200, 1.12);
  await emphasise(page, page.locator('tr', { hasText: 'tampered' }).first(), 2200, 1.04);

  await p.atSentence(8);
  const reset = runRepoScript('npm run demo:reset');
  await openCard(page, 'terminal.html');
  await playTerminal(page, 'npm run demo:reset', reset.lines, 'The original row is restored.');
  await page.waitForTimeout(900);
  await page.goto(`${BASE}/a/audit`, { waitUntil: 'domcontentloaded' });
  await banner.waitFor({ timeout: 25_000 });
  await waitLoaded(page);
  await click(page, 'button[data-tour="verify-chain"]');
  await expect(banner).toContainText('Chain intact', { timeout: 20_000 });
  await page.waitForTimeout(2000); // hold on the restored green
  await p.finish();
  console.log(p.report('scene-10'));
  await s.done();
});

/* ═══════════════════════════════════════════════ 11 — Guided tours ═══════ */

test('scene-11 guided tours', async ({ browser }) => {
  const s = await openScene(browser, 'scene-11');
  const { page } = s;
  // keepTour: a fresh context has no tour key, so the welcome modal fires.
  await login(page, USERS.admin, '/a/overview', { keepTour: true });
  await page.getByRole('button', { name: 'Start 2-min tour' }).waitFor({ timeout: 10_000 });
  const p = new Pacer(page, 'scene-11');

  await p.atSentence(1);
  await click(page, page.getByRole('button', { name: 'Start 2-min tour' }));
  await page.waitForTimeout(1600);
  const card = page.locator('div[role="dialog"][aria-modal="false"]');
  for (let i = 0; i < 2; i++) {
    const next = card.getByRole('button', { name: 'Next' });
    if (await next.isVisible().catch(() => false)) {
      await click(page, next);
      await page.waitForTimeout(1500);
    }
  }
  // The action steps are the point — the user has to do the real thing to move on.
  const tryIt = page.getByText('Try it yourself to continue');
  if (await tryIt.isVisible().catch(() => false)) await emphasise(page, tryIt, 2200, 1.08);

  await p.atSentence(2);
  const hi = card.getByRole('button', { name: 'हिंदी' });
  if (await hi.isVisible().catch(() => false)) {
    await click(page, hi);
    await page.waitForTimeout(2000);
  }
  const skip = card.getByRole('button', { name: /Skip tour|टूर छोड़ें/ });
  if (await skip.isVisible().catch(() => false)) await click(page, skip);
  await park(page);
  await p.finish();
  console.log(p.report('scene-11'));
  await s.done();
});

/* ══════════════════════════ 12 — Support assistant and self-repair ═══════ */

test('scene-12 support assistant and self-repair', async ({ browser }) => {
  const s = await openScene(browser, 'scene-12');
  const { page } = s;
  // Must be ADMIN: the department field in the New task modal only renders for
  // role ADMIN, and Health + CRITICAL is the combination the seed leaves without
  // an SLA policy, so the failure is genuine rather than staged.
  await login(page, USERS.admin, '/a/overview');
  await page.goto(`${BASE}/m/board`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-tour="kanban-board"]').waitFor({ timeout: 25_000 });
  await waitLoaded(page);
  const p = new Pacer(page, 'scene-12');

  await p.atSentence(1);
  await createHealthCriticalTask(page);
  const alert = page.getByRole('dialog').locator('div[role="alert"]').first();
  await alert.waitFor({ timeout: 20_000 });
  await emphasise(page, alert, 2000, 1.03);

  await p.atSentence(2);
  await click(page, page.getByRole('button', { name: 'Ask Saarthi about this' }));
  const dock = page.locator('[data-tour="support-dock"]');
  await dock.waitFor({ timeout: 15_000 });
  await emphasise(page, dock.locator('span.font-mono').first(), 2000, 1.1); // POST /tasks · 400 · SLA_POLICY_MISSING
  await typeInto(page, dock.locator('textarea'), 'Why did this fail?');
  await click(page, dock.locator('button[aria-label="Send"]'));
  await page.getByTestId('fix-card').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(900);

  await p.atSentence(3);
  await click(page, page.getByTestId('fix-card').getByRole('button', { name: 'Apply fix' }));
  await expect(page.getByTestId('fix-card')).toContainText('Done', { timeout: 40_000 });

  await p.atSentence(4);
  await emphasise(page, page.getByTestId('fix-card').getByText(/Recorded on the audit chain as block #\d+/), 2600, 1.08);

  // The repair actually works — create the same task again.
  await click(page, dock.locator('button[aria-label="Close"]'));
  await page.waitForTimeout(400);
  await createHealthCriticalTask(page, 'Emergency ward inspection — follow-up');
  await page.waitForTimeout(1800);

  // The refusal is the point of this scene, so bring the help button back into
  // shot (the cursor overlay hides it everywhere else) and open the dock properly.
  await p.atSentence(6);
  // animation:none as well as display — the help button floats on a 3.5s
  // infinite loop, and Playwright refuses to click an element that never comes
  // to rest ("element is not stable"), so this otherwise hangs until the test
  // timeout. The app is right to animate it; the recorder just needs it still.
  await page.addStyleTag({
    content: '[data-tour="help-fab"]{display:flex !important;animation:none !important}',
  });
  await click(page, 'button[data-tour="help-fab"]');
  await click(page, '[data-tour="support-menu-item"]');
  await dock.waitFor({ timeout: 15_000 });
  await typeInto(page, dock.locator('textarea'), 'fix the broken audit chain');
  await click(page, dock.locator('button[aria-label="Send"]'));
  await page.waitForTimeout(6000);

  await p.atSentence(8);
  await emphasise(page, dock.locator('[role="log"]'), 2600, 1.02);
  await p.finish();
  console.log(p.report('scene-12'));
  await s.done();
});

async function createHealthCriticalTask(
  page: import('@playwright/test').Page,
  title = 'Emergency ward inspection — district hospital',
) {
  await click(page, '[data-tour="new-task-btn"]');
  const modal = page.getByRole('dialog');
  await modal.waitFor({ timeout: 15_000 });
  await typeInto(page, '#task-title', title);
  await typeInto(page, '#task-desc', 'Inspect the emergency ward and file a report before the end of the week.');
  // Wait for the option to exist. Swallowing the failure here silently left
  // the department as the admin's own — where CRITICAL *does* have an SLA
  // policy — so the task succeeded and the error this scene is about never
  // appeared. The field only renders for ADMIN, hence the count() guard.
  const deptSelect = page.locator('#task-dept');
  if (await deptSelect.count()) {
    // state: 'attached' — an <option> inside a <select> is never "visible" to
    // Playwright, so the default visibility wait can never be satisfied.
    await deptSelect
      .locator('option', { hasText: /Health/i })
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 });
    // Select by VALUE read off the option. selectOption's `label` must be a
    // string — a RegExp throws "expected string, got object", which is what the
    // old .catch() was quietly swallowing on every run.
    const healthValue = await deptSelect
      .locator('option', { hasText: /Health/i })
      .first()
      .getAttribute('value');
    if (healthValue) await deptSelect.selectOption(healthValue);
  }
  await page.selectOption('#task-priority', { label: 'Critical' });
  await page.waitForTimeout(400);
  const assignee = modal.locator('button[aria-pressed]').first();
  await click(page, assignee);
  await click(page, modal.getByRole('button', { name: 'Submit' }));
  await page.waitForTimeout(1500);
}

/* ══════════════════════════════ 13 — Access, language and mobile ═════════ */

test('scene-13 access language and mobile', async ({ browser }) => {
  const s = await openScene(browser, 'scene-13');
  const { page } = s;
  await login(page, USERS.admin, '/a/overview');
  const p = new Pacer(page, 'scene-13');

  await click(page, page.locator('[data-tour="lang-toggle"] button', { hasText: 'हिंदी' }));
  await page.waitForSelector('html[lang="hi"]', { timeout: 10_000 });
  await page.waitForTimeout(2200);
  await navTo(page, '/a/fraud');
  await page.waitForTimeout(1800);

  await p.atSentence(1);
  await click(page, page.locator('[data-tour="lang-toggle"] button', { hasText: 'EN' }));
  await page.waitForTimeout(900);
  // A phone bezel around the real app, so the mobile layout is shown at native
  // size rather than letterboxed inside a 1920-wide frame.
  await openCard(page, 'mobile.html');
  await page.waitForTimeout(1200);
  await page.evaluate(() => (window as any).__cue?.(0));
  await p.finish();
  console.log(p.report('scene-13'));
  await s.done();
});

/* ══════════════════════════════════════ 14 — How it is built (card) ═════ */

test('scene-14 how it is built', async ({ browser }) => {
  const s = await openScene(browser, 'scene-14');
  const p = new Pacer(s.page, 'scene-14');
  await openCard(s.page, 'architecture.html');
  for (let i = 0; i < 3; i++) await p.cue(i);
  await p.finish();
  console.log(p.report('scene-14'));
  await s.done();
});

/* ═══════════════════════════════════════════════ 15 — Close (card) ══════ */

test('scene-15 close', async ({ browser }) => {
  const s = await openScene(browser, 'scene-15');
  const p = new Pacer(s.page, 'scene-15');
  await openCard(s.page, 'closing.html');
  for (let i = 0; i < 3; i++) await p.cue(i);
  await p.finish();
  console.log(p.report('scene-15'));
  await s.done();
});
