# AI Interview Assistant (portfolio project)

Real-time desktop overlay that listens to system audio, transcribes the interviewer's
question (Deepgram streaming STT), retrieves relevant context from your own resume/docs
(RAG over OpenAI embeddings), and generates a natural, spoken-style answer with GPT-4o /
GPT-4o-mini, streamed live into a small always-on-top window. After ~3 seconds of silence
from the other side, it answers automatically — no manual trigger needed.

**Note on scope:** the overlay is a normal Electron window. It is visible like any other
app if you share your screen or window in Zoom/Meet/Teams — there is intentionally no
logic to hide it from screen capture. The app also doesn't show an icon in the Windows
taskbar or macOS Dock (it's tray/menu-bar-resident only, like Dropbox or 1Password) —
that's purely about not cluttering the taskbar/Dock for a background utility; it has no
effect on whether the overlay window is visible or capturable.

**Platform status:** fully functional on both **Windows** and **macOS**. Windows works
out of the box with no extra setup. macOS requires installing a free virtual-audio driver
once (see below) for live listening — after that one-time setup, no in-app configuration
is needed.

## Prerequisites (both platforms)

- **Node.js 18+** — check with `node -v`. Get it from [nodejs.org](https://nodejs.org) if needed.
- **A Deepgram API key** — sign up at [deepgram.com](https://deepgram.com) (free trial credit included).
- **An OpenAI API key** — from [platform.openai.com](https://platform.openai.com) (needs billing enabled for embeddings + chat).
- **A folder with your resume/docs** — any mix of `.pdf`, `.docx`, `.md`, `.txt` files.

---

## Windows install

1. **Download/clone the project folder** onto your machine.
2. Open a terminal (PowerShell or cmd) in the project folder:
   ```
   cd "path\to\project"
   ```
3. **Install dependencies** (only needed once, or after pulling code changes):
   ```
   npm install
   ```
4. **Build**:
   ```
   npm run build
   ```
5. **Run**:
   ```
   npm start
   ```
   This rebuilds and launches the app. Two windows should appear: the small overlay
   (top-right of your screen) and, the first time, a **Settings** window.
6. **Configure it** in Settings:
   - Paste your Deepgram API key
   - Paste your OpenAI API key
   - Pick a chat model (`gpt-4o-mini` is fastest)
   - Click **Browse...** and select your resume/docs folder
   - Click **Save** — it indexes your docs (chunks + embeds them) and shows how many
     chunks it found
7. Close the Settings window. The overlay's mic status should say `connecting to
   Deepgram...` then switch to `listening` (turns green).
8. Windows may prompt for **desktop audio/screen-capture permission** the first time —
   allow it. This is required for the app to capture your system's audio output (what
   you hear through your speakers/headphones, including Zoom/Meet/Teams).
9. Play or speak a question through your speakers — it should auto-transcribe into the
   "Question" box and start streaming an answer within a few seconds of you going quiet.
   You can also type a question into the bottom input box and hit **Ask** any time.
10. The app keeps running in the **system tray** even if you close the overlay or
    Settings window (it has no taskbar icon by design). Right-click the tray icon for
    **Show/Hide Overlay**, **Settings**, and **Quit** (use Quit to fully stop the app —
    closing windows alone won't).

---

## macOS install

Steps 1-6 are identical to Windows and fully supported:

1. **Download/clone the project folder** onto your Mac.
2. Open Terminal in the project folder:
   ```
   cd "path/to/AI Interview assistant"
   ```
3. ```
   npm install
   ```
4. ```
   npm run build
   ```
5. ```
   npm start
   ```
   The overlay and (on first run) Settings window should appear.
6. **Configure it** in Settings exactly as above: Deepgram key, OpenAI key, chat model,
   docs folder, Save.

7. **One-time audio setup (required for live listening):** macOS doesn't allow apps to
   directly capture system output audio the way Windows does — Apple blocks that at the
   OS level. The workaround is a free virtual audio driver:
   - Install [BlackHole](https://github.com/ExistentialAudio/BlackHole) (2ch version is fine).
   - Open macOS's **Audio MIDI Setup** app (Spotlight search for it), click the **+** in
     the bottom-left, choose **Create Multi-Output Device**, and check both your normal
     output (speakers/headphones) and **BlackHole 2ch**.
   - Set that new Multi-Output Device as your system sound output (System Settings ->
     Sound -> Output, or via the menu bar volume icon). This way you still hear everything
     normally while it's simultaneously routed to BlackHole.
   - **That's it — no in-app setup needed.** The app automatically looks for a device
     named "BlackHole" every time it starts and uses it if found. macOS will prompt for
     microphone permission the first time (needed to read audio device names) — allow it.
8. The overlay's mic status should switch to `listening` (turns green) once BlackHole is
   found. If it instead says `BlackHole not found`, double check the driver installed
   correctly and the Multi-Output Device is your active output. Either way, **the manual
   question box (type + hit Ask) always works**, independent of audio setup.
9. Quit fully via the tray/menu-bar icon when done — closing windows alone keeps the app
   running in the background (no Dock icon, by design).

---

## How it works

- `src/services/deepgram.ts` — streaming STT over Deepgram's live WebSocket API, with
  auto-reconnect (exponential backoff) if the connection drops.
- `src/services/docIngest.ts` + `src/services/rag.ts` — parses PDF/DOCX/MD/TXT files,
  chunks them, embeds each chunk with `text-embedding-3-small`, caches embeddings to
  disk (keyed by file hash, so unchanged files aren't re-embedded), and retrieves the
  top-k most relevant chunks per question via cosine similarity.
- `src/services/llm.ts` — builds a single prompt (system instructions + retrieved
  context + rolling conversation history + question) and streams the answer from
  OpenAI so tokens appear as they're generated rather than waiting for the full reply.
  The system prompt explicitly handles three cases: answers grounded in your docs,
  scenario/hypothetical questions extrapolated from related context, and fully
  out-of-context questions answered from general knowledge.
- `src/main/main.ts` — Electron main process orchestration: wires audio chunks from the
  overlay renderer into Deepgram, accumulates transcribed speech into a rolling buffer,
  and fires the RAG+LLM pipeline once ~3 seconds pass with no new speech (or immediately
  if you ask manually), streaming results back to the overlay via IPC.
- `src/renderer/overlay` — the sticky-note style overlay UI (drag to move, shows live
  question + streaming answer, plus a manual text-input fallback for typing a question
  directly). Audio capture branches by platform: Windows uses Chromium's desktop-loopback
  trick; macOS auto-detects a "BlackHole" input device by name and captures from it
  directly — no manual device selection needed on either platform.

## Known limitations / next steps

- On macOS, live listening depends on BlackHole being installed and set as part of the
  active output device (see macOS section above) — there's no in-app fallback if it's
  missing beyond the manual question box.
- API keys are stored in plaintext locally (`electron-store`, no encryption enabled) —
  fine for a personal single-user machine, not for a shared one.
- The tray icon (`assets/tray-icon.png`) is a 1x1 placeholder — swap in a real icon.
- Retrieval is a simple in-memory cosine-similarity search, sized for a resume + a
  handful of docs. It would need a real vector store for a much larger corpus.
- No packaging (electron-builder) set up yet — this runs via `npm start` in dev.
