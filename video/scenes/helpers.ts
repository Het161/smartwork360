import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { installCursor, park } from './cursor';

// Playwright transpiles these specs to CommonJS (the repo root package.json is
// not `"type": "module"`), so `import.meta` is unavailable here.
const HERE = __dirname;
export const VIDEO = join(HERE, '..');
export const REPO = join(VIDEO, '..');
export const RAW = join(VIDEO, 'raw');
export const CARDS = join(VIDEO, 'cards');

export const BASE = process.env.SW360_WEB ?? 'http://localhost:3000';
export const PASSWORD = 'Demo@123';

export const USERS = {
  employee: 'kavita.joshi@gov.in',
  // NOT the Sunita Deshmukh login chip. The planted burnout case (Ramesh Patel,
  // 85/100 CRITICAL) lives in Public Works, and every manager query is scoped by
  // departmentId — signing in as Sunita shows an empty, uninteresting section.
  manager: 'anil.kulkarni@gov.in',
  admin: 'rajesh.iyer@gov.in',
} as const;

const script = JSON.parse(readFileSync(join(VIDEO, 'script', 'narration.json'), 'utf8'));

export function narration(id: string) {
  const m = script.measured?.[id];
  if (!m) {
    throw new Error(
      `No measured audio for "${id}". Run:  node video/script/generate-audio.mjs\n` +
      `The visuals are paced to the voice, so the audio has to exist first.`,
    );
  }
  return m as { duration: number; sentences: { start: number; end: number }[] };
}

/* ------------------------------------------------------------------ pacing */

/**
 * Holds a scene to its narration. `atSentence(i)` blocks until the moment
 * sentence i begins, so a visual beat lands on the words that describe it
 * rather than on a delay someone guessed.
 */
export class Pacer {
  private t0 = Date.now();
  readonly duration: number;
  readonly marks: number[];

  constructor(private page: Page, id: string) {
    const n = narration(id);
    this.duration = n.duration;
    this.marks = n.sentences.map((s) => s.start);
  }

  get elapsed(): number {
    return (Date.now() - this.t0) / 1000;
  }

  private async waitUntil(sec: number): Promise<void> {
    const remaining = sec - this.elapsed;
    if (remaining > 0) await this.page.waitForTimeout(remaining * 1000);
  }

  /** Wait until sentence `i` starts. Returns immediately if already past it. */
  async atSentence(i: number): Promise<void> {
    await this.waitUntil(this.marks[Math.min(i, this.marks.length - 1)] ?? 0);
  }

  /** For cards: fire the visual cue exactly as its sentence begins. */
  async cue(i: number): Promise<void> {
    await this.atSentence(i);
    await this.page.evaluate((n) => (window as any).__cue?.(n), i);
  }

  /** Hold the last frame until the narration has finished. */
  async finish(): Promise<void> {
    await this.waitUntil(this.duration);
  }

  /** How far behind (negative) or ahead (positive) of the voice we are. */
  report(id: string): string {
    const drift = this.elapsed - this.duration;
    return `${id}: ${this.elapsed.toFixed(2)}s vs ${this.duration.toFixed(2)}s (${drift >= 0 ? '+' : ''}${drift.toFixed(2)}s)`;
  }
}

/* ------------------------------------------------------- context per scene */

export interface Scene {
  context: BrowserContext;
  page: Page;
  /** Closes the context (which is when Playwright writes the file) and files
   *  the video as raw/<id>.webm. */
  done(): Promise<void>;
}

export async function openScene(browser: Browser, id: string, opts: { mobile?: boolean } = {}): Promise<Scene> {
  mkdirSync(RAW, { recursive: true });
  const size = opts.mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 };

  const context = await browser.newContext({
    viewport: size,
    // Must be set explicitly. Left alone, Playwright scales the recording down
    // to fit inside 800x800 and the result is small and soft.
    recordVideo: { dir: RAW, size },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  await context.addInitScript(() => {
    // Pin the interface to English — every text selector in the recorder
    // assumes it, and a stale toggle from a previous run would break the take.
    localStorage.setItem('sw360_lang', 'en');
    // Stop the saffron pulse ring on the help button.
    localStorage.setItem('sw360:tour:fab-pulses', '3');
  });

  const page = await context.newPage();
  await installCursor(page);

  return {
    context,
    page,
    async done() {
      const video = page.video();
      await context.close(); // the file is only written on close
      if (video) {
        const src = await video.path();
        const dest = join(RAW, `${id}.webm`);
        rmSync(dest, { force: true });
        renameSync(src, dest);
      }
    },
  };
}

/* ----------------------------------------------------------------- waiting */

/** Wait for every loading skeleton on the page to go away. */
export async function waitLoaded(page: Page, timeout = 25_000): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  const skeletons = page.locator('[role="status"][aria-label^="Loading"]');
  await page
    .waitForFunction(
      () => document.querySelectorAll('[role="status"][aria-label^="Loading"]').length === 0,
      undefined,
      { timeout },
    )
    .catch(() => {});
  await skeletons.first().waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(400);
}

