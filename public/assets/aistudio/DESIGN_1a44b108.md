# DESIGN.md: TTS Reader

Single source of truth for the TTS Reader UI. Every screen and component must follow this file.
If something is not covered here, choose the simplest option that matches the principles below and add it to this file.

---

## 1. Product feel

**Calm, focused, professional reading app.** Think Apple Books meets Linear. Not a toy, not a generic template.

| Principle | What it means in practice |
|---|---|
| Reading first | The text is the hero. Chrome stays quiet and recedes while audio plays. |
| One primary action | Play/Pause is always the most prominent control on screen. |
| Honest | Never fake features. Browser speech cannot export audio, so there is no fake "Download MP3". |
| Private | "Everything runs in your browser. No text leaves your device." Say it in the UI. |
| Accessible by default | WCAG 2.2 AA is the floor, not a stretch goal. |

---

## 2. Design tokens

Define on `:root`. Themes override via `[data-theme="light|dark|sepia"]`. Default follows `prefers-color-scheme`.

```css
:root {
  /* Spacing (4px scale) */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px; --s-12: 48px; --s-16: 64px;

  /* Radii */
  --r-sm: 8px; --r-md: 12px; --r-lg: 20px; --r-full: 999px;

  /* Type scale */
  --fs-xs: 12px; --fs-sm: 14px; --fs-md: 16px; --fs-lg: 18px;
  --fs-xl: 22px; --fs-2xl: 28px; --fs-3xl: 36px;

  /* Fonts */
  --font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-read: 'Literata', Georgia, 'Times New Roman', serif;
  --font-dyslexic: 'OpenDyslexic', 'Comic Sans MS', sans-serif;
  --font-reader: var(--font-read);          /* user-selectable */

  /* Reading */
  --read-size: 20px;                         /* user range 16-32 */
  --read-lh: 1.7;
  --read-measure: 68ch;                      /* allowed 62-72ch */

  /* Motion */
  --dur-fast: 100ms; --dur-base: 150ms; --dur-slow: 250ms;
  --ease: cubic-bezier(.2, .0, .0, 1);

  /* Elevation */
  --shadow-1: 0 1px 2px rgb(0 0 0 / .06);
  --shadow-2: 0 4px 12px rgb(0 0 0 / .10);
  --shadow-3: 0 12px 32px rgb(0 0 0 / .16);

  /* Layout */
  --player-h: 72px;
  --sidebar-w: 280px;
  --panel-w: 320px;
  --z-player: 20; --z-sheet: 40; --z-dialog: 50; --z-toast: 60;
}
```

### 2.1 Themes

All text/background pairs must hit **4.5:1** (body reading text **7:1**).

| Token | Light | Dark | Sepia |
|---|---|---|---|
| `--bg` | `#FAFAF7` | `#121413` | `#F4ECD8` |
| `--surface` | `#FFFFFF` | `#1A1D1B` | `#FBF5E6` |
| `--surface-2` | `#F2F2EC` | `#222624` | `#EBE1C8` |
| `--border` | `#E4E4DC` | `#2E3331` | `#D9CDAE` |
| `--text` | `#1B1F1D` | `#ECEFEA` | `#3B2F1E` |
| `--text-soft` | `#4A524E` | `#A9B2AC` | `#6A5A40` |
| `--accent` | `#2F6F5E` | `#6FCFB0` | `#8A4B1F` |
| `--accent-fg` | `#FFFFFF` | `#08201A` | `#FFFFFF` |
| `--hl-sentence` | `#FFF1B8` | `#3A3414` | `#F2DC9B` |
| `--hl-word-bg` | `#FFD54A` | `#E6B800` | `#E8B84A` |
| `--hl-word-fg` | `#1B1F1D` | `#121413` | `#3B2F1E` |
| `--danger` | `#B3261E` | `#F2B8B5` | `#9C2A1C` |
| `--success` | `#1E6B3A` | `#7DD99B` | `#2D6A3A` |
| `--focus` | `#1A73E8` | `#8AB4F8` | `#1A56B8` |

Rules:
- Set `color-scheme` per theme so native controls match.
- Theme switch: 150ms transition on `background-color` and `color` only.
- Never use color alone to convey state (pair with icon or text).

---

## 3. Typography

