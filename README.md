# TTS Reader

A calm, privacy-first, mobile-first WCAG 2.2 AA text-to-speech reading studio built with React, TypeScript, Vite, Tailwind CSS, Radix UI, Dexie, and Express/Vercel serverless endpoints.

**"Everything runs in your browser. No text leaves your device unless you opt into an external provider or web importer."**

## Architecture

```mermaid
flowchart LR
  UI[React + Radix UI] --> Engine[Framework-free TtsEngine]
  Engine --> Chunker[Intl.Segmenter Chunker]
  Engine --> WebSpeech[Browser Web Speech]
  Engine --> Kokoro[Kokoro-82M WebGPU/WASM Worker]
  Engine --> Piper[Piper WASM Worker Opt-In]
  Engine --> Remote[Remote OpenAI / Kokoro-FastAPI]
  Engine --> Google[/api/google-tts Opt-In Cloud]
  UI --> Importers[Lazy PDF / OCR / DOCX / EPUB / URL]
  Importers --> Extract[/api/extract + SSRF Guard]
  UI --> Export[16-bit WAV + MP3 + CUE + JSON Export]
  UI --> Dexie[(IndexedDB: Docs, Highlights, Stats)]
  UI --> SLM[On-Device SLM Worker Opt-In]
```

## Provider Comparison

| Provider | Download Size | Offline | Word Boundaries | Audio Export | License |
|---|---|---|---|---|---|
| Browser Native (`speechSynthesis`) | 0 MB | Local voices only | Browser-dependent + estimator | Not possible | Browser built-in |
| Kokoro Neural (`kokoro-js`) | ~86 MB (`q8` / `fp32`) | Yes (cached) | Estimated progress | WAV + CUE / JSON | Apache-2.0 |
| Piper WASM (feature-flagged) | Per-voice (~15–60 MB) | Yes (cached) | Estimated progress | WAV + CUE / JSON | GPL-3.0 / MIT + model card |
| Google Cloud TTS (opt-in) | 0 MB client | No (via `/api/google-tts`) | Estimated progress | Direct MP3 + WAV | Google Cloud API (`GOOGLE_TTS_KEY`) |
| Remote OpenAI / Kokoro-FastAPI | 0 MB client | No (local LAN / server) | Estimated progress | WAV / MP3 / Opus / FLAC | Self-hosted |

## Self-Hosting Kokoro-FastAPI (Docker) & Google Cloud TTS

```bash
docker run -d --name kokoro-tts -p 8880:8880 \
  -e CORS_ORIGINS="*" \
  ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

Then select **Remote Server** in **Voice Lab**, enter `http://localhost:8880`, and click **Test connection**.

To enable **Google Cloud Text-to-Speech**, set `GOOGLE_TTS_KEY` in `.env` (or Vercel Environment Variables), open **Voice Lab**, review and check the opt-in consent box, and click **Activate Google Cloud TTS**.

## Local Development & Scripts

```bash
npm install
npm run dev        # Express 5 + Vite middleware on http://localhost:3000 with COOP/COEP
npm run build      # Production Vite build + PWA service worker
npm run preview    # Local Vite preview server
npm run typecheck  # Strict TypeScript check
npm run lint       # ESLint + React hooks validation
npm run test       # Vitest unit tests
npm run eval:slm   # Deterministic normalizer / SLM evaluation suite
```

## Privacy & Security

- Zero telemetry, zero analytics, and zero third-party font/script CDNs.
- COOP (`same-origin`) and COEP (`require-corp`) enabled for multi-threaded ONNX WASM.
- `/api/extract` includes strict SSRF guards blocking private RFC1918 IPv4, IPv6 ULA/link-local, loopback, metadata endpoints (`169.254.169.254`), non-HTTP schemes, credentialed URLs, DNS rebinding, >5 MB responses, and >3 redirects.
- `/api/google-tts` requires explicit `consentGranted: true`, validates max 4,000 characters, applies 30 req/min rate limiting, sets `Cache-Control: no-store`, and never logs user reading text.
- Optional cloud features (Cluster C11 Supabase sync & Claude AI summaries) are feature-flagged OFF by default in `src/config/features.ts`.

## Known Browser Limitations & Accessibility

- **iOS / Safari**: Built-in Web Speech requires playback to start directly from a user tap (`Tap to start` recovery state). Background tab audio playback may be suspended by iOS power management when the screen locks. All inputs use `16px+` typography below `768px` to prevent Safari auto-zoom, and `visualViewport` hides the mini player while typing.
- **Screen Readers & Touch**: Uses a single `<h1>`, full landmark regions, `aria-live="polite"` for playback state only (never word-by-word spam), >=44px minimum touch targets (expandable to 52px via Settings → Accessibility → Large controls), and `prefers-reduced-motion` support.
- **Audio Export**: Browser `speechSynthesis` does not expose an audio stream to web apps; switch to **Kokoro Neural**, **Google Cloud TTS**, or **Remote Server** to export WAV or MP3 audio.