/** Recharts animates on mount (Line/Area run 1500ms) and ignores reduced-motion. */
export async function waitCharts(page: Page, expected = 1): Promise<void> {
  await page.locator('.recharts-surface').first().waitFor({ state: 'visible', timeout: 20_000 });
  await page
    .waitForFunction((n) => document.querySelectorAll('.recharts-surface').length >= n, expected, { timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(1800);
}

/** Dismiss the Saarthi welcome modal, which fires 800ms after mount. */
export async function dismissWelcome(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: 'Skip for now' });
  await skip.waitFor({ state: 'visible', timeout: 3500 }).catch(() => {});
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(500);
  }
  // If a previous run abandoned a tour mid-way, a "Resume your tour?" toast
  // appears at 1400ms. Close it before it drifts into shot.
  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click().catch(() => {});
}

/* ------------------------------------------------------------------- login */

export async function login(
  page: Page,
  email: string,
  landing: string,
  opts: { keepTour?: boolean } = {},
): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(new RegExp(landing.replace(/\//g, '\\/')), { timeout: 25_000 });
  await page.locator('aside[aria-label="Main navigation"]').waitFor({ timeout: 25_000 });
  if (!opts.keepTour) await dismissWelcome(page);
  await waitLoaded(page);
  await park(page);
}

/** Move between pages via the sidebar so the navigation is visible on camera. */
export async function navTo(page: Page, href: string): Promise<void> {
  const { click } = await import('./cursor');
  await click(page, `aside[aria-label="Main navigation"] a[href="${href}"]`);
  await page.waitForURL(new RegExp(href.replace(/\//g, '\\/')), { timeout: 20_000 });
  await waitLoaded(page);
}

/* ------------------------------------------------------------------- cards */

export async function openCard(page: Page, file: string): Promise<void> {
  await page.goto(pathToFileURL(join(CARDS, file)).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(320);
}

/* --------------------------------------------------------------- terminal */

export interface TermLine { text: string; tone?: 'ok' | 'bad' | 'warn' | 'dim'; pause?: number }

/**
 * Runs a repo script for real and returns its output, tone-tagged for the
 * terminal card. Nothing shown on that card is typed by hand.
 */
export function runRepoScript(cmd: string): { lines: TermLine[]; raw: string } {
  let raw = '';
  try {
    raw = execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e: any) {
    raw = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/\[[0-9;]*m/g, '').trimEnd())
    // npm's own banner is noise on camera.
    .filter((l) => !/^>\s|^npm (notice|warn)|^$/.test(l) || l === '')
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .map<TermLine>((text) => {
      const t = text.toLowerCase();
      if (/tamper|fail|mismatch|broken|invalid|✗|✖/.test(t)) return { text, tone: 'bad', pause: 190 };
      if (/intact|verified|restored|ok\b|success|✓|✔/.test(t)) return { text, tone: 'ok', pause: 190 };
      if (/warn|note/.test(t)) return { text, tone: 'warn' };
      return { text, tone: 'dim' };
    });
  return { lines, raw };
}

export async function playTerminal(page: Page, cmd: string, lines: TermLine[], caption?: string): Promise<void> {
  await page.evaluate(
    ([c, l, cap]) => (window as any).__runTerminal(c, l, { caption: cap }),
    [cmd, lines, caption] as const,
  );
}

/* ------------------------------------------------------------------ warmup */

/**
 * Next.js compiles a route the first time it is requested. Without this pass
 * the first visit to every page shows a compiling state on camera.
 */
export async function warmup(browser: Browser): Promise<void> {
  const routes = [
    '/login', '/auth/parichay', '/signup',
    '/e/dashboard', '/e/tasks', '/e/assistant', '/e/performance',
    '/m/dashboard', '/m/board', '/m/burnout', '/m/analytics', '/m/reviews',
    '/a/overview', '/a/directory', '/a/fraud', '/a/audit', '/a/fixes', '/a/settings',
  ];
  if (process.env.SW360_SKIP_WARMUP === '1') return;
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const reachable = await page
    .goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!reachable) {
    await ctx.close();
    console.warn(
      `\n  ⚠ ${BASE} is not responding. Card-only scenes will still record;\n` +
      `    every app scene will fail. Start the stack first:\n` +
      `      docker compose up -d && npm run seed && npm run dev\n`,
    );
    return;
  }
  await page.fill('#email', USERS.admin);
  await page.fill('#password', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/a\/overview/, { timeout: 40_000 }).catch(() => {});
  for (const r of routes) {
    await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await ctx.close();
}

export function ensureAudio(): void {
  const dir = join(VIDEO, 'audio');
  if (!existsSync(join(dir, 'scene-01.mp3'))) {
    throw new Error('No narration audio. Run: node video/script/generate-audio.mjs');
  }
}
