import type { Page, Locator } from '@playwright/test';

/**
 * Playwright's video recorder does not draw a mouse pointer. Without one,
 * menus open and fields fill themselves and a viewer cannot follow what is
 * being demonstrated. This injects a synthetic pointer that eases to each
 * target and fires a click ripple, so every interaction reads as deliberate.
 *
 * Every interaction in the demo goes through these helpers. No bare page.click().
 */

const OVERLAY_ID = '__sw360_cursor';
const MOVE_MS = 500;
const SETTLE_MS = 200;
const RIPPLE_MS = 400;

const injected = `
(() => {
  if (window.__sw360CursorReady) return;
  window.__sw360CursorReady = true;

  const mount = () => {
    if (document.getElementById('${OVERLAY_ID}')) return;
    if (!document.body) return;

    const style = document.createElement('style');
    style.textContent = \`
      #${OVERLAY_ID} {
        position: fixed;
        left: 0; top: 0;
        width: 22px; height: 22px;
        pointer-events: none;
        z-index: 2147483647;
        transform: translate3d(-100px, -100px, 0);
        transition: transform ${MOVE_MS}ms cubic-bezier(.33,.02,.24,1);
        will-change: transform;
      }
      #${OVERLAY_ID} svg { display: block; filter: drop-shadow(0 2px 4px rgba(14,42,82,.45)); }
      .__sw360_ripple {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        border-radius: 9999px;
        border: 2px solid #FF9933;
        background: rgba(255,153,51,.22);
        transform: translate(-50%, -50%) scale(.25);
        opacity: .95;
        animation: __sw360_ripple ${RIPPLE_MS}ms ease-out forwards;
      }
      @keyframes __sw360_ripple {
        to { transform: translate(-50%, -50%) scale(1); opacity: 0; }
      }
      /* The floating help button is in shot on every authenticated page and
         never stops animating. It pulls the eye away from the demonstration. */
      [data-tour="help-fab"] { display: none !important; }
    \`;
    document.head.appendChild(style);

    const el = document.createElement('div');
    el.id = '${OVERLAY_ID}';
    el.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2 1.4 L2 17.2 L6.15 13.4 L8.85 19.6 L11.75 18.35 L9.1 12.3 L14.7 12.05 Z" ' +
      'fill="#ffffff" stroke="#0E2A52" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(el);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
  // Next.js client navigation can replace the body; keep the pointer alive.
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: false });

  window.__sw360MoveCursor = (x, y) => {
    const el = document.getElementById('${OVERLAY_ID}');
    if (el) el.style.transform = 'translate3d(' + (x - 2) + 'px,' + (y - 1) + 'px,0)';
  };

  window.__sw360Ripple = (x, y, size) => {
    const r = document.createElement('div');
    r.className = '__sw360_ripple';
    const s = size || 46;
    r.style.width = s + 'px';
    r.style.height = s + 'px';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), ${RIPPLE_MS} + 60);
  };
})();
`;

export async function installCursor(page: Page): Promise<void> {
  await page.addInitScript(injected);
}

/** Re-inject after a hard navigation, if the init script has not run yet. */
async function ensure(page: Page): Promise<void> {
  const ready = await page.evaluate(() => Boolean((window as any).__sw360CursorReady)).catch(() => false);
  if (!ready) await page.evaluate(injected).catch(() => {});
}

function resolve(page: Page, target: string | Locator): Locator {
  return typeof target === 'string' ? page.locator(target) : target;
}

/** Ease the pointer to the centre of `target` and hold. Does not click. */
export async function moveTo(page: Page, target: string | Locator): Promise<{ x: number; y: number }> {
  await ensure(page);
  const el = resolve(page, target).first();
  await el.scrollIntoViewIfNeeded();
  await el.waitFor({ state: 'visible' });

  const box = await el.boundingBox();
  if (!box) throw new Error(`moveTo: no bounding box for ${String(target)}`);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);

  await page.evaluate(([px, py]) => (window as any).__sw360MoveCursor?.(px, py), [x, y]);
  await page.mouse.move(x, y);          // keep real hover state in sync with the drawn pointer
  await page.waitForTimeout(MOVE_MS + SETTLE_MS);
  return { x, y };
}

/** Move, ripple, then perform the real click. */
export async function click(page: Page, target: string | Locator): Promise<void> {
  const { x, y } = await moveTo(page, target);
  const el = resolve(page, target).first();
  const box = await el.boundingBox();
  const size = box ? Math.min(Math.max(box.height * 1.6, 40), 90) : 46;

  await page.evaluate(([px, py, s]) => (window as any).__sw360Ripple?.(px, py, s), [x, y, size]);
  await page.waitForTimeout(120);
  await el.click();
  await page.waitForTimeout(RIPPLE_MS - 120);
}

/** Move, click into the field, then type at a human cadence. */
export async function typeInto(page: Page, target: string | Locator, text: string): Promise<void> {
  await click(page, target);
  await resolve(page, target).first().pressSequentially(text, { delay: 45 });
  await page.waitForTimeout(200);
}

/** Park the pointer somewhere neutral so it is not sitting on top of a KPI. */
export async function park(page: Page, x = 1640, y = 940): Promise<void> {
  await ensure(page);
  await page.evaluate(([px, py]) => (window as any).__sw360MoveCursor?.(px, py), [x, y]);
  await page.mouse.move(x, y);
  await page.waitForTimeout(MOVE_MS);
}

/**
 * Briefly scale an element so a small detail reads on camera — an SLA chip, a
 * hash prefix, a block number. Playwright cannot zoom the viewport, and
 * scaling the element is less disorienting than moving the whole page.
 */
export async function emphasise(
  page: Page,
  target: string | Locator,
  holdMs = 1400,
  scale = 1.15,
): Promise<void> {
  const el = resolve(page, target).first();
  await el.scrollIntoViewIfNeeded();
  await el.evaluate((node, s) => {
    const n = node as HTMLElement;
    n.dataset.sw360PrevTransition = n.style.transition;
    n.dataset.sw360PrevTransform = n.style.transform;
    n.dataset.sw360PrevZ = n.style.zIndex;
    n.style.transition = 'transform 320ms cubic-bezier(.33,.02,.24,1)';
    n.style.transformOrigin = 'center';
    n.style.position = n.style.position || 'relative';
    n.style.zIndex = '40';
    n.style.transform = `scale(${s})`;
  }, scale);
  await page.waitForTimeout(holdMs);
  await el.evaluate((node) => {
    const n = node as HTMLElement;
    n.style.transform = n.dataset.sw360PrevTransform ?? '';
    n.style.zIndex = n.dataset.sw360PrevZ ?? '';
    setTimeout(() => {
      n.style.transition = n.dataset.sw360PrevTransition ?? '';
    }, 340);
  });
  await page.waitForTimeout(360);
}
