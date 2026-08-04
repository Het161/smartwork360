# SMARTWORK 360 — demonstration video pipeline

Produces two files from one pipeline:

| File | Length | For |
|---|---|---|
| `out/smartwork360-full-demo.mp4` | ~9 min | The full walkthrough for officials |
| `out/smartwork360-short-demo.mp4` | ~90 s | A first introduction to email |

Plus `out/*.srt` sidecars, so the videos can be uploaded with selectable captions
as well as the burnt-in ones.

Everything is scripted. Nothing is clicked by hand, so a change to the app means
re-running one command, not re-recording a take.

---

## Run it

Prerequisites — all four, in the repo root:

```bash
docker compose up -d          # postgres on :5432
npm install
npm run seed                  # a realistic district office
npm run dev                   # web :3000, api :4000
npm run dev:ml                # optional, second terminal
```

Then:

```bash
npm run video                 # audio → record → assemble → check
```

Or one stage at a time:

```bash
npm run video:audio           # narration mp3 + srt, writes measured durations
npm run video:record          # Playwright records all 15 scenes
npm run video:build           # ffmpeg assembles both cuts
npm run video:qc              # mechanical checks + a contact sheet
```

Re-record a single scene without redoing the rest:

```bash
npx playwright test --config video/scenes/playwright.config.ts --grep scene-10
node video/build/assemble.mjs
```

Regenerate one scene's narration after editing its words:

```bash
node video/script/generate-audio.mjs --only scene-06
```

First run only: `npx playwright install chromium`.

---

## How it fits together

```
script/narration.json     the words, the pacing, and the measured durations
   ↓  generate-audio.mjs
audio/scene-XX.mp3+srt    one clip per sentence, joined with measured gaps
   ↓  record.spec.ts      visuals paced to those exact durations
raw/scene-XX.webm         one Playwright context per scene
   ↓  assemble.mjs
out/*.mp4 + *.srt
```

**Audio is authored first and the visuals are paced to it.** Every scene reads
`measured[id].sentences[i].start` and holds until that moment before playing its
next beat, so a visual lands on the words that describe it. Doing this the other
way round — recording first, then fitting narration — is what makes demo videos
drift out of sync, and it cannot happen here.

The recorded scenes came in within **0.01 s** of their narration.

### Timeline maths, since this is where these pipelines break

Each scene is held for `narration + 0.7 s`. Scenes are joined with a 0.4 s
crossfade, which shortens the timeline at every join, so scene *i* starts at
`Σ L(j<i) − i × 0.4`.

The narration track is built **separately**, as a plain concatenation with 0.3 s
of silence between clips — which is exactly the per-scene advance minus the
narration length. It therefore lines up with the crossfaded video without being
crossfaded itself. Running the audio through `acrossfade` instead would duck the
first word of every scene, which is the usual reason one of these sounds wrong.

`0.7 − 0.4 = 0.3 s` of breath between scenes, as intended.

---

## Things worth knowing before you send this to anyone

### 1. Two lines of narration overstate what the system does

I wrote the script exactly as specified, but two lines are worth a second look —
this audience is the one most likely to catch them, and the pitch elsewhere is
built on not overclaiming.

**Scene 06** — *"The morale indicator reads the tone of written updates **using a
language model**…"*

Your own README says the opposite, and says it as a strength: you measured
DistilBERT against a lexicon scorer on this domain and **the lexicon won**
(87.5% vs 85.0%), so the lexicon is what shipped. The card on that very screen
can read `Lexicon (offline mode)`. An NIC officer who reads the repo will notice.

Suggested replacement, same length, and stronger:

> "The morale indicator scores the words officers actually write — including
> Hinglish — giving an early signal that a team is under strain."

**Scene 13** — *"It installs on a phone as an application…"*

True of the manifest, but there is no `beforeinstallprompt` handler and no
in-app install button anywhere in the code — installation is entirely Chrome's
own omnibox affordance. The scene therefore shows the phone layout and the
installable manifest, not a click-to-install. The narration line is defensible
as written; just don't let anyone ask you to demonstrate the tap on stage.

Both flags are recorded in `script/narration.json` under `accuracyFlag`.

### 2. The voice

`en-IN-NeerjaNeural` via `edge-tts`, at `--rate=-4%` for a measured pace.

