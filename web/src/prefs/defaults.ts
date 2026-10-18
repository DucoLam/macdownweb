/**
 * Typed preferences with the defaults from docs/spec.md §8.
 * Keys keep the original NSUserDefaults names (including the original
 * misspellings `extensionStrikethough` and `supressesUntitledDocumentOnLaunch`)
 * so that later milestones can map them 1:1 to the spec.
 */

/** P-06c: 0 = words, 1 = characters, 2 = characters (no spaces). */
export type WordCountType = 0 | 1 | 2;

/** P-23: 0 = None, 1 = Language name, 2 = Custom. */
export type CodeBlockAccessory = 0 | 1 | 2;

/** P-45: 0 = `* `, 1 = `+ `, 2 = `- `. */
export type UnorderedListMarkerType = 0 | 1 | 2;

export interface MacDownPreferences {
  // §8.1 General
  /** P-01 (stored negated: checked "Update preview automatically" = false). */
  markdownManualRender: boolean;
  /** P-02 (stored negated). */
  supressesUntitledDocumentOnLaunch: boolean;
  /** P-03 */
  editorOnRight: boolean;
  /** P-04 */
  editorSyncScrolling: boolean;
  /** P-05 */
  editorShowWordCount: boolean;
  /** P-06 (Out of scope, kept for completeness). */
  createFileForLinkTarget: boolean;
  /** P-06c */
  editorWordCountType: WordCountType;

  // §8.2 Markdown
  extensionTables: boolean; // P-07
  extensionFencedCode: boolean; // P-08
  extensionAutolink: boolean; // P-09
  extensionStrikethough: boolean; // P-10 (sic)
  extensionUnderline: boolean; // P-11
  extensionHighlight: boolean; // P-12
  extensionFootnotes: boolean; // P-13
  extensionSuperscript: boolean; // P-14
  extensionQuote: boolean; // P-15
  extensionSmartyPants: boolean; // P-16
  extensionIntraEmphasis: boolean; // P-17

  // §8.3 Rendering
  htmlStyleName: string; // P-19c
  htmlSyntaxHighlighting: boolean; // P-20
  htmlHighlightingThemeName: string; // P-21 ('' = "(Default)")
  htmlLineNumbers: boolean; // P-22
  htmlCodeBlockAccessory: CodeBlockAccessory; // P-23
  htmlMermaid: boolean; // P-24
  htmlGraphviz: boolean; // P-25
  htmlMathJax: boolean; // P-18
  htmlMathJaxInlineDollar: boolean; // P-19
  htmlTaskList: boolean; // P-26
  htmlRendersTOC: boolean; // P-27
  htmlDetectFrontMatter: boolean; // P-28
  htmlHardWrap: boolean; // P-29b
  previewZoomRelativeToBaseFontSize: boolean; // P-29
  htmlDefaultDirectoryUrl: string; // P-29c
  htmlTemplateName: string; // P-29d

  // §8.4 Editor
  editorBaseFontInfo: { name: string; size: number }; // P-30
  editorStyleName: string; // P-31
  editorLineSpacing: number; // P-32 (0–100)
  editorHorizontalInset: number; // P-33 (0–35)
  editorVerticalInset: number; // P-34 (0–35)
  editorWidthLimited: boolean; // P-35
  editorMaximumWidth: number; // P-35 (300–10000)
  editorCompleteMatchingCharacters: boolean; // P-36
  editorConvertTabs: boolean; // P-37
  editorInsertPrefixInBlock: boolean; // P-38
  editorAutoIncrementNumberedLists: boolean; // P-39
  editorSmartHome: boolean; // P-40
  editorEnsuresNewlineAtEndOfFile: boolean; // P-41
  editorScrollsPastEnd: boolean; // P-42
  editorUnorderedListMarkerType: UnorderedListMarkerType; // P-45

  // §8.4b hidden editor preferences
  /** P-46 Edit > Spelling and Grammar > Check Spelling While Typing (F-96, F-164). */
  editorContinuousSpellCheckingEnabled: boolean;

  // Web-only (the original keeps these in NSToolbar's own defaults:
  // `TB Is Shown`, `NSToolbar Configuration …`).
  /** F-13 Show/Hide Toolbar. */
  toolbarVisible: boolean;
  /**
   * F-14 toolbar items in order, using the §4 identifiers plus
   * `flexible-space` and `space`. `null` (unset) = the default set (§4);
   * `[]` = an empty toolbar (D-12).
   */
  toolbarItemIdentifiers: string[] | null;
}

export const DEFAULT_PREFERENCES: Readonly<MacDownPreferences> = Object.freeze({
  markdownManualRender: false,
  supressesUntitledDocumentOnLaunch: false,
  editorOnRight: false,
  editorSyncScrolling: true,
  editorShowWordCount: false,
  createFileForLinkTarget: false,
  editorWordCountType: 0,

  extensionTables: true,
  extensionFencedCode: true,
  extensionAutolink: false,
  extensionStrikethough: false,
  extensionUnderline: false,
  extensionHighlight: false,
  extensionFootnotes: true,
  extensionSuperscript: false,
  extensionQuote: false,
  extensionSmartyPants: false,
  extensionIntraEmphasis: true,

  htmlStyleName: 'GitHub2',
  htmlSyntaxHighlighting: false,
  htmlHighlightingThemeName: '',
  htmlLineNumbers: false,
  htmlCodeBlockAccessory: 0,
  htmlMermaid: false,
  htmlGraphviz: false,
  htmlMathJax: false,
  htmlMathJaxInlineDollar: false,
  htmlTaskList: false,
  htmlRendersTOC: false,
  htmlDetectFrontMatter: false,
  htmlHardWrap: false,
  previewZoomRelativeToBaseFontSize: false,
  htmlDefaultDirectoryUrl: '~',
  htmlTemplateName: 'Default',

  editorBaseFontInfo: Object.freeze({ name: 'Menlo-Regular', size: 14 }),
  editorStyleName: 'Tomorrow+',
  editorLineSpacing: 3,
  editorHorizontalInset: 15,
  editorVerticalInset: 30,
  editorWidthLimited: false,
  editorMaximumWidth: 1000,
  editorCompleteMatchingCharacters: false,
  editorConvertTabs: false,
  editorInsertPrefixInBlock: true,
  editorAutoIncrementNumberedLists: true,
  editorSmartHome: false,
  editorEnsuresNewlineAtEndOfFile: false,
  editorScrollsPastEnd: false,
  editorUnorderedListMarkerType: 0,

  editorContinuousSpellCheckingEnabled: false,

  toolbarVisible: true,
  toolbarItemIdentifiers: null,
}) as MacDownPreferences;

/** Convenience: a full preferences object with some keys overridden. */
export function withDefaults(overrides: Partial<MacDownPreferences> = {}): MacDownPreferences {
  return { ...DEFAULT_PREFERENCES, ...overrides };
}