| Role | Font | Size / line-height | Weight |
|---|---|---|---|
| App title | Inter | 22 / 28 | 650 |
| Section title | Inter | 18 / 26 | 600 |
| UI label | Inter | 14 / 20 | 500 |
| Helper / caption | Inter | 12 / 16 | 400 |
| Reader body | Literata | `--read-size` / 1.7 | 400 |
| Reader heading (md `#`) | Literata | 1.4x body / 1.3 | 600 |
| Numbers (time, %, rate) | Inter, `tabular-nums` | 14 / 20 | 500 |

- Preload the selected reading font, `font-display: swap`, subset to Latin plus the user's detected script.
- Reader supports RTL (Arabic, Urdu): set `dir="auto"` per paragraph and mirror highlight direction.

---

## 4. Layout

### 4.1 Breakpoints
`360` (min supported) · `640` · `1024` · `1280`

### 4.2 Desktop (≥1024px)
```
┌───────────────┬──────────────────────────────┬─────────────────┐
│ Library 280px │  Reader (max 68ch, centered)  │ Settings 320px  │
│ (collapsible) │                              │ (collapsible)   │
├───────────────┴──────────────────────────────┴─────────────────┤
│  Player bar (72px, sticky bottom, full width)                  │
└────────────────────────────────────────────────────────────────┘
```

### 4.3 Tablet (640-1023px)
Reader centered, Library and Settings become slide-over panels.

### 4.4 Mobile (<640px)
- Single column, 16px side padding, safe-area insets on all sides.
- Settings open as a **bottom sheet** (drag handle, snap at 50% and 90%).
- Player bar is 64px with a 56px circular primary button, plus a thin progress scrubber above it.
- No horizontal scroll at 360px. Ever.

### 4.5 Reader column
- Max width `--read-measure`, centered, `padding-block: var(--s-10) calc(var(--player-h) + var(--s-10))`.
- Active sentence stays at roughly **35% from the top** while following.

---

## 5. Components

Build on **Radix UI** primitives (or Headless UI). Icons: **lucide-react**, 20px default, 1.75 stroke.

### 5.1 Button
| Variant | Use | Style |
|---|---|---|
| Primary | Play, Save | `--accent` bg, `--accent-fg` text |
| Secondary | Most actions | `--surface-2` bg, `--text` |
| Ghost | Toolbar | transparent, hover `--surface-2` |
| Danger | Delete, Reset | `--danger` text/outline, filled only in confirm dialogs |

Sizes: `sm 36px`, `md 44px` (default), `lg 56px` (mobile play). Min touch target **44px**.
States: hover (bg shift 6%), active (scale .98, 100ms), focus-visible (3px `--focus` ring, 2px offset), disabled (50% opacity, `aria-disabled`), loading (spinner, width locked).

### 5.2 Player bar
- Left: current text title + "Sentence 12 of 148".
- Center: Prev sentence · **Play/Pause (primary)** · Next sentence · Stop.
- Right: rate chip (`1.25x` opens popover), volume, sleep timer, settings toggle.
- Top edge: scrubber (by chunk), shows elapsed / remaining estimate (`tabular-nums`).
- While speaking: 3-bar CSS equalizer next to the title (paused when reduced motion).

### 5.3 Slider
Track 4px, thumb 20px (hit area 44px). Shows value in a tooltip while dragging. `aria-valuetext` is human ("1.5x speed", "Pitch 1.0").

### 5.4 Voice picker (combobox)
- Searchable, grouped by language, badge `Local` or `Network`.
- Each row has a "Preview" icon button (speaks a short sample).
- Remembers last voice per language. Empty state: "No voices found. Try Chrome, Edge or Safari."

### 5.5 Text input
- Auto-grow textarea, live **characters · words · est. read time**.
- Drop zone for `.txt`, `.md`, `.pdf` with dashed border, highlights on drag-over.
- Buttons: Paste, Upload, Clear. Clear asks for confirmation if text > 500 chars.

### 5.6 Reader text
- Rendered as `<p>` per paragraph, `<span data-s="n">` per sentence, `<span data-w="m">` per word (only the active sentence is word-wrapped, to keep the DOM light).
- Active sentence: `--hl-sentence` background, `--r-sm`, 2px vertical padding, 150ms fade.
- Active word: `--hl-word-bg` / `--hl-word-fg`, no layout shift (use `box-decoration-break: clone`).
- Click any sentence to jump. Hover shows a subtle `--surface-2` background.
- "Follow along" toggle. When the user scrolls manually, follow pauses and a floating **"Jump to current"** pill appears.

### 5.7 Library item
Title (1 line, ellipsis), date, progress bar (3px), kebab menu (Rename, Duplicate, Delete). Max 50 items. Empty state with illustration and "Paste or upload text to start".

