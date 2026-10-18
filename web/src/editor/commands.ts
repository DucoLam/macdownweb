/**
 * CodeMirror wrappers for the editor commands (text.ts) and behaviours:
 * the Format menu (F-40 to F-61), editor behaviours (F-62 to F-73) and the
 * Edit-menu helpers (F-83 to F-93, F-105 to F-107).
 */
import { Facet, Prec, EditorSelection, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { deleteCharBackwardStrict, isolateHistory } from '@codemirror/commands';
import {
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import type { MacDownPreferences } from '../prefs/defaults';
import {
  BLOCKQUOTE,
  ORDERED_LIST,
  autoPairInput,
  deleteMatchingPair,
  indentLines,
  indentPadding,
  insertTab,
  makeHeader,
  newParagraph,
  returnKey,
  smartHomeTarget,
  toggleBlock,
  toggleLink,
  toggleMarkup,
  transform,
  unindentLines,
  unindentSpacesBefore,
  unorderedList,
  unorderedListMarker,
  type TextEdit,
  type TextState,
  type Transformation,
} from './text';

/** Preferences the behaviours read (§8.4). */
export type BehaviourPreferences = Pick<
  MacDownPreferences,
  | 'editorCompleteMatchingCharacters'
  | 'editorConvertTabs'
  | 'editorInsertPrefixInBlock'
  | 'editorAutoIncrementNumberedLists'
  | 'editorSmartHome'
  | 'editorUnorderedListMarkerType'
  | 'extensionStrikethough'
>;

export const DEFAULT_BEHAVIOUR: BehaviourPreferences = {
  editorCompleteMatchingCharacters: false,
  editorConvertTabs: false,
  editorInsertPrefixInBlock: true,
  editorAutoIncrementNumberedLists: true,
  editorSmartHome: false,
  editorUnorderedListMarkerType: 0,
  extensionStrikethough: false,
};

/** The current behaviour preferences (reconfigured through a compartment). */
export const behaviourPrefs = Facet.define<BehaviourPreferences, BehaviourPreferences>({
  combine: (values) => values[values.length - 1] ?? DEFAULT_BEHAVIOUR,
});

const prefsOf = (view: EditorView) => view.state.facet(behaviourPrefs);

/** The main selection as a TextState. */
export function textState(view: EditorView): TextState {
  const { from, to } = view.state.selection.main;
  return { doc: view.state.doc.toString(), from, to };
}

/**
 * Applies one edit (single undo step) and scrolls the selection into view.
 * `isolate` (menu and toolbar commands) puts the edit in an undo step of its
 * own: CodeMirror would otherwise merge typing within 500 ms into it, while
 * NSTextView always starts a new undo group for typing after a command.
 */
export function applyEdit(view: EditorView, e: TextEdit, userEvent = 'input', isolate = false): void {
  view.dispatch({
    changes: e.from === e.to && !e.insert ? undefined : { from: e.from, to: e.to, insert: e.insert },
    selection: EditorSelection.single(e.selFrom, e.selTo),
    scrollIntoView: true,
    userEvent,
    ...(isolate ? { annotations: isolateHistory.of('full') } : {}),
  });
}

/** Formatting is ignored while the editor is not editable (collapsed pane), as NSTextView does. */
const editable = (view: EditorView) => view.state.facet(EditorView.editable);

function run(view: EditorView, f: (s: TextState) => TextEdit | null, userEvent = 'input', isolate = false): boolean {
  if (!editable(view)) return false;
  const e = f(textState(view));
  if (!e) return false;
  applyEdit(view, e, userEvent, isolate);
  return true;
}

/** A menu or toolbar command: its own undo step, never merged with typing. */
const runCommand = (view: EditorView, f: (s: TextState) => TextEdit | null, userEvent = 'input') => run(view, f, userEvent, true);

// ---------------------------------------------------------------------------
// Format menu (§2.4, §3 Format)
// ---------------------------------------------------------------------------

export type FormatCommandId =
  | 'strong'
  | 'emphasize'
  | 'underline'
  | 'strikethrough'
  | 'highlight'
  | 'inline-code'
  | 'comment'
  | 'header-1'
  | 'header-2'
  | 'header-3'
  | 'header-4'
  | 'header-5'
  | 'header-6'
  | 'paragraph'
  | 'ordered-list'
  | 'unordered-list'
  | 'blockquote'
  | 'shift-right'
  | 'shift-left'
  | 'link'
  | 'image'
  | 'new-paragraph';

const MARKUP: Partial<Record<FormatCommandId, [string, string]>> = {
  strong: ['**', '**'], // F-40
  emphasize: ['*', '*'], // F-41
  underline: ['_', '_'], // F-42
  strikethrough: ['~~', '~~'], // F-43
  highlight: ['==', '=='], // F-44
  'inline-code': ['`', '`'], // F-45
  comment: ['<!--', '-->'], // F-46
};

/** Reads the clipboard text for F-59/F-60; any failure means "no URL". */
export type ClipboardReader = () => Promise<string | null>;

export const readClipboard: ClipboardReader = async () => {
  try {
    return (await navigator.clipboard?.readText?.()) ?? null;
  } catch {
    return null;
  }
};

/** Runs a Format command on the editor. Link and Image read the clipboard first. */
export function runFormatCommand(
  view: EditorView,
  id: FormatCommandId,
  clipboard: ClipboardReader = readClipboard,
): boolean | Promise<boolean> {
  const p = prefsOf(view);
  const markup = MARKUP[id];
  if (markup) return runCommand(view, (s) => toggleMarkup(s, markup[0], markup[1]));
  const header = /^header-([1-6])$/.exec(id);
  if (header) return runCommand(view, (s) => makeHeader(s, Number(header[1]))); // F-47 to F-52
  switch (id) {
    case 'paragraph': // F-53
      return runCommand(view, (s) => makeHeader(s, 0));
    case 'ordered-list': // F-54 (U-05 deviation)
      return runCommand(view, (s) => toggleBlock(s, ORDERED_LIST));
    case 'unordered-list': // F-55, marker from P-45
      return runCommand(view, (s) => toggleBlock(s, unorderedList(unorderedListMarker(p.editorUnorderedListMarkerType))));
    case 'blockquote': // F-56
      return runCommand(view, (s) => toggleBlock(s, BLOCKQUOTE));
    case 'shift-right': // F-57
      return runCommand(view, (s) => indentLines(s, indentPadding(p.editorConvertTabs)));
    case 'shift-left': // F-58
      return runCommand(view, unindentLines);
    case 'new-paragraph': // F-61
      return runCommand(view, newParagraph);
    case 'link': // F-59
    case 'image': // F-60
      if (!editable(view)) return false;
      return clipboard().then((text) => runCommand(view, (s) => toggleLink(s, id === 'image', text)));
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Editor behaviours (§5.1 to §5.3)
// ---------------------------------------------------------------------------

/** Cmd+Left (Home on other platforms): F-73 with P-40, otherwise plain line start. */
function lineStartCommand(extend: boolean) {
  return (view: EditorView): boolean => {
    const sel = view.state.selection.main;
    if (!extend && prefsOf(view).editorSmartHome) {
      const target = smartHomeTarget(textState(view));
      if (target !== null) {
        // Soft-wrapped line: when the target is on another visual row, the
        // normal behaviour is used (MPDocument.m:812-826).
        const len = view.state.doc.length;
        const a = view.coordsAtPos(target, 1);
        const b = view.coordsAtPos(Math.min(sel.from, Math.max(len - 1, 0)), 1);
        if (!a || !b || a.top === b.top) {
          view.dispatch({ selection: EditorSelection.cursor(target), scrollIntoView: true, userEvent: 'select' });
          return true;
        }
      }
    }
    // NSTextView moveToLeftEndOfLine: start of the visual row, no
    // indentation step (CodeMirror's default jumps to the indentation first).
    const moved = view.moveToLineBoundary(EditorSelection.cursor(sel.head, -1), false);
    view.dispatch({
      selection: extend ? EditorSelection.range(sel.anchor, moved.head) : EditorSelection.cursor(moved.head),
      scrollIntoView: true,
      userEvent: 'select',
    });
    return true;
  };
}

/** Return (and Shift+Return): §5.2. */
function returnCommand(view: EditorView): boolean {
  const p = prefsOf(view);
  return run(view, (s) =>
    returnKey(s, { insertPrefix: p.editorInsertPrefixInBlock, autoIncrement: p.editorAutoIncrementNumberedLists }),
  );
}

/**
 * Keymap and input handler for §5. Highest precedence, so CodeMirror's own
 * Enter (auto-indent), Tab and Backspace never run instead.
 */
export function editorBehaviours(): Extension {
  return [
    Prec.highest(
      keymap.of([
        {
          // F-66 to F-69. Q-04: Shift+Return is the same command. AppKit's key
          // bindings send `insertNewline:` for Return and Shift+Return alike
          // (probe: -[NSTextView interpretKeyEvents:]), and MacDown's
          // textView:doCommandBySelector: only sees the selector.
          key: 'Enter',
          shift: returnCommand,
          run: returnCommand,
        },
        {
          key: 'Tab', // F-70
          run: (view) => {
            const p = prefsOf(view);
            const s = textState(view);
            if (s.to > s.from) return run(view, (x) => indentLines(x, indentPadding(p.editorConvertTabs)));
            return run(view, (x) => insertTab(x, p.editorConvertTabs));
          },
        },
        { key: 'Shift-Tab', run: (view) => run(view, unindentLines) }, // F-71
        {
          key: 'Backspace', // F-65, F-72
          run: (view) => {
            const p = prefsOf(view);
            if (p.editorCompleteMatchingCharacters && run(view, deleteMatchingPair, 'delete.backward')) return true;
            const s = textState(view);
            if (p.editorConvertTabs && s.from === s.to && run(view, unindentSpacesBefore, 'delete.backward')) return true;
            // NSTextView deleteBackward: one character. CodeMirror's default
            // Backspace deletes a whole indent unit inside leading spaces.
            return deleteCharBackwardStrict(view);
          },
        },
        { mac: 'Cmd-ArrowLeft', win: 'Home', linux: 'Home', run: lineStartCommand(false), shift: lineStartCommand(true) }, // F-73
      ]),
    ),
    // F-62 to F-64: auto-pairing and wrapping of typed characters (P-36).
    // Highest precedence (D-09), so no other input handler sees the typed
    // character first. MacDown's shouldChangeTextInRange: runs before any
    // other text processing.
    Prec.highest(EditorView.inputHandler.of((view, from, to, text) => {
      const p = prefsOf(view);
      if (!p.editorCompleteMatchingCharacters || view.composing) return false; // §5.1 rule 0
      if (view.state.selection.ranges.length > 1) return false;
      const doc = view.state.doc.toString();
      const e = autoPairInput({ doc, from, to }, text, p.extensionStrikethough);
      if (!e) return false;
      applyEdit(view, e, 'input.type');
      return true;
    })),
  ];
}

// ---------------------------------------------------------------------------
// Edit menu (§2.6)
// ---------------------------------------------------------------------------

/** F-89 Find and Replace…: opens the panel and focuses the replace field. */
export function openFindAndReplace(view: EditorView): boolean {
  view.focus();
  openSearchPanel(view);
  const field = view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]');
  field?.focus();
  field?.select();
  return true;
}

/** F-92 Use Selection for Find: the selected text becomes the search string. */
export function useSelectionForFind(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) return false;
  const old = getSearchQuery(view.state);
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({ search: view.state.sliceDoc(from, to), caseSensitive: old.caseSensitive, regexp: false, wholeWord: old.wholeWord }),
    ),
  });
  return true;
}

