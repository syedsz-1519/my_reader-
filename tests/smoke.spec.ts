import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots');

test.describe('TTS Reader Responsive, Accessibility & Visual Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      class MockUtterance {
        text: string;
        voice: unknown = null;
        lang = 'en-US';
        rate = 1;
        pitch = 1;
        volume = 1;
        onstart: ((e: Event) => void) | null = null;
        onend: ((e: Event) => void) | null = null;
        onerror: ((e: Event) => void) | null = null;
        onboundary: ((e: Event) => void) | null = null;
        constructor(text = '') {
          this.text = text;
        }
      }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        configurable: true,
        value: MockUtterance,
      });

      const mockVoices = [
        {
          name: 'System English',
          lang: 'en-US',
          localService: true,
          default: true,
          voiceURI: 'sys-en',
        },
      ];
      let speaking = false;
      let paused = false;
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => mockVoices,
          addEventListener: () => {},
          removeEventListener: () => {},
          speak: (u: SpeechSynthesisUtterance) => {
            speaking = true;
            paused = false;
            setTimeout(() => u.onstart?.(new Event('start') as SpeechSynthesisEvent), 20);
          },
          pause: () => {
            paused = true;
          },
          resume: () => {
            paused = false;
          },
          cancel: () => {
            speaking = false;
            paused = false;
          },
          get speaking() {
            return speaking;
          },
          get paused() {
            return paused;
          },
        },
      });
    });
  });

  test('renders zero horizontal overflow, meets tap target minimums, supports mobile player sheet & settings, and captures screenshots', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();

    const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
    const isMobile = viewport.width < 768;

    // 1. Zero horizontal overflow on initial load
    const initialOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(initialOverflow).toBe(false);

    // 2. Verify >=44px tap targets on primary player play/pause control
    const playBtn = page.getByRole('button', { name: 'Play audio' });
    await expect(playBtn).toBeVisible();
    const playBox = await playBtn.boundingBox();
    expect(playBox).not.toBeNull();
    expect(playBox!.height).toBeGreaterThanOrEqual(44);
    expect(playBox!.width).toBeGreaterThanOrEqual(44);

    // Capture main reader viewport screenshot
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${testInfo.project.name}-reader.png`),
      fullPage: false,
    });

    // 3. Test Paste / Import editor and load custom text
    await page.getByRole('button', { name: /Paste \/ Import/i }).click();
    const textarea = page.getByLabel('Text to read aloud');
    await expect(textarea).toBeVisible();
    await textarea.fill('First test sentence. Second test sentence.');
    await page.getByRole('button', { name: 'Load into Reader' }).click();
    await expect(page.getByText('First test sentence.')).toBeVisible();

    // 4. Play and Pause via player controls
    await page.getByRole('button', { name: 'Play audio' }).click();
    await expect(page.getByRole('button', { name: 'Pause playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause playback' }).click();
    await expect(page.getByRole('button', { name: 'Resume playback' })).toBeVisible();

    // 5. On mobile (<768px), verify expandable Full Player Sheet & Settings bottom sheet
    if (isMobile) {
      await page.getByRole('button', { name: 'Open full player controls' }).click();
      const playerSheet = page.getByRole('dialog', { name: 'Expanded audio player' });
      await expect(playerSheet).toBeVisible();
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${testInfo.project.name}-full-player.png`),
        fullPage: false,
      });

      if (viewport.height <= 480) {
        // Landscape phones hide the header bar for maximum reader height; open settings from the sheet
        await page.getByRole('button', { name: 'Open reader settings' }).click();
      } else {
        await page.getByRole('button', { name: 'Collapse player' }).click();
        await expect(playerSheet).toBeHidden();
        await page.getByRole('button', { name: /Show settings panel/i }).click();
      }

      const settingsAside = page.getByRole('complementary', { name: 'Reader settings' });
      await expect(settingsAside).toBeVisible();
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${testInfo.project.name}-settings.png`),
        fullPage: false,
      });
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(settingsAside).toBeHidden();
    }

    // 6. Theme switching & zero overflow after interactions
    await page.keyboard.press('t');
    const dataTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(['light', 'sepia', 'dark']).toContain(dataTheme);

    const finalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(finalOverflow).toBe(false);
    expect(errors).toEqual([]);
  });
});
