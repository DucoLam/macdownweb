import { describe, expect, it } from 'vitest';
import {
  INITIAL_SPLIT,
  editorVisible,
  leftRatio,
  previewToggleHidden,
  previewVisible,
  setLeftRatio,
  togglePane,
} from '../../src/layout/split';
import { computePreviewScrollTop, editorAnchorLines } from '../../src/layout/scrollSync';
import { countText, wordCountLabel } from '../../src/render';
import { parsePrefOverrides, PreferencesStore, DEFAULT_PREFERENCES } from '../../src/prefs';

describe('split view (F-01, F-04–F-08, F-10)', () => {
  it('starts at 1:1 with both panes visible', () => {
    expect(leftRatio(INITIAL_SPLIT, false)).toBe(0.5);
    expect(editorVisible(INITIAL_SPLIT) && previewVisible(INITIAL_SPLIT)).toBe(true);
  });
  it('hides and restores the preview with the previous ratio', () => {
    const s1 = setLeftRatio(INITIAL_SPLIT, 0.25, false);
    const hidden = togglePane(s1, false);
    expect(previewVisible(hidden)).toBe(false);
    expect(leftRatio(hidden, false)).toBe(1);
    expect(leftRatio(togglePane(hidden, false), false)).toBe(0.25);
  });
  it('switches from 100% editor to 100% preview without losing the ratio', () => {
    const s = togglePane(setLeftRatio(INITIAL_SPLIT, 0.75, false), false); // hide preview
    const s2 = togglePane(s, true); // hide editor
    expect(editorVisible(s2)).toBe(false);
    expect(togglePane(s2, true).editorFraction).toBe(0.75);
  });
  it('falls back to 0.5 when there is nothing to restore', () => {
    const collapsed = setLeftRatio(INITIAL_SPLIT, 1, false);
    expect(previewToggleHidden(collapsed)).toBe(true);
    expect(togglePane(collapsed, false).editorFraction).toBe(0.5);
  });
  it('mirrors the ratio when the editor is on the right (P-03)', () => {
    const s = setLeftRatio(INITIAL_SPLIT, 0.25, true);
    expect(s.editorFraction).toBe(0.75);
    expect(leftRatio(togglePane(s, true), true)).toBe(1); // editor hidden → preview fills
  });
  it('clamps the divider position', () => {
    expect(setLeftRatio(INITIAL_SPLIT, -3, false).editorFraction).toBe(0);
    expect(setLeftRatio(INITIAL_SPLIT, 7, false).editorFraction).toBe(1);
  });
});

describe('scroll sync (F-11)', () => {
  it('finds ATX headers, setext underlines after content, and lone images', () => {
    const lines = ['# A', 'text', 'Sub', '---', '', '---', '![x](y.png)', 'a ![x](y) b', '#nospace'];
    expect(editorAnchorLines(lines)).toEqual([0, 3, 6]);
  });
  it('maps the top of the document to the top of the preview', () => {
    const y = computePreviewScrollTop({
      editorScrollTop: 0,
      editorContentHeight: 2000,
      editorVisibleHeight: 500,
      editorLocations: [100, 900],
      previewContentHeight: 4000,
      previewVisibleHeight: 500,
      previewLocations: [200, 1800],
    });
    expect(y).toBe(0);
  });
  it('maps the bottom of the editor to the bottom of the preview', () => {
    const y = computePreviewScrollTop({
      editorScrollTop: 1500,
      editorContentHeight: 2000,
      editorVisibleHeight: 500,
      editorLocations: [100, 900],
      previewContentHeight: 4000,
      previewVisibleHeight: 500,
      previewLocations: [200, 1800],
    });
    expect(y).toBe(3500);
  });
  it('interpolates between matching headers', () => {
    // currY = 1000 → adjustment = 250; header 900 → 650 < 1000 (index 0, minY 650).
    const y = computePreviewScrollTop({
      editorScrollTop: 1000,
      editorContentHeight: 4000,
      editorVisibleHeight: 500,
      editorLocations: [900, 1650],
      previewContentHeight: 8000,
      previewVisibleHeight: 500,
      previewLocations: [2000, 3500],
    });
    // percent = (1000-650)/(1400-650) = 0.4667; top = 1750, bottom = 3250
    expect(y).toBeCloseTo(1750 + 1500 * (350 / 750), 5);
  });
});

describe('word count (F-12)', () => {
  it('counts words, characters and characters without spaces from the DOM', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>ignored words</title><style>p{}</style></head><body><p>Hello big world</p><p>use <code>a b</code></p><div><pre><code>not counted</code></pre></div></body></html>',
      'text/html',
    );
    const c = countText(doc);
    expect(c.words).toBe(5); // Hello big world use + inline code = 1
    expect(c.characters).toBe('Hello big worlduse a bnot counted'.length);
    expect(c.charactersNoSpaces).toBe('Hellobigworlduseabnotcounted'.length);
  });
  it('uses the Localizable.strings labels with singular/plural forms', () => {
    const c = { words: 1, characters: 2, charactersNoSpaces: 1 };
    expect(wordCountLabel(0, c)).toBe('1 word');
    expect(wordCountLabel(1, c)).toBe('2 characters');
    expect(wordCountLabel(2, c)).toBe('1 character (no spaces)');
    expect(wordCountLabel(0, { ...c, words: 1234 })).toBe('1234 words');
  });
});

describe('preferences (§8)', () => {
  it('has the spec defaults', () => {
    expect(DEFAULT_PREFERENCES.extensionTables).toBe(true);
    expect(DEFAULT_PREFERENCES.extensionFencedCode).toBe(true);
    expect(DEFAULT_PREFERENCES.extensionAutolink).toBe(false);
    expect(DEFAULT_PREFERENCES.extensionStrikethough).toBe(false);
    expect(DEFAULT_PREFERENCES.editorSyncScrolling).toBe(true);
    expect(DEFAULT_PREFERENCES.editorShowWordCount).toBe(false);
    expect(DEFAULT_PREFERENCES.htmlStyleName).toBe('GitHub2');
    expect(DEFAULT_PREFERENCES.markdownManualRender).toBe(false);
  });
  it('parses ?pref.key=value overrides and ignores unknown keys', () => {
    expect(parsePrefOverrides('?pref.editorShowWordCount=true&pref.htmlStyleName=Clearness&pref.bogus=1&x=2')).toEqual({
      editorShowWordCount: true,
      htmlStyleName: 'Clearness',
    });
  });
  it('notifies subscribers on set', () => {
    const store = new PreferencesStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ editorOnRight: true });
    expect(store.get().editorOnRight).toBe(true);
    expect(calls).toBe(1);
  });
});
