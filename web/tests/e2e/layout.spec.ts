import { test, expect } from '@playwright/test';
import { open, mod, splitState, viewMenu, widthOf, editorEl, typeText } from './helpers';

test.describe('F-01 split window', () => {
  test('F-01 starts with editor left, preview right, about 1:1, both visible', async ({ page }) => {
    await open(page);
    const st = await splitState(page);
    expect(st).toEqual({ ratio: 0.5, editor: true, preview: true });
    const e = (await page.getByTestId('editor-pane').boundingBox())!;
    const p = (await page.getByTestId('preview-pane').boundingBox())!;
    expect(e.x).toBeLessThan(p.x);
    expect(Math.abs(e.width - p.width)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('split-divider')).toBeVisible();
    await expect(page.getByTestId('toolbar')).toBeVisible();
  });

  test('F-01 default window title/tab title is Untitled (F-16 partial)', async ({ page }) => {
    await open(page);
    await expect(page).toHaveTitle('Untitled');
  });

  test('F-01 dragging the divider resizes the split', async ({ page }) => {
    await open(page);
    const box = (await page.getByTestId('split').boundingBox())!;
    const div = (await page.getByTestId('split-divider').boundingBox())!;
    const y = div.y + div.height / 2;
    await page.mouse.move(div.x + div.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 8 });
    await page.mouse.up();
    const st = await splitState(page);
    expect(st.ratio).toBeGreaterThan(0.27);
    expect(st.ratio).toBeLessThan(0.33);
    const ew = await widthOf(page.getByTestId('editor-pane'));
    const pw = await widthOf(page.getByTestId('preview-pane'));
    expect(ew).toBeLessThan(pw);
    expect(Math.abs(ew / (ew + pw) - st.ratio)).toBeLessThan(0.02);
    // drag the other way
    const d2 = (await page.getByTestId('split-divider').boundingBox())!;
    await page.mouse.move(d2.x + d2.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 8 });
    await page.mouse.up();
    expect((await splitState(page)).ratio).toBeGreaterThan(0.75);
  });

  test('F-01 dragging the divider past the edge collapses a pane without errors (boundary)', async ({ page }) => {
    await open(page);
    const box = (await page.getByTestId('split').boundingBox())!;
    const div = (await page.getByTestId('split-divider').boundingBox())!;
    const y = div.y + div.height / 2;
    await page.mouse.move(div.x + div.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x - 50, y, { steps: 5 });
    await page.mouse.up();
    const st = await splitState(page);
    expect(st.ratio).toBe(0);
    expect(st.editor).toBe(false);
  });
});

test.describe('F-04..F-06 split ratios', () => {
  const cases: [string, string, number][] = [
    ['F-04', 'split-1-3', 0.25],
    ['F-05', 'split-1-1', 0.5],
    ['F-06', 'split-3-1', 0.75],
  ];
  for (const [id, item, ratio] of cases) {
    test(`${id} View menu ${item} sets the divider to ${ratio}`, async ({ page }) => {
      await open(page);
      // start from a different ratio so the action is observable
      if (ratio === 0.5) await viewMenu(page, 'split-1-3');
      await viewMenu(page, item);
      expect((await splitState(page)).ratio).toBe(ratio);
      const ew = await widthOf(page.getByTestId('editor-pane'));
      const pw = await widthOf(page.getByTestId('preview-pane'));
      expect(Math.abs(ew / (ew + pw) - ratio)).toBeLessThan(0.01);
    });
  }

  test('F-05 Shift+Cmd+0 sets 1:1', async ({ page }) => {
    await open(page);
    await viewMenu(page, 'split-3-1');
    await editorEl(page).click();
    await page.keyboard.press(`${await mod(page)}+Shift+Digit0`);
    expect((await splitState(page)).ratio).toBe(0.5);
  });

  test('F-04/F-06 shortcut-less items: menu shows no shortcut text', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-split-1-3')).not.toContainText(/[⌘⇧⌥]|Ctrl|Shift/);
    await expect(page.getByTestId('menuitem-split-3-1')).not.toContainText(/[⌘⇧⌥]|Ctrl|Shift/);
    await expect(page.getByTestId('menuitem-split-1-1')).toContainText(/0/);
  });
});

