# Phase 0 Audit — TTS Reader (`syedsz-1519/tts-reader`)

## 1. Current Stack & Architecture

- **Frontend**: Single monolithic static file (`index.html`, 1,075 lines) combining inline CSS variables/rules, semantic-ish HTML markup, and procedural vanilla JavaScript in a global `<script>` block. No TypeScript, no bundler (Vite), no component framework (React), and no automated test or lint pipeline.
- **Backend / Hosting**: Added minimal Express static wrapper (`server.js`) and `package.json` during AI Studio import so the static `index.html` serves on `0.0.0.0:3000`. No API routes, no security/COOP/COEP headers, and no `vercel.json`.
- **Fonts & Assets**: Relies on external Google Fonts CDN (`Instrument Serif`, `IBM Plex Mono`, `Lato`). No PWA manifest, service worker, or icons.
- **TTS Engine**: Direct inline calls to `window.speechSynthesis` coupled tightly to DOM element references (`textDisplay`, `speedSlider`, `voiceSelect`, etc.).

## 2. Existing Feature List

1. Default sample text loaded into a reading card with click-to-seek per word.
2. Play/Pause, Stop, and Restart controls with a `<progress>` bar and `X / Y words` counter.
3. Speed (`0.5x–2.0x`) and Pitch (`0.5–2.0`) range sliders.
4. Language selector (English, Hindi, Hinglish, Telugu, Teglish, Urdu, Roman Urdu, Arabic) filtering `speechSynthesis.getVoices()`.
5. Custom text `<textarea>` with `.txt` file picker, Clear, and Load & Read actions.
6. Unversioned `localStorage` persistence (`tts-reader-state`) for draft text, active text, speed, pitch, language, and voice URI.
7. Basic keyboard shortcuts (`Space`, `S`, `R`, `ArrowUp`, `ArrowDown`).

## 3. Audit Findings (P0 / P1 / P2)

| ID | Severity | Location | Cause | Proposed Fix |
|---|---|---|---|---|
| AUD-01 | **P0** | `index.html:827-926` | No deterministic state machine; relies on `isPlaying` boolean and unreliable `window.speechSynthesis.paused`, causing desyncs and double-queueing on rapid clicks. | Extract a framework-free `TtsEngine` class with explicit `idle → loading → speaking → paused → error` state machine and session/click guards. |
| AUD-02 | **P0** | `index.html:834-850` | Chunker slices purely by `WORDS_PER_CHUNK = 40` and `CHARACTERS_PER_CHUNK = 180` (`words.slice`), splitting mid-sentence and breaking abbreviations/decimals; no non-local Chrome keep-alive. | Implement `Intl.Segmenter` sentence chunker (160–220 chars, hard max 300, abbreviation-safe regex fallback) + 10s `pause()+resume()` keep-alive for `!voice.localService`. |
| AUD-03 | **P0** | `index.html:860-866` | Word highlighting relies solely on `utterance.onboundary`, which does not fire on Android, iOS, and many desktop voices; zero sentence-level highlighting. | Implement sentence-level highlight always + boundary-corrected word estimator (`chars / (rate * 14)`). |
| AUD-04 | **P0** | `index.html:877-883` | `utterance.onerror` only ignores `'interrupted'` and logs to console; fails silently or breaks on `not-allowed` (iOS autoplay block), `network`, `synthesis-failed`, `voice-unavailable`. | Map all `SpeechSynthesisErrorEvent` codes to plain-language UI messages, expose a visible **"Tap to start"** state for autoplay blocks, and add a Retry action. |
| AUD-05 | **P0** | `index.html:993,1010,1020` | Uses blocking `window.alert()` for validation/file errors, which is blocked in sandboxed iframes and breaks accessibility. | Replace all `alert()` calls with accessible Radix Toast notifications (`role="status"`) and inline validation banners. |
| AUD-06 | **P1** | `index.html:726-746,799-815` | `buildWordSpans()` wraps every word in the entire document in a `<span>` with an individual click listener; `highlightWord()` iterates all words (`O(N)`) on every boundary. Crashes/lags on 50k+ chars. | Render `<p>` + `<span data-s="n">` per sentence; wrap words only in the active sentence; update highlights via refs/classes throttled with `requestAnimationFrame`; virtualize >50k chars. |
| AUD-07 | **P1** | `index.html:751-795` | `loadVoices()` only checks `getVoices()` once + `onvoiceschanged`; misses async browser loading windows and leaves Play active when 0 voices exist. | Poll `getVoices()` up to 3s alongside `voiceschanged`; show loading skeleton and disabled Play tooltip while loading; show helpful zero-voice empty state. |
| AUD-08 | **P1** | `index.html:964-986` | Slider `input` events restart speech immediately on every pixel move without debouncing, flooding `speechSynthesis.cancel()`. | Debounce rate/pitch/voice restarts by 250ms and resume cleanly from the current chunk. |
| AUD-09 | **P1** | `index.html:9` | External Google Fonts CDN fails offline and will be blocked by `Cross-Origin-Embedder-Policy: require-corp` required for WASM threads. | Self-host `Inter`, `Literata`, and `OpenDyslexic` locally via `@fontsource/*`. |
| AUD-10 | **P1** | `index.html:15-26` | Single warm-cream theme with insufficient muted contrast (`#8a7d68` on `#fffdf8` ≈ 3.98:1 < 4.5:1); lacks Light/Dark/Sepia/System themes and `DESIGN.md` tokens. | Implement full `DESIGN.md` token system (`Light`, `Dark`, `Sepia`, `System`) meeting ≥ 4.5:1 (≥ 7:1 reading text) contrast and `color-scheme`. |
| AUD-11 | **P1** | `index.html:680-718` | Unversioned `localStorage` key (`tts-reader-state`), no volume control, no playback position (`chunkIndex` + `charOffset`) persistence, no saved library. | Persist versioned `tts_v1` state in `localStorage` (with `try/catch`) plus a 50-document local library in IndexedDB (Dexie). |
| AUD-12 | **P1** | `index.html:476-626` | No semantic landmarks (`nav`, `main`, `aside`, player region), no `aria-live="polite"` state announcer, missing `aria-label` on buttons, no focus trap on modals, sub-44px controls on mobile. | Build with Radix UI primitives, WCAG 2.2 AA landmarks, 3px `--focus` rings, ≥ 44px touch targets, `aria-valuetext`, and state-only `aria-live`. |
| AUD-13 | **P2** | `index.html:499-625` | Missing `.md`/`.pdf` drag-drop & parsing, 500k char guard, clipboard read, RTL `dir="auto"`, pronunciation dictionary/filters, sleep timer, Media Session API, PWA, SEO, and unit/E2E tests. | Migrate to React + TypeScript + Vite with full Phase 2–6 feature set, PWA (`vite-plugin-pwa`), Vitest, and Playwright smoke suite. |
