# Deployment & Vercel Audit (`DEPLOY_AUDIT.md`)

## 1. Root Cause Summary

1. **Build Output & Scripts Alignment**: In earlier standalone commits of the repo, `npm`/`bun run build` only checked `server.js` instead of running `vite build`, causing Vercel's `[STATIC_BUILD_NO_OUT_DIR] No Output Directory named "dist" found` failure.
   - Fixed in `/package.json`: `"build": "vite build"`, `"preview": "vite preview"`, `"typecheck": "tsc --noEmit"`, `"engines": { "node": "22.x" }` (while retaining `"dev": "tsx server.ts"` and `"start": "NODE_ENV=production tsx server.ts"` for unified Express + Vite runtime).
   - Fixed in `/vercel.json`: Explicit `"framework": "vite"`, `"buildCommand": "bun run build"`, `"outputDirectory": "dist"`, SPA fallback rewrite `"/((?!api/).*)" -> "/index.html"`, and COOP/COEP headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`).

2. **Vite Entry & Output Directory**:
   - `/index.html` is at the repository root.
   - `/vite.config.ts` outputs to `dist` (default Vite `outDir`) with `dist/index.html`, `dist/wasm/*` (`onnxruntime-web` SIMD WASM assets), and Workbox PWA service worker assets (`dist/sw.js`).

3. **COOP/COEP & Third-Party CDN Compatibility**:
   - Threaded ONNX WASM (`kokoro-js`, `@mintplex-labs/piper-tts-web`) requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
   - Fonts (`@fontsource/inter`, `@fontsource/literata`, `@fontsource/opendyslexic`), icons, workers, and WASM files are 100% self-hosted from `/`, avoiding external CDN blocks.
   - Model weight fetches from `huggingface.co` are permitted under `connect-src` in CSP and cached in `hf-model-weights-v1`.

## 2. Express & Vercel Serverless Parity Map

| Route | Purpose | Dependencies | Express (`server.ts`) | Vercel (`/api/*`) |
|---|---|---|---|---|
| `POST /api/extract` | Opt-in readable web article extraction with strict SSRF IP/DNS guard, 5 MB/8s limits, 20 req/min rate limit, and HTML sanitization | `@mozilla/readability`, `linkedom`, `dompurify` | Yes | `/api/extract.ts` |
| `POST /api/tts` | Optional OpenAI-compatible / Kokoro-FastAPI proxy using server `TTS_BASE_URL` & optional `TTS_API_KEY`, 4,000-char cap, zero text logging | Built-in `fetch` | Yes | `/api/tts.ts` |
| `POST /api/google-tts` | Dedicated Google Cloud Text-to-Speech v1 proxy using server `GOOGLE_TTS_KEY`, opt-in consent gate, 4,000-char cap, returns `{ audioContent }` MP3 with `Cache-Control: no-store` | Built-in `fetch` | Yes | `/api/google-tts.ts` |
| `POST /api/summarize` | Optional Cluster C11 Claude summarization proxy (`ANTHROPIC_API_KEY`, feature-flagged OFF by default, consent-gated) | Built-in `fetch` | Yes | `/api/summarize.ts` |

## 3. Environment Variables & Secret Hygiene

| Variable | Exposure | Default | Purpose |
|---|---|---|---|
| `TTS_BASE_URL` | Server-only (`process.env`) | Unset | Upstream URL for `/api/tts` |
| `TTS_API_KEY` | Server-only (`process.env`) | Unset | Optional Bearer key for `/api/tts` |
| `GOOGLE_TTS_KEY` | Server-only (`process.env`) | Unset | Google Cloud Text-to-Speech API key for `/api/google-tts` |
| `ANTHROPIC_API_KEY` | Server-only (`process.env`) | Unset | Claude summary key (feature-flagged OFF) |
| `VITE_SUPABASE_URL` | Client public URL | Unset | Optional Supabase sync (feature-flagged OFF) |
| `VITE_SUPABASE_ANON_KEY` | Client public anon key | Unset | Optional Supabase sync (feature-flagged OFF) |

- `.gitignore` excludes `.env`, `.env.*`, and `*.local`, while keeping `.env.example` tracked without secrets.

## 4. Vercel Dashboard & Redeploy Checklist

1. **Framework Preset**: `Vite`
2. **Build Command**: `bun run build`
3. **Output Directory**: `dist`
4. **Node.js Version**: `22.x`
5. **Environment Variables**: Add `GOOGLE_TTS_KEY` (and optional `TTS_BASE_URL` / `TTS_API_KEY`) in **Project Settings → Environment Variables** if remote/cloud voices are desired.
6. **Verify after deploy**:
   - Refreshing deep links serves `/index.html` cleanly.
   - `GET /` includes `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
   - `POST /api/extract` returns clean JSON for public HTML articles and blocks `http://127.0.0.1` and `http://169.254.169.254` with HTTP `400`/`403`.
   - `POST /api/google-tts` requires `consentGranted: true` and returns `501` cleanly when `GOOGLE_TTS_KEY` is unset.

## 5. `bun pm untrusted` Postinstall Audit

| Package | Blocked Script | Needed by App? | Decision |
|---|---|---|---|
| `tesseract.js` | `opencollective-postinstall \|\| true` | No (funding notice only) | Keep blocked |
| `core-js` | Postinstall banner | No | Keep blocked |
| `protobufjs` | `scripts/postinstall` | No (precompiled browser bundles used) | Keep blocked |
| `es5-ext` | Funding notice | No | Keep blocked |
| `onnxruntime-node` | Native binary download (`./script/install`) | No (client runs `onnxruntime-web` WASM/WebGPU) | Keep blocked |

