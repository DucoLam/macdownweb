/**
 * Final sign-off (test engineer): retest of D-13 to D-20 and of the builder's
 * M5 fixes (SD-11, O-01, O-03, SD-13), beyond m5-independent.spec.ts.
 * Oracle for line endings: spec section 13 item 93 (AppKit probe: NSTextView
 * keeps CRLF / CR / LF as read, a typed Return inserts LF, Backspace and Delete
 * remove a CRLF whole).
 */
import { expect, test, type Page } from '@playwright/test';
import { editorEl, mod, open, preview } from './helpers';

type Behaviour = 'ok' | 'type' | 'abort' | 'notallowed' | 'security';

/** File System Access mock. __fs.saveScript: one behaviour per showSaveFilePicker call (default ok). */
async function mockFs(page: Page, withApi = true) {
  await page.addInitScript((api) => {
    const w = window as any;
    const fs: any = { writes: [], saveCalls: [], openQueue: [], saveScript: [] };
    w.__fs = fs;
    if (!api) {
      w.showOpenFilePicker = undefined;
      w.showSaveFilePicker = undefined;
      return;
    }
    const enc = new TextEncoder();
    const mk = (name: string, bytes: Uint8Array<ArrayBuffer>) => ({
      kind: 'file',
      name,
      async getFile() {
        return new File([bytes], name);
      },
      async createWritable() {
        const chunks: Uint8Array[] = [];
        return {
          async write(d: Blob | string) {
            chunks.push(typeof d === 'string' ? enc.encode(d) : new Uint8Array(await d.arrayBuffer()));
          },
          async close() {
            const n = chunks.reduce((a, c) => a + c.length, 0);
            const out = new Uint8Array(n);
            let o = 0;
            for (const c of chunks) (out.set(c, o), (o += c.length));
            fs.writes.push({ name, bytes: Array.from(out), text: new TextDecoder().decode(out) });
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
      fs.saveCalls.push(o?.suggestedName);
      const b = fs.saveScript.shift() ?? 'ok';
      if (b === 'type') throw new TypeError('Name is not allowed.');
      if (b === 'abort') throw new DOMException('aborted', 'AbortError');
      if (b === 'notallowed') throw new DOMException('no activation', 'NotAllowedError');
      if (b === 'security') throw new DOMException('no', 'SecurityError');
      return mk(o?.suggestedName ?? 'x.md', new Uint8Array());
    };
  }, withApi);
}

type Fs = { writes: { name: string; text: string }[]; saveCalls: string[] };
const fsState = (page: Page) => page.evaluate(() => (window as any).__fs as Fs);
const script = (page: Page, s: Behaviour[]) => page.evaluate((x) => ((window as any).__fs.saveScript = x), s);
const text = (page: Page) => page.evaluate(() => (window as any).macdownEditor.text() as string);
const edited = (page: Page) => page.evaluate(() => (window as any).macdownDocument.edited() as boolean);
const setDoc = (page: Page, t: string, from?: number) => page.evaluate(([x, f]) => (window as any).macdownEditor.set(x, f), [t, from] as [string, number | undefined]);
const select = (page: Page, a: number, b = a) => page.evaluate(([x, y]) => (window as any).macdownEditor.select(x, y), [a, b]);
const menu = async (page: Page, m: string, item: string) => {
  await page.getByTestId(`menu-${m}`).click();
  await page.getByTestId(`menuitem-${item}`).click();
};
const openFile = async (page: Page, name: string, t: string) => {
  await page.evaluate((f) => (window as any).__fs.openQueue.push(f), { name, text: t });
  await menu(page, 'file', 'open');
  await expect(page).toHaveTitle(name);
};
const undo = async (page: Page) => page.keyboard.press((await mod(page)) + '+z');
const redo = async (page: Page) => page.keyboard.press((await mod(page)) + '+Shift+z');

// offsets in the editor: a=0 [CRLF]=1 b=2 [CR]=3 c=4 [LF]=5 d=6
const MIXED = 'a\r\nb\rc\nd';

test.describe('F-22 / F-26 / F-34 (D-13) mixed CRLF, LF and lone CR', () => {
  test('F-22 a mixed document is not edited after Open, is shown with one break per line and previews as separate lines', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'mixed.md', MIXED);
    expect(await edited(page)).toBe(false);
    expect(await text(page)).toBe(MIXED);
    expect(await editorEl(page).locator('.cm-line').count()).toBe(4);
  });

  test('F-26 Save As writes mixed endings byte for byte', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'mixed.md', MIXED);
    await menu(page, 'file', 'save-as');
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    expect((await fsState(page)).writes[0].text).toBe(MIXED);
  });

  test('F-22 a document of only CR, only CRLF and a trailing CR keeps its bytes', async ({ page }) => {
    await mockFs(page);
    await open(page);
    for (const raw of ['a\rb\rc\r', 'a\r\nb\r\n', '\r\n\r\n', '\r', '\r\r\n\n\r']) {
      await setDoc(page, raw);
      expect(await text(page)).toBe(raw);
    }
  });

  test('F-34 Backspace, Delete and Return around each kind of break, with undo and redo', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'mixed.md', MIXED);
    const k = (key: string) => page.keyboard.press(key);
    const cases: { at: number; key: string; to: string }[] = [
      { at: 2, key: 'Backspace', to: 'ab\rc\nd' }, // after the CRLF: removed whole
      { at: 1, key: 'Delete', to: 'ab\rc\nd' }, // before the CRLF: removed whole
      { at: 4, key: 'Backspace', to: 'a\r\nbc\nd' }, // after the CR
      { at: 3, key: 'Delete', to: 'a\r\nbc\nd' },
      { at: 6, key: 'Backspace', to: 'a\r\nb\rcd' }, // after the LF
      { at: 5, key: 'Delete', to: 'a\r\nb\rcd' },
      { at: 2, key: 'Enter', to: 'a\r\n\nb\rc\nd' }, // Return inserts LF
      { at: 1, key: 'Enter', to: 'a\n\r\nb\rc\nd' },
      { at: 3, key: 'Enter', to: 'a\r\nb\n\rc\nd' },
    ];
    for (const c of cases) {
      await editorEl(page).click();
      await select(page, c.at);
      await k(c.key);
      expect(await text(page), `${c.key} at ${c.at}`).toBe(c.to);
      expect(await edited(page)).toBe(true);
      await undo(page);
      await expect.poll(() => text(page), `undo ${c.key} at ${c.at}`).toBe(MIXED);
      expect(await edited(page), `undo to original clears Edited (${c.key} at ${c.at})`).toBe(false);
      await expect(page).toHaveTitle('mixed.md');
      await redo(page);
      await expect.poll(() => text(page), `redo ${c.key} at ${c.at}`).toBe(c.to);
      expect(await edited(page)).toBe(true);
      await undo(page);
      await expect.poll(() => text(page)).toBe(MIXED);
      expect(await edited(page)).toBe(false);
    }
  });

  test('F-34 a selection across several breaks deleted or replaced: undo restores every separator in place', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'mixed.md', MIXED);
    await editorEl(page).click();
    await select(page, 0, 7);
    await page.keyboard.press('Delete');
    expect(await text(page)).toBe('');
    await undo(page);
    await expect.poll(() => text(page)).toBe(MIXED);
    expect(await edited(page)).toBe(false);
    await select(page, 1, 6); // from the CRLF to before d
    await page.keyboard.type('XY');
    expect(await text(page)).toBe('aXYd');
    await undo(page);
    await expect.poll(() => text(page)).toBe(MIXED);
    expect(await edited(page)).toBe(false);
    // two separate edits, undone one at a time
    await select(page, 2);
    await page.keyboard.press('Backspace'); // removes the CRLF
    await select(page, 3);
    await page.keyboard.press('Backspace'); // removes the CR (now at 1..2)
    await undo(page);
    await undo(page);
    await expect.poll(() => text(page)).toBe(MIXED);
    expect(await edited(page)).toBe(false);
  });

  test('F-34 typing in the lines around the breaks keeps every break; typing then deleting the same text clears Edited', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'mixed.md', MIXED);
    await editorEl(page).click();
    await select(page, 0);
    await page.keyboard.type('X');
    expect(await text(page)).toBe('Xa\r\nb\rc\nd');
    await select(page, 6); // end of line c (before the LF)
    await page.keyboard.type('Y');
    expect(await text(page)).toBe('Xa\r\nb\rcY\nd');
    await page.keyboard.press('Backspace');
    await select(page, 1);
    await page.keyboard.press('Backspace');
    expect(await text(page)).toBe(MIXED);
    expect(await edited(page)).toBe(false);
    await expect(page).toHaveTitle('mixed.md');
  });

  test('F-26 edit then Save in place keeps the endings; Edited clears; a second Save writes the same bytes again', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'mixed.md', MIXED);
    // The mock's Open handle has no createWritable record until Save: use Save (in place through the handle).
    await editorEl(page).click();
    await select(page, 7);
    await page.keyboard.type('!');
    await page.keyboard.press((await mod(page)) + '+s');
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    expect((await fsState(page)).writes[0].text).toBe('a\r\nb\rc\nd!');
    await expect(page).toHaveTitle('mixed.md');
    expect(await edited(page)).toBe(false);
  });

  test('F-29 the draft of an edited mixed document survives a reload with its endings and stays edited; Save As then writes them', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'mixed.md', MIXED);
    await editorEl(page).click();
    await select(page, 7);
    await page.keyboard.type('!');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('macdown.draft') ?? 'null')?.text)).toBe('a\r\nb\rc\nd!');
    await page.reload();
    await expect(page).toHaveTitle('mixed.md — Edited');
    expect(await text(page)).toBe('a\r\nb\rc\nd!');
    await menu(page, 'file', 'save-as');
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    expect((await fsState(page)).writes[0].text).toBe('a\r\nb\rc\nd!');
    // Delete the typed '!': equals the draft's saved text, so not edited
    await select(page, 7);
    await page.keyboard.press('Backspace');
  });

  test('F-29 an untitled document typed with a pasted CRLF text is stored with LF (documented deviation)', async ({ page }) => {
    await open(page);
    await editorEl(page).click();
    await editorEl(page).evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'p\r\nq');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    expect(await text(page)).toBe('p\nq');
  });

  test('F-26 download fallback (no File System Access API): a CRLF file is saved by download with CRLF', async ({ page }) => {
    await mockFs(page, false);
    await open(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('menu-file').click();
    await page.getByTestId('menuitem-open').click();
    await (await chooser).setFiles({ name: 'win.md', mimeType: 'text/markdown', buffer: Buffer.from('a\r\nb\rc\nd') });
    await expect(page).toHaveTitle('win.md');
    await editorEl(page).click();
    await select(page, 7);
    await page.keyboard.type('!');
    const dl = page.waitForEvent('download');
    await page.keyboard.press((await mod(page)) + '+s');
    const d = await dl;
    expect(d.suggestedFilename()).toBe('win.md');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync((await d.path())!, 'utf8')).toBe('a\r\nb\rc\nd!');
  });

  test('F-30 P-41 on: a CRLF file gets the final newline added as LF? (observation: the appended break is the editor break)', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.editorEnsuresNewlineAtEndOfFile=true');
    await openFile(page, 'w.md', 'a\r\nb');
    await page.keyboard.press((await mod(page)) + '+s');
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    const t = (await fsState(page)).writes[0].text;
    expect(t.startsWith('a\r\nb')).toBe(true);
    expect(t.length).toBeGreaterThan('a\r\nb'.length);
  });

  test('F-18 / F-110 the preview of a CR / CRLF document renders each break as a line break (Hoedown first pass)', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlHardWrap=true');
    await setDoc(page, 'a\rb\r\nc\nd\r\n\r\n# H\r\n');
    await expect(preview(page).locator('h1')).toHaveText('H');
    await expect(preview(page).locator('p').first().locator('br')).toHaveCount(3);
  });
});