test.describe('F-07 / F-08 / F-09 hide and restore', () => {
  test('F-07 View menu hides and restores the preview with title toggle', async ({ page }) => {
    await open(page);
    await viewMenu(page, 'split-3-1');
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-preview')).toHaveText(/Hide Preview Pane/);
    await page.getByTestId('menuitem-toggle-preview').click();
    let st = await splitState(page);
    expect(st).toEqual({ ratio: 1, editor: true, preview: false });
    expect(await widthOf(page.getByTestId('preview-pane'))).toBeLessThan(2);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-preview')).toHaveText(/Restore Preview Pane/);
    await page.getByTestId('menuitem-toggle-preview').click();
    st = await splitState(page);
    expect(st).toEqual({ ratio: 0.75, editor: true, preview: true });
  });

  test('F-08 View menu hides and restores the editor with title toggle', async ({ page }) => {
    await open(page);
    await viewMenu(page, 'split-1-3');
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-editor')).toHaveText(/Hide Editor Pane/);
    await page.getByTestId('menuitem-toggle-editor').click();
    expect(await splitState(page)).toEqual({ ratio: 0, editor: false, preview: true });
    expect(await widthOf(page.getByTestId('editor-pane'))).toBeLessThan(2);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-editor')).toHaveText(/Restore Editor Pane/);
    await page.getByTestId('menuitem-toggle-editor').click();
    expect(await splitState(page)).toEqual({ ratio: 0.25, editor: true, preview: true });
  });

  test('F-07 Shift+Cmd+H hides and restores the preview', async ({ page }) => {
    await open(page);
    await editorEl(page).click();
    const k = `${await mod(page)}+Shift+KeyH`;
    await page.keyboard.press(k);
    expect((await splitState(page)).preview).toBe(false);
    await page.keyboard.press(k);
    expect(await splitState(page)).toEqual({ ratio: 0.5, editor: true, preview: true });
  });

  test('F-08 Shift+Cmd+E hides and restores the editor', async ({ page }) => {
    await open(page);
    await editorEl(page).click();
    const k = `${await mod(page)}+Shift+KeyE`;
    await page.keyboard.press(k);
    expect((await splitState(page)).editor).toBe(false);
    await page.keyboard.press(k);
    expect(await splitState(page)).toEqual({ ratio: 0.5, editor: true, preview: true });
  });

  test('F-08 shortcut works when focus is inside the preview iframe', async ({ page }) => {
    await open(page);
    await page.locator('[data-testid="preview-iframe"]').click();
    await page.keyboard.press(`${await mod(page)}+Shift+KeyE`);
    expect((await splitState(page)).editor).toBe(false);
  });

  test('F-08 editor is not editable while collapsed', async ({ page }) => {
    await open(page);
    await typeText(page, 'abc');
    await viewMenu(page, 'toggle-editor');
    await expect(editorEl(page)).toHaveAttribute('contenteditable', 'false');
    await viewMenu(page, 'toggle-editor');
    await expect(editorEl(page)).toHaveAttribute('contenteditable', 'true');
  });

  test('F-09 toolbar Layout pull-down toggles the editor pane', async ({ page }) => {
    await open(page);
    await page.getByTestId('toolbar-layout').click();
    await expect(page.getByTestId('layout-toggle-editor')).toHaveText(/Hide Editor Pane/);
    await expect(page.getByTestId('layout-toggle-preview')).toHaveText(/Hide Preview Pane/);
    await page.getByTestId('layout-toggle-editor').click();
    expect((await splitState(page)).editor).toBe(false);
    await page.getByTestId('toolbar-layout').click();
    await expect(page.getByTestId('layout-toggle-editor')).toHaveText(/Restore Editor Pane/);
    await page.getByTestId('layout-toggle-editor').click();
    expect(await splitState(page)).toEqual({ ratio: 0.5, editor: true, preview: true });
  });

  test('F-09 toolbar Layout pull-down toggles the preview pane', async ({ page }) => {
    await open(page);
    await page.getByTestId('toolbar-layout').click();
    await page.getByTestId('layout-toggle-preview').click();
    expect((await splitState(page)).preview).toBe(false);
    await page.getByTestId('toolbar-layout').click();
    await expect(page.getByTestId('layout-toggle-preview')).toHaveText(/Restore Preview Pane/);
    await page.getByTestId('layout-toggle-preview').click();
    expect(await splitState(page)).toEqual({ ratio: 0.5, editor: true, preview: true });
  });

  test('F-09 pull-down items have no shortcut text of their own', async ({ page }) => {
    await open(page);
    await page.getByTestId('toolbar-layout').click();
    await expect(page.getByTestId('layout-toggle-editor')).not.toContainText(/Ctrl|Shift|⌘/);
  });

  test('F-07 editor hidden then preview hidden path: switching 100% editor <-> 100% preview keeps old ratio', async ({ page }) => {
    await open(page);
    await viewMenu(page, 'split-1-3');
    await viewMenu(page, 'toggle-preview'); // editor 100%
    await viewMenu(page, 'toggle-editor'); // editor visible -> collapses it (0); 1 was not saved as previous
    const st = await splitState(page);
    expect(st.editor).toBe(false);
    await viewMenu(page, 'toggle-editor');
    expect((await splitState(page)).ratio).toBe(0.25);
  });

  test('F-07 Restore Preview Pane item is hidden when there is nothing to restore', async ({ page }) => {
    await open(page);
    // "Collapsed with no previous ratio" is reachable only by dragging the divider to the edge.
    const box = (await page.getByTestId('split').boundingBox())!;
    const div = (await page.getByTestId('split-divider').boundingBox())!;
    const y = div.y + div.height / 2;
    await page.mouse.move(div.x + 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 40, y, { steps: 5 });
    await page.mouse.up();
    expect((await splitState(page)).preview).toBe(false);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-preview')).toHaveCount(0);
  });
});

