'use client';

import { BrandLogo } from '@/components/brand/BrandLogo';

/**
 * Internal brand sheet.
 *
 * No auth: it is a reference, and gating it would mean the one person who most
 * needs it — somebody making a slide at 2am — cannot reach it.
 */

const SWATCHES = [
  { name: 'Navy', hex: '#14417B', use: 'Primary. The mark, headings, primary buttons.', dark: true },
  { name: 'Sidebar navy', hex: '#0E2A52', use: 'Sidebar, login panel, splash.', dark: true },
  { name: 'Saffron', hex: '#FF9933', use: 'The "360", nodes, accents. Never for body text.', dark: false },
  { name: 'Green', hex: '#138808', use: 'Tricolour rule and success states only.', dark: true },
  { name: 'Canvas', hex: '#F6F8FB', use: 'Page background.', dark: false },
];

const DOS = [
  'Use the white mark on navy, the navy mark on light, the mono mark in print.',
  'Keep clear space of at least one node-width on every side.',
  'Keep the wordmark as live text — it is never part of the SVG.',
  'Scale the SVG. For a new raster size, re-export from the SVG.',
];

const DONTS = [
  'Do not recolour the mark or the wordmark.',
  'Do not rotate, skew, stretch or squash it.',
  'Do not add shadows, glows, gradients or outlines.',
  'Do not place the light mark on a light background, or the white mark on white.',
  'Do not put the mark below 24px — the nodes close up and it reads as a blob.',
  'Do not use it as a watermark over dashboard content.',
];

function Panel({
  label,
  bg,
  children,
}: {
  label: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-borderx">
      <div className="grid min-h-[130px] place-items-center p-6" style={{ background: bg }}>
        {children}
      </div>
      <p className="border-t border-borderx bg-white px-3 py-2 text-xs text-slate-600">{label}</p>
    </div>
  );
}

