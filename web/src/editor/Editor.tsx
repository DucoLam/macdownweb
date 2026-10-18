import { useEffect, useRef } from 'react';
import { Compartment, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { behaviourPrefs } from './commands';
import { useUserAssetsVersion } from '../prefs/userAssets';
import { behaviourFrom, createEditorState, editorAppearance, type EditorPreferences } from './setup';
import { fileText, normalizeLineBreaks, resetLineBreaks } from './lineBreaks';

export interface EditorProps {
  initialText: string;
  prefs: EditorPreferences;
  /** False while the editor pane is collapsed (`editor.editable = editorVisible`). */
  editable: boolean;
  onChange: (text: string) => void;
  onScroll: (view: EditorView) => void;
  onReady: (view: EditorView | null) => void;
  /** F-74: the theme failed to parse; the caller resets `editorStyleName`. */
  onThemeError?: (errors: string[]) => void;
}

export function Editor({ initialText, prefs, editable, onChange, onScroll, onReady, onThemeError }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartments = useRef({ appearance: new Compartment(), behaviour: new Compartment(), editable: new Compartment() });
  const handlers = useRef({ onChange, onScroll, onReady, onThemeError });
  handlers.current = { onChange, onScroll, onReady, onThemeError };
  const assetsVersion = useUserAssetsVersion(); // F-138: Reload / import re-applies the theme

  useEffect(() => {
    const state = createEditorState(
      initialText,
      prefs,
      { onDocChanged: (t) => handlers.current.onChange(t) },
      compartments.current,
    );
    const view = new EditorView({ state, parent: host.current! });
    viewRef.current = view;
    const scroller = view.scrollDOM;
    const scroll = () => handlers.current.onScroll(view);
    scroller.addEventListener('scroll', scroll, { passive: true });
    handlers.current.onReady(view);
    installTestHook(view);
    return () => {
      installTestHook(null);
      scroller.removeEventListener('scroll', scroll);
      handlers.current.onReady(null);
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once; later changes go through compartments.
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const appearance = editorAppearance(prefs);
    view.dispatch({
      effects: [
        compartments.current.appearance.reconfigure(appearance.extension),
        compartments.current.behaviour.reconfigure(behaviourPrefs.of(behaviourFrom(prefs))),
      ],
    });
    host.current?.setAttribute('data-theme', prefs.editorStyleName);
    if (appearance.themeErrors.length) handlers.current.onThemeError?.(appearance.themeErrors);
  }, [prefs, assetsVersion]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.editable.reconfigure(EditorView.editable.of(editable)),
    });
  }, [editable]);

  return <div ref={host} className="editor-host" data-testid="editor" data-theme={prefs.editorStyleName} />;
}

/** Testing aid (like `window.macdownPrefs`): exact text and selection access for E2E tests. */
export interface EditorTestHook {
  text(): string;
  selection(): { from: number; to: number };
  /** Replaces the whole document (one transaction, no input rules) and sets the selection. */
  set(doc: string, from?: number, to?: number): void;
  select(from: number, to?: number): void;
}

function installTestHook(view: EditorView | null) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { macdownEditor?: EditorTestHook };
  if (!view) {
    delete w.macdownEditor;
    return;
  }
  w.macdownEditor = {
    // The document text with its own line breaks (D-13), as Save writes it.
    text: () => fileText(view.state),
    selection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    // Positions are editor offsets (a CRLF or CR break counts as one character).
    set: (doc, from = normalizeLineBreaks(doc).length, to = from) => {
      // Like `-[NSTextView setString:]`, the given line breaks are kept (D-13).
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: doc },
        selection: EditorSelection.single(from, to),
        effects: resetLineBreaks.of(doc),
      });
      view.focus();
    },
    select: (from, to = from) => {
      view.dispatch({ selection: EditorSelection.single(from, to) });
      view.focus();
    },
  };
}
