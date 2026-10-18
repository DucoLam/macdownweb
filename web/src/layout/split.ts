/**
 * Split-view state (F-01, F-04–F-08, F-10), ported from
 * `-[MPDocument toggleSplitterCollapsingEditorPane:]` and
 * `-[MPDocumentSplitView setDividerLocation:]`.
 *
 * The state stores the editor's share of the width (`editorFraction`), so it
 * is independent of which side the editor is on (P-03). The original stores
 * the left subview's ratio and flips `previousSplitRatio` when the panes are
 * swapped; storing the editor share is equivalent.
 */
export interface SplitState {
  /** Editor share of the width, 0..1. 0 = editor hidden, 1 = preview hidden. */
  editorFraction: number;
  /** Ratio to restore when a hidden pane is shown again; -1 = none yet. */
  previousFraction: number;
}

export const INITIAL_SPLIT: SplitState = { editorFraction: 0.5, previousFraction: -1 };

const clamp = (r: number) => (r < 0 ? 0 : r > 1 ? 1 : r);

export const editorVisible = (s: SplitState) => s.editorFraction !== 0;
export const previewVisible = (s: SplitState) => s.editorFraction !== 1;

/** Left subview ratio, as `-[MPDocumentSplitView dividerLocation]` reports it. */
export function leftRatio(s: SplitState, editorOnRight: boolean): number {
  return editorOnRight ? 1 - s.editorFraction : s.editorFraction;
}

/** `setDividerLocation:` with a left-pane ratio (View > Left n:m Right, divider drag). */
export function setLeftRatio(s: SplitState, ratio: number, editorOnRight: boolean): SplitState {
  const r = clamp(ratio);
  return { ...s, editorFraction: editorOnRight ? 1 - r : r };
}

/** F-07 / F-08 toggle with the original's ratio memory. */
export function togglePane(s: SplitState, forEditorPane: boolean): SplitState {
  const visible = forEditorPane ? editorVisible(s) : previewVisible(s);
  if (visible) {
    const old = s.editorFraction;
    // 0 and 1 are not saved, so the user can switch between 100% editor and
    // 100% preview without losing the old ratio.
    const previousFraction = old !== 0 && old !== 1 ? old : s.previousFraction;
    return { editorFraction: forEditorPane ? 0 : 1, previousFraction };
  }
  const previousFraction = s.previousFraction < 0 ? 0.5 : s.previousFraction;
  return { editorFraction: previousFraction, previousFraction };
}

/** Menu validation: "Restore Preview Pane" is hidden when there is nothing to restore. */
export function previewToggleHidden(s: SplitState): boolean {
  return !previewVisible(s) && s.previousFraction < 0;
}

/** Split presets (§1.1): 0.25, 0.5, 0.75 of the left pane. */
export const SPLIT_PRESETS = { oneQuarter: 0.25, equal: 0.5, threeQuarters: 0.75 } as const;
