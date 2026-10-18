/**
 * M5 fixes (builder tests, beyond the test engineer's D-13 to D-20 tests):
 * mixed and lone-CR line endings (SD-11), the draft of a CRLF file, the save
 * picker refusing a name (O-03), Save in the same task as a change (O-01),
 * focus with a collapsed editor or no document (D-20), `#` and `#top`.
 */
import { test, expect, type Page } from '@playwright/test';
import { editorEl, mod, open, preview } from './helpers';

/** File System Access mock. `__fs.saveMode`: 'ok' | 'reject-first' | 'reject-all'. */
async function mockFs(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    const fs: any = { writes: [], saveCalls: [], openQueue: [], saveMode: 'ok' };
    w.__fs = fs;
    const enc = new TextEncoder();
    const mk = (name: string, bytes: Uint8Array<ArrayBuffer>) => ({
      kind: 'file',
      name,
      async getFile() {
        return new File([bytes], name);
      },
      async createWritable() {
        let out = '';
        return {
          async write(d: Blob | string) {
            out += typeof d === 'string' ? d : await d.text();
          },
          async close() {
            fs.writes.push({ name, text: out });
          },
        };
      },
    });
    w.showOpenFilePicker = async () => {
      const next = fs.openQueue.shift();
      if (!next) throw new DOMException('aborted', 'AbortError');
      return [mk(next.name, enc.encode(next.text))];
    };
    w.showSaveFilePicker = async (o: any) => {
      fs.saveCalls.push(o);
      if (fs.saveMode === 'reject-all' || (fs.saveMode === 'reject-first' && fs.saveCalls.length === 1)) throw new TypeError('Name is not allowed.');
      return mk(o?.suggestedName ?? 'x.md', new Uint8Array());
    };
  });
}

const fs = (page: Page) => page.evaluate(() => (window as any).__fs as { writes: { name: string; text: string }[]; saveCalls: { suggestedName: string }[] });
const docText = (page: Page) => page.evaluate(() => (window as any).macdownEditor.text() as string);
const edited = (page: Page) => page.evaluate(() => (window as any).macdownDocument.edited() as boolean);
const menu = async (page: Page, m: string, item: string) => {
  await page.getByTestId(`menu-${m}`).click();
  await page.getByTestId(`menuitem-${item}`).click();
};
const openFile = async (page: Page, name: string, text: string) => {
  await page.evaluate((f) => (window as any).__fs.openQueue.push(f), { name, text });
  await menu(page, 'file', 'open');
  await expect(page).toHaveTitle(name);
};

test.describe('SD-11 / D-13 line endings are kept as read', () => {
  test('a mixed CRLF / CR / LF file is not edited after opening and is saved byte for byte', async ({ page }) => {
    await mockFs(page);
    await open(page);
    const raw = '# T\r\none\rtwo\nthree\r\n';
    await openFile(page, 'mixed.md', raw);
    expect(await edited(page)).toBe(false);
    expect(await docText(page)).toBe(raw);
    await menu(page, 'file', 'save-as');
    await expect.poll(async () => (await fs(page)).writes.length).toBe(1);
    expect((await fs(page)).writes[0].text).toBe(raw);
    // The preview renders the lines as Hoedown does (CR and CRLF are line breaks).
    await expect(preview(page).locator('h1')).toHaveText('T');
  });

  test('a typed Return in a CRLF file inserts LF (insertNewline:); Backspace and Undo bring the CRLF back', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'win.md', 'a\r\nb');
    await editorEl(page).click();
    await page.keyboard.press((await mod(page)) + '+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('c');
    expect(await docText(page)).toBe('a\r\nb\nc');
    await page.keyboard.press((await mod(page)) + '+z');
    await expect.poll(() => docText(page)).toBe('a\r\nb');
    // Delete the CRLF break, then undo it: the file text is the original again.
    await page.evaluate(() => (window as any).macdownEditor.select(2));
    await page.keyboard.press('Backspace');
    expect(await docText(page)).toBe('ab');
    await page.keyboard.press((await mod(page)) + '+z');
    await expect.poll(() => docText(page)).toBe('a\r\nb');
    await expect(page).toHaveTitle('win.md');
  });

  test('the draft of a CRLF file keeps CRLF across a reload and the document is not edited', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'win.md', 'a\r\nb\r\n');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('macdown.draft') ?? 'null')?.text)).toBe('a\r\nb\r\n');
    await page.reload();
    await expect(page).toHaveTitle('win.md');
    expect(await docText(page)).toBe('a\r\nb\r\n');
    expect(await edited(page)).toBe(false);
  });
});