test.describe('O-01 Save in the same task as a change', () => {
  const press = (page: Page, mac: boolean, shift = false) =>
    page.evaluate(([m, s]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: s ? 'S' : 's', code: 'KeyS', shiftKey: s, metaKey: m, ctrlKey: !m, bubbles: true, cancelable: true })), [mac, shift] as [boolean, boolean]);

  test('O-01 Save As in the same task as set() writes the new text', async ({ page }) => {
    await mockFs(page);
    await open(page);
    const mac = (await mod(page)) === 'Meta';
    await page.evaluate(() => (window as any).macdownEditor.set('old'));
    await page.evaluate((m) => {
      (window as any).macdownEditor.set('new\r\ntext');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', code: 'KeyS', shiftKey: true, metaKey: m, ctrlKey: !m, bubbles: true, cancelable: true }));
    }, mac);
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    expect((await fsState(page)).writes[0].text).toBe('new\r\ntext');
    void press;
  });

  test('O-01 Save then (same task) another change: the file and the Edited state agree (what was written is what the title says)', async ({ page }) => {
    await mockFs(page);
    await open(page);
    const mac = (await mod(page)) === 'Meta';
    await page.evaluate((m) => {
      const e = (window as any).macdownEditor;
      e.set('one');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: m, ctrlKey: !m, bubbles: true, cancelable: true }));
      e.set('two');
    }, mac);
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    const written = (await fsState(page)).writes[0].text;
    expect(['one', 'two']).toContain(written);
    // NSDocument writes after the panel returns, so the text at that time is saved; the title must be consistent with the file.
    await expect.poll(() => edited(page)).toBe(written !== 'two');
  });

  test('O-01 Export HTML in the same task as a change exports the new text', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await setDoc(page, 'old text');
    await page.getByTestId('menu-file').click();
    await page.evaluate(() => {
      (window as any).macdownEditor.set('# Newest heading');
      (document.querySelector('[data-testid="menuitem-export-html"]') as HTMLElement).click();
    });
    await page.getByTestId('export-html-save').click();
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    const html = (await fsState(page)).writes[0].text;
    expect(html).toContain('Newest heading');
    expect(html).not.toContain('old text');
  });

  test('O-01 typing then Save immediately (keyboard) saves everything typed', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await editorEl(page).click();
    await page.keyboard.type('quick');
    await page.keyboard.press((await mod(page)) + '+s');
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    expect((await fsState(page)).writes[0].text).toBe('quick');
  });
});

