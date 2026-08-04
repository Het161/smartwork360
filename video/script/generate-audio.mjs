#!/usr/bin/env node
/**
 * SMARTWORK 360 — narration audio + captions.
 *
 * Audio is authored FIRST. Everything downstream (scene pacing, crossfades,
 * caption offsets) is derived from the durations this script measures, which is
 * why the visuals never drift out of sync with the voice.
 *
 * Each sentence is synthesised as its own clip so its duration is known exactly.
 * The clips are then joined with a fixed silence gap. That gives frame-accurate
 * SRT timings with no forced alignment and no guesswork, and the gaps are what
 * let a 38-second narration comfortably fill a 55-second scene without the
 * delivery sounding hurried.
 *
 *   node video/script/generate-audio.mjs                 # edge-tts (default)
 *   node video/script/generate-audio.mjs --only scene-10 # one scene
 *   node video/script/generate-audio.mjs --engine espeak # offline placeholder
 *
 * --engine espeak exists ONLY to exercise the assembly pipeline without a
 * network TTS. It sounds robotic. Never ship it.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO = join(HERE, '..');
const AUDIO = join(VIDEO, 'audio');
const TMP = join(AUDIO, '.tmp');
const SCRIPT = join(HERE, 'narration.json');

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const ENGINE = argOf('engine', 'edge-tts');
const ONLY = argOf('only', null);
const GAP_OVERRIDE = argOf('gap', null);

const doc = JSON.parse(readFileSync(SCRIPT, 'utf8'));
const { voice, pacing } = doc;
if (GAP_OVERRIDE) pacing.sentenceGapMs = Number(GAP_OVERRIDE);
const GAP = (pacing.sentenceGapMs ?? 420) / 1000;

mkdirSync(AUDIO, { recursive: true });
mkdirSync(TMP, { recursive: true });

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

/**
 * Locate a required external command, preferring the project-local venv.
 *
 * edge-tts is a Python program, and on a Homebrew Python `pip install` refuses
 * outright (PEP 668, "externally managed environment"). So it lives in
 * video/.venv, created by `npm run video:setup`. Falling back to PATH keeps a
 * system-wide or pipx install working on somebody else's machine.
 */
function resolveBin(name, { hint }) {
  const local = join(VIDEO, '.venv', 'bin', name);
  if (existsSync(local)) return local;
  try {
    execSync(`command -v ${name}`, { stdio: 'ignore' });
    return name;
  } catch {
    throw new Error(
      `\n  Missing required command: ${name}\n\n  ${hint}\n`,
    );
  }
}

const EDGE_TTS = ENGINE === 'edge-tts'
  ? resolveBin('edge-tts', {
      hint: 'Run:  npm run video:setup\n  (creates video/.venv and installs edge-tts there)',
    })
  : null;

for (const bin of ['ffmpeg', 'ffprobe']) {
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore' });
  } catch {
    console.error(`\n  Missing required command: ${bin}\n\n  Run:  brew install ffmpeg\n`);
    process.exit(1);
  }
}

const probe = (f) =>
  parseFloat(
    execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1',
      f,
    ]).toString().trim(),
  );

/** Synthesise one sentence to `out`. Returns its duration in seconds. */
function say(text, out) {
  if (ENGINE === 'espeak') {
    const wav = out.replace(/\.mp3$/, '.wav');
    execFileSync('espeak-ng', ['-v', 'en-us', '-s', '150', '-w', wav, text]);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-q:a', '2', out]);
    rmSync(wav, { force: true });
  } else {
    // Pass the text via a file so quotes, em dashes and Devanagari survive the shell.
    const txt = join(TMP, 'line.txt');
    writeFileSync(txt, text, 'utf8');
    execFileSync(EDGE_TTS, [
      '--voice', voice.name,
      `--rate=${voice.rate}`,
      `--volume=${voice.volume}`,
      `--pitch=${voice.pitch}`,
      '--file', txt,
      '--write-media', out,
    ]);
    if (!existsSync(out) || probe(out) === 0) {
      throw new Error(
        `edge-tts produced an empty file for: "${text.slice(0, 60)}…"\n` +
        `If this is a 403, Microsoft is blocking this IP — edge-tts refuses datacenter ranges. ` +
        `Run this on a normal residential connection.`,
      );
    }
  }
  return probe(out);
}

const ts = (sec) => {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};

