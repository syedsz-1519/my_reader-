# UI & Mobile-First Audit (`UI_AUDIT.md`)

Audit performed against `/DESIGN.md` prior to Mobile-First UI Polish Phases 1–7.

## 1. Screen-by-Screen Assessment Across Breakpoints

- **`360x640` & `390x844` (Small / Standard Mobile)**:
  - Header sits at 64px (`h-16`) instead of compact 56px and stays pinned during active reading, reducing visible prose viewport.
  - Reader top toolbar wraps across 2–3 lines with a `<select>` color dropdown and buttons pushed edge-to-edge.
  - Editing inside `InputWorkspace` leaves the fixed bottom `PlayerBar` visible over the mobile software keyboard, reducing usable typing space; inputs at `13px–15px` trigger iOS Safari auto-zoom.
  - Action buttons inside `InputWorkspace` (`Paste`, `Upload`, `Import URL`, `Sample`, `Clear`) wrap into multiple uneven rows.
  - `PlayerBar` acts strictly as a static bar without an expandable swipe-up Full Player sheet, hiding Speed slider, Sleep timer, Voice switcher, and Volume behind desktop breakpoints (`hidden md:inline-flex`).
  - `SettingsPanel` bottom sheet lacks 50%/90% snap states, lacks collapsible accordions, lacks a sticky `"Done"` button, and does not lock body scroll behind the sheet.

- **`768x1024` (Tablet)**:
  - Centered reader (`68ch`) renders cleanly, with slide-over `LibrarySidebar` and `SettingsPanel`, though drawers inherit fixed `top-16` instead of full viewport-height focus-trapped overlays and lack keyboard/touch swipe dismissal.

- **`1280x800` (Desktop 3-Pane)**:
  - 3-pane layout (`LibrarySidebar` 280px | `ReaderStage` | `SettingsPanel` 320px) + sticky `PlayerBar` (72px) is clean, but sidebar/panel collapse state resets on page reload instead of persisting cleanly, and `.sentence-span:hover` lacks `@media (hover: hover)` isolation for touch-screen laptops/tablets.

## 2. Prioritized Issues Table

| ID | Severity | File:Line | Root Cause | Planned Fix |
|---|---|---|---|---|
| `UI-01` | P0 | `src/components/InputWorkspace.tsx:306-487` | Inputs/textareas use `14px`/`15px` (`<16px`, triggering iOS auto-zoom); no `visualViewport` keyboard detection hides `PlayerBar`; import buttons wrap unpredictably on `<480px`. | Enforce `text-[16px]` (`font-size >= 16px`) on mobile inputs/textareas; add `useVisualViewportKeyboard()` to hide player bar & pad editor while typing; render import actions as a horizontally scrollable single row on mobile. |
| `UI-02` | P0 | `src/components/PlayerBar.tsx:107-409` | Sticky player lacks an expandable swipe-up Full Player sheet on `<768px`, hiding sleep timer, rate presets, voice switcher, and volume from phone users; some icon controls are `<44px`. | Retain sticky 64px Mini Player (top progress bar, title, `56px` play/pause, prev/next, expand affordance) and add swipe-up/tap-to-expand Full Player sheet (`72px` play button, scrubber, `0.75/1/1.25/1.5/2` speed chips, timer, voice, volume). Enforce `>=44px` tap targets. |
| `UI-03` | P0 | `src/components/SettingsPanel.tsx:186-203` | Mobile bottom sheet sits at fixed `78dvh` without 50%/90% snaps, lacks accordion sections, lacks body scroll lock, and has no sticky thumb-zone `"Done"` button. | Implement interactive 50%/90% snap drag handle, collapsible accordion sections on mobile, `overscroll-behavior: contain` + body scroll lock, sticky `"Done"` footer with `pb-safe`, and a `"Large controls"` accessibility toggle. |
| `UI-04` | P0 | `src/components/ReaderStage.tsx:192-258` | Top reader toolbar crowds narrow screens; lacks long-press sentence highlight/note popover; missing fluid `clamp()` sizing & `content-visibility: auto` on paragraphs. | Condense mobile toolbar into clean `>=44px` controls, add 450ms long-press / context highlight menu on sentences (4 color swatches + quick note), apply fluid `clamp(18px, 4.4vw, 22px)` typography & `content-visibility: auto`. |
| `UI-05` | P1 | `src/components/HeaderBar.tsx:60-213` | Header stays 64px (`h-16`) on phones instead of compact 56px (`h-14`), stays fixed while reading/scrolling down, and wastes vertical space on landscape phones (`height < 480px`). | Use compact `56px` height on `<768px` (`64px` `md+`), hide smoothly on scroll down while speaking (re-appear on scroll up, when paused, or near top), and hide in phone landscape (`max-height: 480px`). |
| `UI-06` | P1 | `src/components/LibrarySidebar.tsx:99-102` | Drawer width caps at `280px` instead of `min(85vw, 340px)` on phones, lacks left-edge swipe open/close, and sidebar collapse preference isn't persisted on desktop. | Update mobile drawer to `min(85vw, 340px)` full-height (`100dvh`) with backdrop, Escape/focus restoration, edge-swipe gesture, and persisted desktop collapse state. |
| `UI-07` | P1 | `src/components/ui/Toast.tsx` & `src/components/ui/Button.tsx` | Mobile toasts risk sitting close to the 64px mini player; `IconButton` defaults to `40px` instead of `>=44px` mobile minimum; missing `touch-action: manipulation` & `:active` press scale. | Offset toasts above mini player (`bottom-[calc(76px+env(safe-area-inset-bottom))]` on mobile), bump base `IconButton` & interactive targets to `>=44px` (`min-w-[44px] min-h-[44px]`), add `touch-action: manipulation` and active `scale-[0.98]`. |
| `UI-08` | P2 | `src/index.css` & `src/styles/tokens.css` | `body` uses raw `100vh`; `.sentence-span:hover` triggers sticky hover highlights on touch screens; missing thin desktop custom scrollbars and Large Controls CSS scale variables. | Switch to `100dvh` / `100svh`, guard hover styles with `@media (hover: hover)`, add subtle thin desktop scrollbars, `overscroll-behavior: contain` on sheets, and `[data-large-controls='true']` scaling. |
| `UI-09` | P2 | `playwright.config.ts` & `tests/smoke.spec.ts` | Playwright suite covers only `desktop` and `mobile-360` without capturing device screenshots or testing `280x653`, `375x667`, `390x844`, `412x915`, `768x1024`, or landscape phones. | Expand Playwright config to all 7 required viewports, verify zero horizontal scroll, `>=44px` tap targets, mini player + full player sheet, settings sheet snaps, and save PNGs to `/docs/screenshots/`. |