edge-tts drives Microsoft's Edge read-aloud endpoint, which Microsoft intends
for that browser feature. That is fine for a hackathon demo. **If this video
ever goes into commercial or official distribution, regenerate the voice track
with a licensed service** — Azure Speech, Google Cloud TTS or ElevenLabs. The
pipeline is unchanged; only the `say()` function in `script/generate-audio.mjs`
changes.

Note that edge-tts removed custom SSML support in 5.0.0, so the pipeline uses
the `--rate`, `--volume` and `--pitch` flags rather than SSML tags.

**edge-tts returns 403 from datacenter IP ranges.** Run `video:audio` from a
normal connection. There is a `--engine espeak` flag for exercising the assembly
offline; it sounds robotic and must never be shipped.

### 3. Scene 10 and the 30-second poll

`/a/audit` refetches every 30 seconds, so after `demo:tamper` the banner turns
red **on its own** whether or not anyone presses anything. The recorder
navigates to the page fresh immediately before verifying, which restarts that
timer and leaves a full 30-second window — so on camera it is the button press
that flips the banner, which is what the narration claims.

### 4. Scenes that need a specific account

- **Scene 06** signs in as `anil.kulkarni@gov.in`, *not* the Manager quick-login
  chip. The chip is Sunita Deshmukh (Revenue); the planted burnout case, Ramesh
  Patel at 85/100, lives in Public Works, and every manager query is scoped by
  department. The chip would show an empty, uninteresting section.
- **Scene 12** signs in as the admin. The department field in the New task modal
  only renders for `role === 'ADMIN'`, and Health + Critical is the combination
  your seed deliberately leaves without an SLA policy — so the 400 is genuine,
  not staged.

### 5. Saarthi in scene 12

Needs `SUPPORT_LLM_API_KEY` reachable. Without it the assistant still works and
still applies the fix, but its replies carry an `Offline mode` chip that will be
visible on camera while the narration does not mention it. Check the key before
recording, or accept the chip — the auto-fix and the refusal both work offline,
which is a fair thing to show a government audience.

### 6. The fake cursor is not optional

Playwright's recorder draws no pointer. Without one, menus open and fields fill
themselves and nobody can follow what is being demonstrated. `scenes/cursor.ts`
injects one and every interaction goes through it — there are no bare
`page.click()` calls in the recorder. It also hides the floating help button,
which otherwise animates in the corner of every single frame.

### 7. dnd-kit and the kanban drag

`locator.dragTo()` does not work on this board, for two reasons that are both in
the installed dnd-kit source: the move that crosses the 6 px activation
threshold returns before dispatching `onMove`, and `over` is only committed
after a React render plus an effect. The recorder therefore issues
pointerdown → threshold nudge → real travel → final nudge → pause → pointerup.
Remove the pause and the card silently snaps back with no error.

---

## Deliberate omissions

No stock footage, no presenter webcam, no music bed, no voice clone, no logo
animation over 3 seconds, and no claim anywhere that the system is deployed in
an actual government office.

Background music is off by default and should stay off — for this audience clean
narration is more appropriate. If it is ever added, keep it under −28 dB and use
a royalty-free track.

---

## Files

```
video/
├── script/narration.json      words, pacing, measured durations
├── script/generate-audio.mjs  TTS + SRT, per sentence
├── scenes/cursor.ts           pointer overlay, ripple, emphasis
├── scenes/helpers.ts          contexts, login, waits, pacing
├── scenes/record.spec.ts      all 15 scenes
├── scenes/playwright.config.ts
├── cards/                     title · problem · terminal · architecture · closing · mobile
├── raw/                       Playwright webm, one per scene
├── build/assemble.mjs         ffmpeg
├── qc/check.mjs               mechanical checks + contact sheet
└── out/                       the deliverables
```

## Encoding

H.264 · 1920×1080 · 30 fps · CRF 18 · `preset slow` · `yuv420p` · AAC 192k ·
48 kHz · `+faststart`. Audio normalised with `loudnorm` to −16 LUFS, −1.5 dBTP.

Captions are burnt in with
`FontName=Inter,FontSize=22,PrimaryColour=&HFFFFFF&,BackColour=&HA0522814&,BorderStyle=4,Alignment=2,MarginV=60`
and also exported as a sidecar `.srt`.