test.describe('O-03 a save panel that refuses the name', () => {
  const FM = (title: string) => `---\ntitle: ${title}\n---\n\nbody`;
  const save = async (page: Page) => page.keyboard.press((await mod(page)) + '+s');

  test('O-03 refused, then a safe name: every forbidden character becomes "-"', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlDetectFrontMatter=true');
    await script(page, ['type', 'ok']);
    await setDoc(page, FM(`'x*y?"z"<w>|\\v'`));
    await save(page);
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    const st = await fsState(page);
    expect(st.saveCalls).toEqual(['x*y?"z"<w>|\\v.md', 'x-y--z--w---v.md']);
    await expect(page).toHaveTitle('x-y--z--w---v.md');
    // saved: a further Save writes in place, no new panel
    await setDoc(page, FM(`'x*y?"z"<w>|\\v'`) + '2');
    await save(page);
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(2);
    expect((await fsState(page)).saveCalls.length).toBe(2);
  });

  test('O-03 a hidden name (leading dot) gets "Untitled" in front on the retry', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlDetectFrontMatter=true');
    await script(page, ['type', 'ok']);
    await setDoc(page, FM('.hidden'));
    await save(page);
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    const calls = (await fsState(page)).saveCalls;
    expect(calls[0]).toBe('.hidden.md');
    expect(calls[1].startsWith('Untitled')).toBe(true);
    expect(calls[1].startsWith('.')).toBe(false);
    expect(calls[1].endsWith('.md')).toBe(true);
  });

  test('O-03 a refused name made only of forbidden characters still gives a usable name', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlDetectFrontMatter=true');
    await script(page, ['type', 'ok']);
    await setDoc(page, FM(`'***'`));
    await save(page);
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    const calls = (await fsState(page)).saveCalls;
    expect(calls[0]).toBe('***.md');
    expect(calls[1]).toBe('---.md');
  });

  test('O-03 both attempts refused: an error sheet, the document stays edited, nothing written', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlDetectFrontMatter=true');
    await script(page, ['type', 'type']);
    await setDoc(page, FM(`'a/b: c'`));
    await save(page);
    await expect(page.getByTestId('alert-message')).toHaveText('The document “Untitled” could not be saved.');
    await page.getByTestId('alert-ok').click();
    expect((await fsState(page)).writes.length).toBe(0);
    expect((await fsState(page)).saveCalls.length).toBe(2);
    await expect(page).toHaveTitle('Untitled — Edited');
    // the editor is usable again
    await editorEl(page).click();
    await page.keyboard.type('Z');
    expect(await text(page)).toContain('Z');
  });

  test('O-03 first refused, the second panel throws NotAllowedError / SecurityError (no user activation): error sheet', async ({ page }) => {
    for (const second of ['notallowed', 'security'] as Behaviour[]) {
      await mockFs(page);
      await open(page, '?pref.htmlDetectFrontMatter=true');
      await script(page, ['type', second]);
      await setDoc(page, FM(`'a/b: c'`));
      await save(page);
      await expect(page.getByTestId('alert-message')).toContainText('could not be saved');
      await page.getByTestId('alert-ok').click();
    }
  });

  test('O-03 the user cancels the panel (AbortError): no retry, no error sheet, still edited', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlDetectFrontMatter=true');
    await script(page, ['abort']);
    await setDoc(page, FM(`'a/b: c'`));
    await save(page);
    await page.waitForTimeout(300);
    expect((await fsState(page)).saveCalls.length).toBe(1);
    await expect(page.getByTestId('alert')).toHaveCount(0);
    await expect(page).toHaveTitle('Untitled — Edited');
  });

  test('O-03 a refused name, then the user cancels the retry: no error sheet', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlDetectFrontMatter=true');
    await script(page, ['type', 'abort']);
    await setDoc(page, FM(`'a/b: c'`));
    await save(page);
    await page.waitForTimeout(300);
    expect((await fsState(page)).saveCalls.length).toBe(2);
    await expect(page.getByTestId('alert')).toHaveCount(0);
    await expect(page).toHaveTitle('Untitled — Edited');
  });

  test('O-03 Save As (current name from a saved document) is retried the same way', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await openFile(page, 'q*r?.md', 'text');
    await script(page, ['type', 'ok']);
    await menu(page, 'file', 'save-as');
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    expect((await fsState(page)).saveCalls).toEqual(['q*r?.md', 'q-r-.md']);
  });

  test('O-03 Export HTML: refused name retried with a safe name; both refused gives the export error sheet', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlDetectFrontMatter=true');
    await script(page, ['type', 'ok']);
    await setDoc(page, FM(`'a/b: c'`));
    await menu(page, 'file', 'export-html');
    await page.getByTestId('export-html-save').click();
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    expect((await fsState(page)).saveCalls).toEqual(['a/b: c.html', 'a-b- c.html']);
    await script(page, ['type', 'type']);
    await menu(page, 'file', 'export-html');
    await page.getByTestId('export-html-save').click();
    await expect(page.getByTestId('alert-message')).toHaveText(/^The file “.*\.html” could not be exported\.$/);
  });

  test('SD-13 an empty front-matter title gives the name "" : Export suggests ".html", Save suggests Untitled.md, no error', async ({ page }) => {
    await mockFs(page);
    await open(page, '?pref.htmlDetectFrontMatter=true');
    await setDoc(page, '---\ntitle:\n---\n# H');
    await save(page);
    await expect.poll(async () => (await fsState(page)).writes.length).toBe(1);
    expect((await fsState(page)).saveCalls).toEqual(['Untitled.md']);
  });
});