/** F-90 / F-91. */
export const findNextCommand = (view: EditorView) => findNext(view);
export const findPreviousCommand = (view: EditorView) => findPrevious(view);

/** F-93 Jump to Selection (`centerSelectionInVisibleArea:`). */
export function jumpToSelection(view: EditorView): boolean {
  view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main, { y: 'center' }) });
  return true;
}

/** F-86 Delete: removes the selection (nothing with an empty selection). */
export function deleteSelection(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to || !editable(view)) return false;
  applyEdit(view, { from, to, insert: '', selFrom: from, selTo: from }, 'delete', true);
  return true;
}

/** F-83 / F-84 from the menu: the browser's own cut/copy on the focused editor. */
export function clipboardCommand(view: EditorView, kind: 'cut' | 'copy'): boolean {
  view.focus();
  const { from, to } = view.state.selection.main;
  if (from === to) return false;
  let ok = false;
  try {
    ok = document.execCommand(kind);
  } catch {
    ok = false;
  }
  if (!ok && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(view.state.sliceDoc(from, to));
    if (kind === 'cut' && editable(view)) applyEdit(view, { from, to, insert: '', selFrom: from, selTo: from }, 'delete.cut');
    ok = true;
  }
  return ok;
}

/** F-85 Paste from the menu: browsers only allow reading through the async Clipboard API. */
export async function pasteCommand(view: EditorView, clipboard: ClipboardReader = readClipboard): Promise<boolean> {
  const text = await clipboard();
  if (text === null || !editable(view)) return false;
  view.focus();
  const { from, to } = view.state.selection.main;
  const at = from + text.length;
  applyEdit(view, { from, to, insert: text, selFrom: at, selTo: at }, 'input.paste', true);
  return true;
}

/** F-105 to F-107 Transformations. */
export function transformCommand(view: EditorView, kind: Transformation): boolean {
  return runCommand(view, (s) => transform(s, kind));
}
