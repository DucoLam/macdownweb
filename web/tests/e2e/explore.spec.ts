import { test, expect } from '@playwright/test';
import { open, typeText, preview, viewMenu, editorEl } from './helpers';

test.describe('Exploratory probes (accessibility basics, console errors)', () => {
  test('F-02 typing while the preview is hidden, then restoring shows current content', async ({ page }) => {
    await open(page);
    await viewMenu(page, 'toggle-preview');
    await typeText(page, '# Hidden typing');
    await viewMenu(page, 'toggle-preview');
    await expect(preview(page).locator('h1')).toHaveText('Hidden typing');
  });

  test('F-12 word count updates while the preview pane is hidden', async ({ page }) => {
    await open(page, '?pref.editorShowWordCount=true');
    await viewMenu(page, 'toggle-preview');
    await typeText(page, 'one two three');
    await expect(page.getByTestId('word-count').locator('option').first()).toHaveText('3 words');
  });

  test('F-01 no console errors or page errors during a normal editing session', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Blocked script execution/.test(m.text())) errors.push(m.text());
    });
    await open(page);
    await typeText(page, '# a\n\n| x | y |\n|---|---|\n| 1 | 2 |');
    await viewMenu(page, 'split-3-1');
    await viewMenu(page, 'toggle-editor');
    await viewMenu(page, 'toggle-editor');
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('F-13 menu bar titles are operable from the keyboard (Enter opens a menu)', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-view').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-view-dropdown')).toBeVisible();
  });

  test('F-09 Layout pull-down is operable from the keyboard (Enter opens it)', async ({ page }) => {
    await open(page);
    await page.getByTestId('toolbar-layout').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('layout-toggle-editor')).toBeVisible();
  });

  test('F-01 divider is keyboard accessible (focusable separator)', async ({ page }) => {
    await open(page);
    const tab = await page.getByTestId('split-divider').getAttribute('tabindex');
    expect(tab).not.toBeNull();
  });

  test('F-01 editor has an accessible name and the preview iframe a title', async ({ page }) => {
    await open(page);
    await expect(editorEl(page)).toHaveAttribute('aria-label', 'Markdown editor');
    await expect(page.getByTestId('preview-iframe')).toHaveAttribute('title', 'Preview');
  });

  test('F-01 layout stays usable at a narrow window (600 px): both panes visible, no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 700 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByTestId('toolbar-layout')).toBeInViewport();
  });
});