### 5.8 Settings panel
Sections (accordion on mobile): **Voice**, **Speed and pitch**, **Reading** (font, size, line height, width), **Theme**, **Pronunciation** (user dictionary), **Filters** (skip URLs, emojis, markdown symbols), **Shortcuts**, **About and privacy**.

### 5.9 Toast
Bottom-center (above player), 4s auto-dismiss, max 1 visible, `role="status"`. Errors persist until dismissed and include a Retry action.

### 5.10 Dialog / Bottom sheet
Focus trapped, `Esc` closes, returns focus to trigger, scroll locked behind, backdrop `rgb(0 0 0 / .45)`.

---

## 6. States (design every one)

| State | Treatment |
|---|---|
| First run, empty | Hero with sample-text button, 3-step skippable tooltip tour |
| Loading voices | Skeleton in voice picker, play disabled with tooltip "Loading voices..." |
| No voices | Inline notice with browser suggestions |
| Unsupported browser | Full-page friendly message, no broken UI |
| Autoplay blocked (iOS/Safari) | Primary button becomes **"Tap to start"** |
| Speaking | Equalizer on, active sentence highlighted, follow-along on |
| Paused | Button shows Play, highlight stays dimmed (60% opacity) |
| Error | Toast + inline banner mapped from SpeechSynthesis error codes, Retry button |
| Offline | Small "Offline, saved texts available" chip, app keeps working |
| Huge input (>500k chars) | Dialog explaining the limit, offer to trim |

---

## 7. Motion

| Interaction | Spec |
|---|---|
| Hover / press | 100ms, `--ease` |
| Theme change | 150ms colors only |
| Panel / sheet open | 250ms slide + fade |
| Active sentence change | 150ms background fade |
| Play button icon | 150ms morph Play ↔ Pause |
| Equalizer | 3 bars, 900ms loop, CSS only |

`@media (prefers-reduced-motion: reduce)`: disable slides, morphs, equalizer animation and smooth scroll. Keep instant state changes. No layout shift from any animation.

---

## 8. Accessibility checklist (WCAG 2.2 AA)

- One `<h1>`, landmarks: `header`, `nav` (library), `main` (reader), `aside` (settings), `footer`/player as `role="region" aria-label="Audio player"`.
- Every icon button has `aria-label`. Toggles use `aria-pressed`.
- Visible focus ring everywhere (3px, `--focus`), never `outline: none` without replacement.
- Fully keyboard operable, logical tab order, focus trap in dialogs.
- `aria-live="polite"` region announces state only (Playing / Paused / Stopped / Error). **Do not announce every word.**
- Sliders have `aria-valuetext`. Time values use `<time>` or `aria-label` with plain words.
- Touch targets ≥ 44px. Works at 200% zoom and with user text-spacing overrides.
- Contrast per section 2.1. Test dark, light and sepia.
- No `user-scalable=no` in the viewport meta.

### Keyboard shortcuts
| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` / `→` | Previous / next sentence |
| `Shift` + `←` / `→` | Previous / next paragraph |
| `↑` / `↓` | Rate +/- 0.1 |
| `M` | Mute |
| `/` | Focus text input |
| `T` | Cycle theme |
| `?` | Shortcuts sheet |

Shortcuts are disabled while typing in an input or textarea.

---

## 9. Content and voice

- Short, friendly, plain language. No jargon ("utterance", "synthesis").
- Buttons are verbs: **Play**, **Paste text**, **Upload file**, **Clear**.
- Errors say what happened and what to do next: *"Your browser blocked audio. Tap Start to continue."*
- Privacy line in About and the empty state: **"Everything runs in your browser. No text leaves your device."**

---

## 10. Do and Don't

| Do | Don't |
|---|---|
| Use tokens for every color, space, radius | Hard-code hex values or pixel values in components |
| Keep one primary button per view | Put several accent-filled buttons side by side |
| Update highlight via refs and CSS classes | Re-render the whole text on each word boundary |
| Show real limits (no audio export) | Add fake or disabled "Download MP3" buttons |
| Test at 360px and 1440px | Assume desktop only |
| Respect reduced motion | Autoplay animations that can't be paused |

---

## 11. Definition of done (per screen)

- [ ] Uses only tokens from this file
- [ ] Works in Light, Dark and Sepia
- [ ] 360px to 1440px, no horizontal scroll
- [ ] All states in section 6 designed
- [ ] Keyboard-only walkthrough passes
- [ ] Axe / Lighthouse accessibility score 100
- [ ] No layout shift (CLS < 0.05)
