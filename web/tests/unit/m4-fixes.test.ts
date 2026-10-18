import { describe, expect, it } from 'vitest';
import { PreferencesStore } from '../../src/prefs/store';

describe('PreferencesStore.set', () => {
  it('notifies on a change and not on a patch that changes nothing (no write-back render cycles)', () => {
    const s = new PreferencesStore();
    let n = 0;
    s.subscribe(() => n++);
    const before = s.get();
    s.set({ editorStyleName: s.get().editorStyleName });
    expect(n).toBe(0);
    expect(s.get()).toBe(before);
    s.set({ editorStyleName: '' });
    expect(n).toBe(1);
    expect(s.get().editorStyleName).toBe('');
    s.set({ editorStyleName: '', toolbarVisible: false });
    expect(n).toBe(2);
  });
});
