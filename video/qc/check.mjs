#!/usr/bin/env node
/**
 * SMARTWORK 360 — quality check.
 *
 * Extracts a frame every 10 seconds and runs the mechanical checks. The visual
 * ones (nothing half-loaded, captions not covering the UI, the red chain state
 * legible) still need a human eye — this writes the contact sheet for that and
 * tells you exactly what to look at.
 *
 *   node video/qc/check.mjs
 */
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO = join(HERE, '..');
const OUT = join(VIDEO, 'out');

const targets = [
  { name: 'smartwork360-full-demo', min: 8 * 60, max: 10 * 60 },
  { name: 'smartwork360-short-demo', min: 85, max: 95 },
];

const run = (bin, a) => execFileSync(bin, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const probeJson = (f, args) => JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', ...args, f]));

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

for (const t of targets) {
  const file = join(OUT, `${t.name}.mp4`);
  console.log(`\n▸ ${t.name}`);
  if (!existsSync(file)) {
    check(false, 'file exists', file);
    continue;
  }

  const fmt = probeJson(file, ['-show_format']);
  const streams = probeJson(file, ['-show_streams']).streams;
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  const dur = Number(fmt.format.duration);
  const size = Number(fmt.format.size);

  check(dur >= t.min && dur <= t.max, 'duration in range',
    `${Math.floor(dur / 60)}m ${(dur % 60).toFixed(1)}s (want ${t.min}–${t.max}s)`);
  check(v?.width === 1920 && v?.height === 1080, 'resolution 1920x1080', `${v?.width}x${v?.height}`);
  check(v?.codec_name === 'h264', 'video codec H.264', v?.codec_name);
  check(v?.pix_fmt === 'yuv420p', 'pixel format yuv420p', v?.pix_fmt);
  check(Math.round(eval(v?.r_frame_rate ?? '0')) === 30, 'frame rate 30', v?.r_frame_rate);
  check(a?.codec_name === 'aac', 'audio codec AAC', a?.codec_name);
  check(Number(a?.sample_rate) === 48000, 'audio 48 kHz', a?.sample_rate);

  // faststart: the moov atom must sit before mdat, or the file stalls while it
  // buffers when someone plays it straight out of Google Drive.
  const fd = openSync(file, 'r');
  const head = Buffer.alloc(Math.min(8 * 1024 * 1024, size));
  readSync(fd, head, 0, head.length, 0);
  closeSync(fd);
  const moov = head.indexOf('moov');
  const mdat = head.indexOf('mdat');
  check(moov !== -1 && (mdat === -1 || moov < mdat), 'faststart (moov before mdat)');

  // Loudness. loudnorm targets -16 LUFS; past ±1.5 is worth a re-run.
  // ffmpeg writes the ebur128 summary to stderr and exits 0, so capture both.
  let combined = '';
  try {
    const r = execFileSync('ffmpeg',
      ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    combined = r;
  } catch (e) {
    combined = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  if (!/LUFS/.test(combined)) {
    // Older builds put the summary only on fd 2 even on success.
    try {
      combined = execFileSync('sh',
        ['-c', `ffmpeg -hide_banner -nostats -i ${JSON.stringify(file)} -af ebur128=framelog=quiet -f null - 2>&1`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) { combined = `${e.stdout ?? ''}`; }
  }
  const I = /I:\s*(-?\d+\.?\d*)\s*LUFS/g;
  const peaks = /Peak:\s*(-?\d+\.?\d*)\s*dBFS/g;
  const allI = [...combined.matchAll(I)].map((m) => Number(m[1]));
  const allP = [...combined.matchAll(peaks)].map((m) => Number(m[1]));
  const integrated = allI.length ? allI[allI.length - 1] : NaN;
  const truePeak = allP.length ? Math.max(...allP) : NaN;
  check(!Number.isNaN(integrated) && Math.abs(integrated + 16) <= 1.5, 'loudness ≈ -16 LUFS',
    Number.isNaN(integrated) ? 'not measured' : `${integrated} LUFS`);
  check(Number.isNaN(truePeak) || truePeak <= -0.5, 'no clipping',
    Number.isNaN(truePeak) ? 'not measured' : `peak ${truePeak} dBFS`);

  // Sidecar captions
  const srt = join(OUT, `${t.name}.srt`);
  const hasSrt = existsSync(srt);
  check(hasSrt, 'sidecar .srt exported');
  if (hasSrt) {
    const cues = readFileSync(srt, 'utf8').trim().split(/\n\s*\n/).length;
    const last = readFileSync(srt, 'utf8').trim().split(/\n\s*\n/).pop().split('\n')[1];
    const end = last?.split('-->')[1]?.trim();
    const [hh, mm, rest] = (end ?? '00:00:00,000').split(':');
    const endSec = Number(hh) * 3600 + Number(mm) * 60 + Number(rest.replace(',', '.'));
    check(endSec <= dur + 0.5, 'last caption inside the video', `${endSec.toFixed(1)}s vs ${dur.toFixed(1)}s`);
    console.log(`    ${cues} cues`);
  }

  // Contact sheet — a frame every 10s for the eyeball pass.
  const shots = join(HERE, 'frames', t.name);
  rmSync(shots, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file,
    '-vf', 'fps=1/10,scale=640:-1', join(shots, 'f%03d.jpg')]);
  const n = readdirSync(shots).length;
  console.log(`    ${n} frames → ${shots}`);
  console.log(`    inspect for: loading skeletons · empty states · console overlays ·`);
  console.log(`                 captions covering UI · narration matching the screen ·`);
  console.log(`                 the red TAMPER DETECTED block number being legible ·`);
  console.log(`                 any .env value, API key, personal data or devtools in frame`);
}

console.log(failures === 0
  ? '\nAll mechanical checks passed. The visual pass is still yours.'
  : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