/** Split a long sentence across two caption lines so it never covers the UI. */
function wrapCaption(text, max = 46) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = `${line} ${w}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  // Never more than two lines on screen; rebalance if we overflow.
  if (lines.length > 2) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }
  return lines;
}

let silenceFile = null;
function silence() {
  if (silenceFile) return silenceFile;
  silenceFile = join(TMP, `sil-${Math.round(GAP * 1000)}.mp3`);
  execFileSync('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
    '-t', String(GAP),
    '-c:a', 'libmp3lame', '-q:a', '2',
    silenceFile,
  ]);
  return silenceFile;
}

function buildScene(scene) {
  const id = scene.id;
  const parts = [];
  const timings = [];
  let cursor = 0;

  scene.sentences.forEach((sentence, i) => {
    const clip = join(TMP, `${id}-${String(i).padStart(2, '0')}.mp3`);
    const dur = say(sentence, clip);
    timings.push({ text: sentence, start: cursor, end: cursor + dur });
    parts.push(clip);
    cursor += dur;
    if (i < scene.sentences.length - 1) {
      parts.push(silence());
      cursor += GAP;
    }
  });

  // Join. Re-encode rather than stream-copy — copying MP3 frames across clips
  // leaves gaps that show up as clicks.
  const list = join(TMP, `${id}.txt`);
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const out = join(AUDIO, `${id}.mp3`);
  execFileSync('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-ar', '24000', '-ac', '1',
    '-c:a', 'libmp3lame', '-q:a', '2',
    out,
  ]);

  const total = probe(out);

  // Captions, from the exact per-sentence timings.
  const srt = timings
    .map((t, i) => `${i + 1}\n${ts(t.start)} --> ${ts(t.end)}\n${wrapCaption(t.text).join('\n')}\n`)
    .join('\n');
  writeFileSync(join(AUDIO, `${id}.srt`), srt, 'utf8');

  return { duration: total, sentences: timings };
}

const all = [
  ...doc.scenes.map((s) => ({ ...s, _bucket: 'scenes' })),
  ...doc.short.scenes.map((s) => ({ ...s, _bucket: 'short' })),
];
const todo = ONLY ? all.filter((s) => s.id === ONLY) : all;
if (!todo.length) {
  console.error(`No scene matches --only ${ONLY}`);
  process.exit(1);
}

doc.measured ??= {};
for (const scene of todo) {
  process.stdout.write(`  ${scene.id} … `);
  const m = buildScene(scene);
  doc.measured[scene.id] = {
    duration: Number(m.duration.toFixed(3)),
    target: scene.targetSeconds ?? null,
    sentences: m.sentences.map((s) => ({
      start: Number(s.start.toFixed(3)),
      end: Number(s.end.toFixed(3)),
    })),
  };
  const t = scene.targetSeconds;
  const flag = t && Math.abs(m.duration - t) > 6 ? `  ⚠ target ${t}s` : '';
  console.log(`${m.duration.toFixed(2)}s${flag}`);
}

doc.measured.$engine = ENGINE;
writeFileSync(SCRIPT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
rmSync(TMP, { recursive: true, force: true });

const full = doc.scenes.reduce((a, s) => a + (doc.measured[s.id]?.duration ?? 0), 0);
const short = doc.short.scenes.reduce((a, s) => a + (doc.measured[s.id]?.duration ?? 0), 0);

// Assembly adds a 0.7s tail per scene and removes 0.4s per crossfade.
const n = doc.scenes.length;
const fullVideo = full + n * 0.7 - (n - 1) * 0.4;
const sn = doc.short.scenes.length;
const shortVideo = short + sn * 0.7 - (sn - 1) * 0.4;

console.log(`\n  full   narration ${full.toFixed(1)}s  → video ${Math.floor(fullVideo / 60)}m ${(fullVideo % 60).toFixed(0)}s`);
console.log(`  short  narration ${short.toFixed(1)}s  → video ${shortVideo.toFixed(1)}s`);

// The full cut has to land between 8 and 10 minutes. Inter-sentence silence is
// the free variable — it is pure padding, so widening it lengthens the film
// without speeding up or slowing down the delivery.
const TARGET = 9 * 60;
if (fullVideo < 8 * 60 || fullVideo > 10 * 60) {
  const gaps = doc.scenes.reduce((a, s) => a + Math.max(0, s.sentences.length - 1), 0);
  const suggested = Math.round(((TARGET - (fullVideo - gaps * GAP)) / gaps) * 1000);
  console.log(
    `\n  ⚠ ${Math.floor(fullVideo / 60)}m ${(fullVideo % 60).toFixed(0)}s is outside the 8–10 minute window.\n` +
    `    Re-run with a different inter-sentence pause to land on 9 minutes:\n\n` +
    `      node video/script/generate-audio.mjs --gap ${Math.max(150, suggested)}\n\n` +
    `    (currently ${pacing.sentenceGapMs}ms across ${gaps} sentence boundaries)`,
  );
}
if (ENGINE === 'espeak') console.log('\n  ⚠ espeak placeholder audio — for pipeline testing only, do not ship.');
