# Changelog

## 1.2.0 — Mobile-First UI Polish (Phases 1–7)
- **Mobile-First Foundation & Responsive Shell**: Audited screens across `280px`–`1440px+` in `UI_AUDIT.md`; added `100dvh`/`100svh`, safe-area inset helpers, `touch-action: manipulation`, `>=44px` tap targets, iOS `16px` input zoom guard, `@media (hover: hover)` hover scoping, `useVisualViewport` keyboard avoidance (auto-hides player bar while typing), and `useScrollDirection` auto-hiding compact `56px` mobile header.
- **Mobile Mini Player & Full Player Sheet (`<768px`)**: Added swipe-up / tap-to-expand sticky `64px` mini player revealing a full-height sheet with `72px` Play button, scrubber, `0.75/1/1.25/1.5/2` speed chips, volume slider, sleep timer chips, and voice picker.
- **Drawers, Sheets & Gestures**: Added left-edge swipe gesture and focus-trapped slide-over `LibrarySidebar` (`min(85vw, 340px)`), `50%`/`90%` snap-point mobile `SettingsPanel` bottom sheet with collapsible accordions and sticky `Done` footer, `mobileSheet` behavior on modal dialogs, and `content-visibility: auto` on reader paragraphs.
- **Reader Long-Press & Accessibility**: Added 450ms long-press / right-click floating sentence Highlight & Note popover, horizontal scrollable mobile toolbar/input chip rows, landscape phone layout mode (`height <= 480px`), `"Large controls"` accessibility toggle (`52px` targets), and persisted desktop panel collapse state.

## 1.1.0 — Google Cloud TTS & Vercel Deployment Hardening
- **Google Cloud Text-to-Speech Integration**: Added `/api/google-tts` Express & Vercel serverless proxy (`GOOGLE_TTS_KEY`), `GoogleCloudTtsProvider` with explicit privacy consent gate, multilingual voice catalog, and direct **Export MP3** support in `SettingsPanel` and `VoiceLabDialog`.
- **Vercel Deployment & Bundle Optimization**: Audited deployment requirements in `DEPLOY_AUDIT.md`, verified `vercel.json` COOP/COEP + SPA rewrites + serverless routes, audited `bun pm untrusted` packages, and lazy-loaded heavy secondary dialogs (`VoiceLabDialog`, `SlmToolsDialog`, `ShortcutsDialog`, `StatsView`) to keep initial entry JS under `50 kB` gzip.

## 1.0.0 — Clusters C0 through C11
- **C0 Audit**: Completed codebase & security audit in `AUDIT.md` and `ADDONS_AUDIT.md`.
- **C1 Core Engine**: Implemented framework-free `TtsEngine` state machine, `Intl.Segmenter` sentence/chunk splitter, Chrome keep-alive only for non-local voices, mid-speech 250ms debounced restart from active chunk, and adaptive word boundary estimator (`useTts`).
- **C2 Design System & UI**: Built Light, Sepia, and Dark themes from `DESIGN.md`, self-hosted fonts (`Inter`, `Literata`, `OpenDyslexic`), 3-pane desktop layout + mobile bottom sheet, Radix `VoiceLabDialog`, `SettingsPanel`, `LibrarySidebar`, `PlayerBar`, and `ShortcutsDialog`.
- **C3–C4 Providers**: Added Web Speech, offline Kokoro Neural (`kokoro-js` WebGPU/WASM worker with download confirm & storage cleanup), optional Piper WASM worker (feature-flagged), Remote OpenAI / Kokoro-FastAPI provider, and automatic fallback to Web Speech.
- **C5 Importers**: Added lazy-loaded TXT, MD, PDF (header/footer/hyphen cleaner + scanned PDF detection), on-device OCR (`tesseract.js`), DOCX (`mammoth`), EPUB (`epubjs` chapters), and SSRF-hardened `/api/extract` URL extraction + bookmarklet.
- **C6 Reader Experience**: Implemented `dir="auto"` RTL support, rAF/DOM-ref active word highlighting, Follow-Along with manual-scroll "Jump to current" pill, Focus Mode, Reading Ruler, 50-doc Dexie library, 4-color highlights/notes with Markdown export, and local stats.
- **C7 Export**: Implemented 16-bit PCM WAV stitching with 120ms silence gaps, 5ms edge fades, `.cue` sheets, and JSON chapter markers, plus honest Web Speech limitation UI.
- **C8 Platform & PWA**: Added `vite-plugin-pwa` manifest, offline caching, `useMediaSession`, `useWakeLock`, Web Share Target / `#text=` handler, and iOS/offline states.
- **C9 On-Device SLM**: Added quantized `onnx-community/SmolLM2-360M-Instruct-ONNX` (~260 MB) and `Qwen2.5-0.5B-Instruct` (~483 MB) worker behind `FEATURES.onDeviceSlm` with deterministic rule-based cleanup fallback and Diff Preview (`Accept All` / `Dismiss`).
- **C10–C11 Quality, Security & Optional Cloud**: Configured COOP/COEP/CSP headers in Express (`server.ts`) and Vercel (`vercel.json`), added SSRF/cleaner/filter/WAV/fallback Vitest suites, Playwright smoke tests, SEO/JSON-LD metadata, and opt-in C11 placeholders.