test.describe('O-03 a save panel that refuses the suggested name', () => {
  test('the panel is asked again with a safe name', async ({ page }) => {
    await mockFs(page);
    await open(page, `?pref.htmlDetectFrontMatter=true`);
    await page.evaluate(() => {
      (window as any).__fs.saveMode = 'reject-first';
      (window as any).macdownEditor.set('---\ntitle: "a/b: c"\n---\n');
    });
    await page.keyboard.press((await mod(page)) + '+s');
    await expect.poll(async () => (await fs(page)).writes.length).toBe(1);
    expect((await fs(page)).saveCalls.map((c) => c.suggestedName)).toEqual(['a/b: c.md', 'a-b- c.md']);
    await expect(page).toHaveTitle('a-b- c.md');
  });

  test('when the panel cannot be shown at all, an error sheet says so and the document stays edited', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await page.evaluate(() => {
      (window as any).__fs.saveMode = 'reject-all';
      (window as any).macdownEditor.set('text');
    });
    await page.keyboard.press((await mod(page)) + '+s');
    await expect(page.getByTestId('alert-message')).toHaveText('The document “Untitled” could not be saved.');
    await page.getByTestId('alert-ok').click();
    await expect(page).toHaveTitle('Untitled — Edited');
    // Export HTML gives the same feedback.
    await menu(page, 'file', 'export-html');
    await page.getByTestId('export-html-save').click();
    await expect(page.getByTestId('alert-message')).toHaveText('The file “Untitled.html” could not be exported.');
  });
});

test.describe('O-01 Save in the same task as a change', () => {
  test('saves the new text, not the previous one', async ({ page }) => {
    await mockFs(page);
    await open(page);
    const isMac = (await mod(page)) === 'Meta';
    await page.evaluate((mac) => {
      (window as any).macdownEditor.set('first');
      (window as any).macdownEditor.set('second');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true }));
    }, isMac);
    await expect.poll(async () => (await fs(page)).writes.length).toBe(1);
    expect((await fs(page)).writes[0].text).toBe('second');
  });
});

test.describe('D-20 focus in the other cases', () => {
  test('with the editor pane collapsed, New gives the focus to the preview and typing does not edit the hidden text', async ({ page }) => {
    await open(page);
    await menu(page, 'view', 'toggle-editor');
    await expect(page.getByTestId('split')).toHaveAttribute('data-editor-visible', 'false');
    await menu(page, 'file', 'new');
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('preview-iframe');
    await page.keyboard.type('Z');
    expect(await docText(page)).toBe('');
  });

  test('with P-02 off, Close gives the focus to the empty state\'s New button', async ({ page }) => {
    await page.goto('/?pref.supressesUntitledDocumentOnLaunch=true');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.getByTestId('empty-state-new').click();
    await menu(page, 'file', 'close');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('empty-state-new')).toBeFocused();
  });
});

test.describe('F-18 fragments as WebKit handles them', () => {
  test('"#" and "#top" scroll the preview to the top', async ({ page }) => {
    await open(page);
    const body = Array.from({ length: 80 }, (_, i) => `para ${i}`).join('\n\n');
    await page.evaluate((t) => (window as any).macdownEditor.set(t), `[a](#) [b](#top)\n\n${body}\n\n<a name="end"></a>[c](#) [d](#top) [e](#end)`);
    const frame = page.frames().find((f) => f.parentFrame() === page.mainFrame())!;
    for (const href of ['#', '#top']) {
      await preview(page).locator('a[href="#end"]').click();
      await expect.poll(() => frame.evaluate(() => window.scrollY)).toBeGreaterThan(200);
      await preview(page).locator(`a[href="${href}"]`).last().click();
      await expect.poll(() => frame.evaluate(() => window.scrollY)).toBe(0);
    }
  });
});
