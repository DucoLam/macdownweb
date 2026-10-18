import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

export async function open(page: Page, query = '') {
  await page.goto('/' + query);
  await expect(page.getByTestId('split')).toBeVisible();
  await expect(page.locator('[data-testid="editor"] .cm-content')).toBeVisible();
}

export const editorEl = (page: Page): Locator => page.locator('[data-testid="editor"] .cm-content');
export const preview = (page: Page): FrameLocator => page.frameLocator('[data-testid="preview-iframe"]');

/** The platform's "Cmd" modifier as the app sees it. */
export async function mod(page: Page): Promise<'Meta' | 'Control'> {
  const isMac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  return isMac ? 'Meta' : 'Control';
}

/** Types text into the editor line by line (Enter between lines). */
export async function typeText(page: Page, text: string, opts: { delay?: number } = {}) {
  await editorEl(page).click();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: opts.delay ?? 0 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
}

/** Replaces the document through a synthetic paste (exact text, newlines preserved). */
export async function setDoc(page: Page, text: string) {
  await editorEl(page).click();
  await page.keyboard.press((await mod(page)) + '+a');
  await page.keyboard.press('Delete');
  await editorEl(page).evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

export const editorText = (page: Page) => editorEl(page).evaluate((el) => (el as HTMLElement).innerText.replace(/​/g, ''));

export async function splitState(page: Page) {
  const s = page.getByTestId('split');
  return {
    ratio: Number(await s.getAttribute('data-left-ratio')),
    editor: (await s.getAttribute('data-editor-visible')) === 'true',
    preview: (await s.getAttribute('data-preview-visible')) === 'true',
  };
}

export async function viewMenu(page: Page, item: string) {
  await page.getByTestId('menu-view').click();
  await page.getByTestId(`menuitem-${item}`).click();
}

/** Width of a pane's bounding box. */
export const widthOf = async (l: Locator) => (await l.boundingBox())!.width;