test.describe('F-10 editor on right', () => {
  test('F-10 editorOnRight swaps panes and mirrors the ratio semantic', async ({ page }) => {
    await open(page, '?pref.editorOnRight=true');
    const e = (await page.getByTestId('editor-pane').boundingBox())!;
    const p = (await page.getByTestId('preview-pane').boundingBox())!;
    expect(p.x).toBeLessThan(e.x);
    await viewMenu(page, 'split-1-3'); // left (preview) is narrow
    expect((await splitState(page)).ratio).toBe(0.25);
    const pw = await widthOf(page.getByTestId('preview-pane'));
    const ew = await widthOf(page.getByTestId('editor-pane'));
    expect(pw).toBeLessThan(ew);
  });
});

test.describe('F-13 toolbar', () => {
  test('F-13 View menu hides and shows the toolbar with title toggle', async ({ page }) => {
    await open(page);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-toolbar')).toHaveText(/Hide Toolbar/);
    await page.getByTestId('menuitem-toggle-toolbar').click();
    await expect(page.getByTestId('toolbar')).toHaveCount(0);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-toggle-toolbar')).toHaveText(/Show Toolbar/);
    await page.getByTestId('menuitem-toggle-toolbar').click();
    await expect(page.getByTestId('toolbar')).toBeVisible();
  });

  test('F-13 Opt+Cmd+T toggles the toolbar', async ({ page }) => {
    await open(page);
    await editorEl(page).click();
    const k = `${await mod(page)}+Alt+KeyT`;
    await page.keyboard.press(k);
    await expect(page.getByTestId('toolbar')).toHaveCount(0);
    await page.keyboard.press(k);
    await expect(page.getByTestId('toolbar')).toBeVisible();
  });

  test('F-13 toolbar contains the Layout pull-down and the default formatting items', async ({ page }) => {
    await open(page);
    for (const id of ['bold', 'italic', 'underline', 'heading1', 'heading2', 'heading3', 'unordered-list', 'ordered-list', 'blockquote', 'code', 'link', 'image', 'copy-html', 'shift-left', 'shift-right', 'layout']) {
      await expect(page.getByTestId(`toolbar-${id}`)).toHaveCount(1);
    }
  });
});

test.describe('F-15 full screen', () => {
  test('F-15 View menu has Enter Full Screen and requests fullscreen', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as any).__fs = 0;
      document.documentElement.requestFullscreen = (() => {
        (window as any).__fs++;
        return Promise.resolve();
      }) as any;
    });
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-full-screen')).toHaveText(/Enter Full Screen/);
    await page.getByTestId('menuitem-full-screen').click();
    expect(await page.evaluate(() => (window as any).__fs)).toBe(1);
  });

  test('F-15 real Fullscreen API toggles and menu title becomes Exit Full Screen', async ({ page }) => {
    await open(page);
    await viewMenu(page, 'full-screen');
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menuitem-full-screen')).toHaveText(/Exit Full Screen/);
    await page.getByTestId('menuitem-full-screen').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  });
});