export default function BrandSheetPage() {
  return (
    <main id="main-content" className="mx-auto max-w-4xl px-6 py-12">
      <BrandLogo variant="lockup" size="lg" showTagline />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">Brand sheet</h1>
      <p className="mt-2 max-w-2xl text-base text-slate-500">
        The mark is an S built from a single stroke, with three nodes stepping down it — a task
        moving through its stages. Everything below is the whole of the rule set.
      </p>
      <div className="tricolor-rule mt-5 h-1 w-28 rounded-full" />

      {/* ------------------------------------------------------- variants */}
      <h2 className="mt-12 text-lg font-semibold text-slate-900">The three variants</h2>
      <p className="mt-1 text-sm text-slate-500">
        Each exists for one background. Using the wrong one is the mistake that actually ships.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Panel label="mark.svg — on light backgrounds" bg="#FFFFFF">
          <BrandLogo variant="lockup" theme="light" size="md" />
        </Panel>
        <Panel label="mark-white.svg — on navy" bg="#0E2A52">
          <BrandLogo variant="lockup" theme="dark" size="md" />
        </Panel>
        <Panel label="mark-mono.svg — print and fax" bg="#FFFFFF">
          <BrandLogo variant="lockup" theme="mono" size="md" />
        </Panel>
      </div>

      {/* ---------------------------------------------------------- forms */}
      <h2 className="mt-12 text-lg font-semibold text-slate-900">Lockups</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Panel label='variant="mark" — tight spaces, collapsed sidebar' bg="#FFFFFF">
          <BrandLogo variant="mark" size="lg" />
        </Panel>
        <Panel label='variant="lockup" — the default' bg="#FFFFFF">
          <BrandLogo variant="lockup" size="md" />
        </Panel>
        <Panel label='variant="stacked" showTagline — login, covers' bg="#0E2A52">
          <BrandLogo variant="stacked" theme="dark" size="md" showTagline />
        </Panel>
      </div>

      {/* ----------------------------------------------------------- size */}
      <h2 className="mt-12 text-lg font-semibold text-slate-900">Size and clear space</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-borderx bg-white p-6">
          <div className="flex items-end gap-6">
            {(['sm', 'md', 'lg'] as const).map((s) => (
              <div key={s} className="text-center">
                <BrandLogo variant="mark" size={s} />
                <p className="mt-2 text-xs text-slate-500">
                  {s} · {s === 'sm' ? 24 : s === 'md' ? 32 : 48}px
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">
            <strong className="text-slate-900">Minimum 24px.</strong> Below that the three nodes
            merge into the stroke and the mark reads as a smudge.
          </p>
        </div>
        <div className="rounded-card border border-borderx bg-white p-6">
          {/* The node is 15 of 64 units, so one node-width ≈ 23% of the mark. */}
          <div className="inline-block border-2 border-dashed border-saffron/60 p-[11px]">
            <BrandLogo variant="mark" size="lg" />
          </div>
          <p className="mt-4 text-sm text-slate-600">
            <strong className="text-slate-900">Clear space: one node-width</strong> on all four
            sides — about 23% of the mark&rsquo;s height. Nothing else enters the dashed area.
          </p>
        </div>
      </div>

      {/* --------------------------------------------------------- colour */}
      <h2 className="mt-12 text-lg font-semibold text-slate-900">Colour</h2>
      <div className="mt-4 overflow-hidden rounded-card border border-borderx">
        {SWATCHES.map((c, i) => (
          <div
            key={c.hex}
            className={`flex items-center gap-4 bg-white px-4 py-3 ${i > 0 ? 'border-t border-borderx' : ''}`}
          >
            <span
              className="h-10 w-10 shrink-0 rounded-btn border border-black/10"
              style={{ background: c.hex }}
              aria-hidden
            />
            <span className="w-28 shrink-0 text-sm font-medium text-slate-900">{c.name}</span>
            <code className="w-20 shrink-0 font-mono text-sm text-slate-600">{c.hex}</code>
            <span className="text-sm text-slate-500">{c.use}</span>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------ do / don't */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-success/30 bg-success-soft p-5">
          <h3 className="text-md font-semibold text-success">Do</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {DOS.map((d) => (
              <li key={d} className="flex gap-2">
                <span aria-hidden>✓</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-card border border-danger/30 bg-danger-soft p-5">
          <h3 className="text-md font-semibold text-danger">Don&rsquo;t</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {DONTS.map((d) => (
              <li key={d} className="flex gap-2">
                <span aria-hidden>✕</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---------------------------------------------------------- files */}
      <h2 className="mt-12 text-lg font-semibold text-slate-900">Files</h2>
      <div className="mt-4 overflow-x-auto rounded-card border border-borderx bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-borderx bg-slate-50/70">
            <tr>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                File
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Use for
              </th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {[
              ['/brand/mark.svg', 'Light backgrounds, in-app'],
              ['/brand/mark-white.svg', 'Navy backgrounds — sidebar, login, splash'],
              ['/brand/mark-mono.svg', 'Print stylesheet, monochrome documents'],
              ['/brand/mark-512.png', 'Raster mark, light backgrounds'],
              ['/brand/mark-white-512.png', 'Raster mark for the navy email header'],
              ['/brand/icon-192.png · icon-512.png', 'PWA manifest'],
              ['/brand/icon-maskable-512.png', 'Android maskable icon'],
              ['/brand/og-image.png', 'Social preview card, 1200×630'],
              ['/brand/favicon.ico', 'Browser tab'],
            ].map(([f, u]) => (
              <tr key={f} className="border-b border-borderx last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{f}</td>
                <td className="px-4 py-2.5">{u}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-10 text-sm text-slate-500">
        In code, never reference these paths directly — use{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
          &lt;BrandLogo /&gt;
        </code>
        , which picks the right file for the theme you give it.
      </p>
    </main>
  );
}