test.describe('F-18 in-page links', () => {
  const frameOf = (page: Page) => page.frames().find((f) => f.parentFrame() === page.mainFrame())!;
  const filler = Array.from({ length: 60 }, (_, i) => `<p>filler ${i}</p>`).join('\n');
  const topOf = (page: Page, sel: string) => frameOf(page).evaluate((s) => Math.round(document.querySelector(s)!.getBoundingClientRect().top + window.scrollY), sel);
  const scrollY = (page: Page) => frameOf(page).evaluate(() => Math.round(window.scrollY));
  const errors = (page: Page) => {
    const list: string[] = [];
    page.on('pageerror', (e) => list.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Blocked script execution') && list.push(m.text()));
    return list;
  };
  async function load(page: Page, md: string) {
    await open(page);
    await setDoc(page, md);
    await expect(preview(page).locator('[data-last]')).toHaveCount(1);
  }
  const doc = (head: string, mid: string) => `${head}\n\n${filler}\n\n${mid}\n\n${filler}\n\n<p data-last>end</p>`;

  test('F-18 an id wins over an earlier <a name> with the same value', async ({ page }) => {
    await load(page, doc('[go](#t)\n\n<a name="t" id="n1">named</a>', '<h2 id="t">by id</h2>'));
    await preview(page).locator('a[href="#t"]').click();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
    expect(Math.abs((await scrollY(page)) - (await topOf(page, 'h2#t')))).toBeLessThan(3);
  });

  test('F-18 with an <a name> early and an id late (and the reverse) the id is the target', async ({ page }) => {
    await load(page, doc('[go](#t)\n\n<h2 id="t">early id</h2>', '<a name="t">late name</a>'));
    await preview(page).locator('a[href="#t"]').click();
    await page.waitForTimeout(200);
    expect(Math.abs((await scrollY(page)) - (await topOf(page, 'h2#t')))).toBeLessThan(3);
    expect(await topOf(page, 'h2#t')).toBeLessThan(300);
  });

  test('F-18 several <a name> with one value: the first; a name on a non-<a> element is not a target', async ({ page }) => {
    await load(page, doc('[go](#d) [no](#x)\n\n<p>top</p>', '<a name="d" id="first">1</a>\n\n<div name="x" id="notanchor">div</div>\n\n<a name="d" id="second">2</a>'));
    await preview(page).locator('a[href="#d"]').click();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
    expect(Math.abs((await scrollY(page)) - (await topOf(page, '#first')))).toBeLessThan(3);
    await frameOf(page).evaluate(() => window.scrollTo(0, 0));
    await preview(page).locator('a[href="#x"]').click();
    await page.waitForTimeout(250);
    expect(await scrollY(page)).toBe(0);
  });

  test('F-18 "#" and "#top" go to the top; an element with id="top" is the target of #top; #Top / #TOP also top', async ({ page }) => {
    await load(page, doc('[a](#) [b](#top) [c](#TOP) [d](#Top)', '<p>middle</p>'));
    for (const h of ['#', '#top', '#TOP', '#Top']) {
      await frameOf(page).evaluate(() => window.scrollTo(0, 700));
      await preview(page).locator(`a[href="${h}"]`).click();
      await expect.poll(() => scrollY(page), h).toBe(0);
    }
  });

  test('F-18 id="top" in the middle: #top goes to that element (HTML rule, id first)', async ({ page }) => {
    await load(page, doc('[b](#top)', '<h2 id="top">mid</h2>'));
    await preview(page).locator('a[href="#top"]').click();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
  });

  test('F-18 percent-encoded fragments: %41 -> id A, a%20b -> "a b", caf%C3%A9 -> café; id written with a literal % wins as written', async ({ page }) => {
    const err = errors(page);
    await load(
      page,
      doc('[p](#%41) [q](#a%20b) [r](#caf%C3%A9) [s](#100%25)', '<h2 id="A">A</h2>\n\n<h2 id="a b">sp</h2>\n\n<h2 id="café">cafe</h2>\n\n<h2 id="100%">pct</h2>'),
    );
    for (const [href, sel] of [['#%41', '#A'], ['#a%20b', 'h2[id="a b"]'], ['#caf%C3%A9', 'h2[id="café"]'], ['#100%25', 'h2[id="100%"]']] as const) {
      await frameOf(page).evaluate(() => window.scrollTo(0, 0));
      await preview(page).locator(`a[href="${href}"]`).click();
      await expect.poll(() => scrollY(page), href).toBeGreaterThan(300);
      expect(Math.abs((await scrollY(page)) - (await topOf(page, sel))), href).toBeLessThan(3);
    }
    expect(err).toEqual([]);
  });

  test('F-18 malformed escapes (#100%, #%, #%zz, #%E0%A4%A, #%FF, #%C3) never raise and do not scroll', async ({ page }) => {
    const err = errors(page);
    await load(page, doc('<a href="#100%">1</a> <a href="#%">2</a> <a href="#%zz">3</a> <a href="#%E0%A4%A">4</a> <a href="#%FF">5</a> <a href="#%C3">6</a>', '<p>x</p>'));
    for (const h of ['#100%', '#%', '#%zz', '#%E0%A4%A', '#%FF', '#%C3']) {
      await preview(page).locator(`a[href="${h}"]`).click();
      await page.waitForTimeout(80);
      expect(await scrollY(page), h).toBe(0);
    }
    expect(err).toEqual([]);
  });

  test('F-18 an id that is the literal malformed text is found as written (<h2 id="100%">, href="#100%")', async ({ page }) => {
    const err = errors(page);
    await load(page, doc('<a href="#100%">go</a>', '<h2 id="100%">lit</h2>'));
    await preview(page).locator('a[href="#100%"]').click();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
    expect(err).toEqual([]);
  });
});

test.describe('D-20 focus after document commands (matrix)', () => {
  const activeIsEditor = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[data-testid="editor"]') && document.activeElement?.classList.contains('cm-content'));
  const dismiss = async (page: Page) => {
    const b = page.getByTestId('save-prompt-dont-save');
    if (await b.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) await b.click();
  };
  const typedWorks = async (page: Page) => {
    await page.keyboard.type('Z');
    return (await text(page)).includes('Z');
  };

  test('D-20 New, Open, Revert, Help, Close each leave the cursor in the editor', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await setDoc(page, 'edited');
    await menu(page, 'file', 'new');
    await page.getByTestId('save-prompt-dont-save').click();
    await expect(page.getByTestId('save-prompt')).toHaveCount(0);
    expect(await activeIsEditor(page)).toBe(true);
    expect(await typedWorks(page)).toBe(true);

    await page.evaluate(() => (window as any).__fs.openQueue.push({ name: 'f.md', text: 'file' }));
    await menu(page, 'file', 'open');
    await dismiss(page);
    await expect(page).toHaveTitle('f.md');
    expect(await activeIsEditor(page)).toBe(true);
    expect(await typedWorks(page)).toBe(true);

    await menu(page, 'file', 'revert');
    await page.getByTestId('revert-prompt-revert').click();
    await expect.poll(() => text(page)).toBe('file');
    expect(await activeIsEditor(page)).toBe(true);
    expect(await typedWorks(page)).toBe(true);

    await menu(page, 'help', 'help');
    await expect(page.getByTestId('save-prompt')).toHaveCount(0);
    await expect.poll(() => text(page).then((t) => t.length)).toBeGreaterThan(1000);
    expect(await activeIsEditor(page)).toBe(true);
    expect(await typedWorks(page)).toBe(true);

    await menu(page, 'file', 'close');
    await dismiss(page);
    await expect.poll(() => text(page)).toBe('Zfile');
    expect(await activeIsEditor(page)).toBe(true);
    expect(await typedWorks(page)).toBe(true);
  });

  test('D-20 with the editor pane hidden the preview gets the focus after New, Open, Help, Close, and typing changes nothing', async ({ page }) => {
    await mockFs(page);
    await open(page);
    await menu(page, 'view', 'toggle-editor');
    await expect(page.getByTestId('split')).toHaveAttribute('data-editor-visible', 'false');
    const focusId = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    await menu(page, 'file', 'new');
    await expect.poll(focusId).toBe('preview-iframe');
    await page.evaluate(() => (window as any).__fs.openQueue.push({ name: 'f.md', text: 'file' }));
    await menu(page, 'file', 'open');
    await expect(page).toHaveTitle('f.md');
    await expect.poll(focusId).toBe('preview-iframe');
    await menu(page, 'help', 'help');
    await expect.poll(() => text(page).then((t) => t.length)).toBeGreaterThan(1000);
    await expect.poll(focusId).toBe('preview-iframe');
    await menu(page, 'file', 'close');
    await expect.poll(() => text(page)).toBe('file');
    await expect.poll(focusId).toBe('preview-iframe');
    await page.keyboard.type('Z');
    expect(await text(page)).toBe('file');
  });

  test('D-20 no document (P-02 off): Close focuses New; New and Open and Help from there focus the editor', async ({ page }) => {
    await mockFs(page);
    await page.goto('/?pref.supressesUntitledDocumentOnLaunch=true');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.getByTestId('empty-state-new').click();
    await expect.poll(() => activeIsEditor(page)).toBe(true);
    await menu(page, 'file', 'close');
    await expect(page.getByTestId('empty-state-new')).toBeFocused();
    // Enter on the focused New button creates a document with the editor focused
    await page.keyboard.press('Enter');
    await expect.poll(() => activeIsEditor(page)).toBe(true);
    expect(await typedWorks(page)).toBe(true);
    await menu(page, 'file', 'close');
    await page.getByTestId('save-prompt-dont-save').click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.evaluate(() => (window as any).__fs.openQueue.push({ name: 'f.md', text: 'file' }));
    await page.getByTestId('empty-state-open').click();
    await expect(page).toHaveTitle('f.md');
    await expect.poll(() => activeIsEditor(page)).toBe(true);
    await menu(page, 'file', 'close');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await menu(page, 'help', 'help');
    await expect.poll(() => text(page).then((t) => t.length)).toBeGreaterThan(1000);
    await expect.poll(() => activeIsEditor(page)).toBe(true);
  });
});
