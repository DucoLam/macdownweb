import { useEffect, useRef, useState, type ReactNode } from 'react';
import { preferences as defaultStore, usePreferences, type MacDownPreferences, type PreferencesStore } from '../prefs';
import { styleNames, PRISM_THEME_NAMES } from '../render';
import { themeNames } from '../editor/themes';
import { addUserStyle, addUserTheme, reloadUserAssets, useUserAssetsVersion } from '../prefs/userAssets';

/**
 * F-140 Preferences window (spec §8): MASPreferences toolbar window with the
 * panes General, Markdown, Editor, Rendering (the Terminal pane is Out).
 * Every control writes its preference immediately (F-141: live apply and
 * persistence through the store). Labels, groups, order, enablement and
 * ranges come from the source xibs (MP*PreferencesViewController.xib).
 * Out-of-scope controls (P-06, P-06b, the Reveal segments) are not offered
 * or are disabled.
 *
 * testids: `preferences`, `preferences-tab-<pane>`, `preferences-pane-<pane>`,
 * `preferences-close`, and `pref-<defaults key>` for every control.
 */

export type PaneId = 'general' | 'markdown' | 'editor' | 'rendering';

export const PANES: { id: PaneId; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'PreferencesGeneral' },
  { id: 'markdown', label: 'Markdown', icon: 'PreferencesMarkdown' },
  { id: 'editor', label: 'Editor', icon: 'PreferencesEditor' },
  { id: 'rendering', label: 'Rendering', icon: 'PreferencesRendering' },
];

const PANE_KEY = 'macdown.preferencesPane';

/** Font families offered by "Change…" (web: a family list and a size field, spec P-30). Stored as PostScript-style names. */
export const FONT_CHOICES: { name: string; label: string }[] = [
  { name: 'Menlo-Regular', label: 'Menlo' },
  { name: 'Monaco', label: 'Monaco' },
  { name: 'Courier-Regular', label: 'Courier' },
  { name: 'Courier New-Regular', label: 'Courier New' },
  { name: 'SF Mono-Regular', label: 'SF Mono' },
  { name: 'Andale Mono-Regular', label: 'Andale Mono' },
  { name: 'PT Mono-Regular', label: 'PT Mono' },
  { name: 'Consolas', label: 'Consolas' },
  { name: 'Source Code Pro-Regular', label: 'Source Code Pro' },
  { name: 'Helvetica', label: 'Helvetica' },
  { name: 'Times-Roman', label: 'Times' },
  { name: 'Georgia', label: 'Georgia' },
];

/** `%@ - %.1lf` with the font's display name (`Menlo-Regular` → `Menlo Regular - 14.0`). */
export function fontPreviewText(f: { name: string; size: number }): string {
  return `${f.name.replace(/-/g, ' ')} - ${f.size.toFixed(1)}`;
}

/** Numeric field rule: an emptied field becomes 0 when editing ends (P-32 to P-35); values are clamped to the stepper range. */
export function commitNumber(raw: string, min: number, max: number): number {
  const t = raw.trim();
  const n = t === '' ? 0 : Number(t);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function readPane(): PaneId {
  try {
    const p = localStorage.getItem(PANE_KEY) as PaneId | null;
    return PANES.some((x) => x.id === p) ? (p as PaneId) : 'general';
  } catch {
    return 'general';
  }
}

export function PreferencesWindow({ onClose, store = defaultStore }: { onClose: () => void; store?: PreferencesStore }) {
  const prefs = usePreferences(store);
  useUserAssetsVersion(); // re-list imported styles and themes
  const [pane, setPane] = useState<PaneId>(readPane);
  const ref = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<MacDownPreferences>) => store.set(patch);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-testid="preferences-tab-${pane}"]`)?.focus();
    // Focus the selected tab when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (p: PaneId) => {
    setPane(p);
    try {
      localStorage.setItem(PANE_KEY, p);
    } catch {
      /* ignore */
    }
  };
  const label = PANES.find((p) => p.id === pane)!.label;

  return (
    <div
      className="prefs-window"
      role="dialog"
      aria-label="Preferences"
      data-testid="preferences"
      data-pane={pane}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="prefs-titlebar">
        <button type="button" className="prefs-close" aria-label="Close Preferences" data-testid="preferences-close" onClick={onClose}>
          ×
        </button>
        <span className="prefs-title" data-testid="preferences-title">
          {label}
        </span>
      </div>
      <div className="prefs-tabs" role="tablist" aria-label="Preference panes">
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pane === p.id}
            className={`prefs-tab${pane === p.id ? ' selected' : ''}`}
            data-testid={`preferences-tab-${p.id}`}
            onClick={() => choose(p.id)}
          >
            <img src={`${import.meta.env.BASE_URL}icons/${p.icon}.png`} alt="" width={32} height={32} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <div className="prefs-pane" role="tabpanel" data-testid={`preferences-pane-${pane}`} aria-label={label}>
        {pane === 'general' && <GeneralPane prefs={prefs} set={set} />}
        {pane === 'markdown' && <MarkdownPane prefs={prefs} set={set} />}
        {pane === 'editor' && <EditorPane prefs={prefs} set={set} />}
        {pane === 'rendering' && <RenderingPane prefs={prefs} set={set} />}
      </div>
    </div>
  );
}

type PaneProps = { prefs: MacDownPreferences; set: (p: Partial<MacDownPreferences>) => void };

type BoolKey = { [K in keyof MacDownPreferences]: MacDownPreferences[K] extends boolean ? K : never }[keyof MacDownPreferences];

function Check({
  k,
  label,
  checked,
  onChange,
  disabled,
}: {
  k: BoolKey;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`prefs-check${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" data-testid={`pref-${k}`} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="prefs-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function Row({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="prefs-row">
      <label className="prefs-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="prefs-controls">{children}</div>
    </div>
  );
}

/** A numeric field with stepper (`<input type=number>`): live while valid, empty → 0 on blur. */
function NumberField({
  k,
  value,
  min,
  max,
  onChange,
  disabled,
  label,
}: {
  k: keyof MacDownPreferences;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      id={`pref-${k}`}
      className="prefs-number"
      aria-label={label}
      data-testid={`pref-${k}`}
      min={min}
      max={max}
      step={1}
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(Math.round(n));
      }}
      onBlur={(e) => {
        onChange(commitNumber(e.target.value, min, max));
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function GeneralPane({ prefs, set }: PaneProps) {
  const auto = !prefs.markdownManualRender;
  return (
    <>
      <Group title="Behavior">
        <Check k="supressesUntitledDocumentOnLaunch" label="Ensure open document on launch" checked={!prefs.supressesUntitledDocumentOnLaunch} onChange={(v) => set({ supressesUntitledDocumentOnLaunch: !v })} />
        <Check
          k="markdownManualRender"
          label="Update preview automatically as you type"
          checked={auto}
          // P-01: unchecking also turns off word count (MPGeneralPreferencesViewController.m:40-47).
          onChange={(v) => set(v ? { markdownManualRender: false } : { markdownManualRender: true, editorShowWordCount: false })}
        />
        <Check k="editorSyncScrolling" label="Sync preview scrollbar when editor scrolls" checked={prefs.editorSyncScrolling} onChange={(v) => set({ editorSyncScrolling: v })} />
        <Check k="editorOnRight" label="Put editor on the right" checked={prefs.editorOnRight} onChange={(v) => set({ editorOnRight: v })} />
        <Check k="editorShowWordCount" label="Show word count" checked={prefs.editorShowWordCount} disabled={!auto} onChange={(v) => set({ editorShowWordCount: v })} />
      </Group>
    </>
  );
}

function MarkdownPane({ prefs, set }: PaneProps) {
  const c = (k: BoolKey, label: string) => <Check k={k} label={label} checked={prefs[k]} onChange={(v) => set({ [k]: v } as Partial<MacDownPreferences>)} />;
  return (
    <div className="prefs-columns">
      <div>
        <Group title="Document formatting">{c('extensionSmartyPants', 'Smartypants')}</Group>
        <Group title="Block formatting">
          {c('extensionTables', 'Table')}
          {c('extensionFencedCode', 'Fenced code block')}
        </Group>
      </div>
      <Group title="Inline formatting">
        {c('extensionIntraEmphasis', 'Intra-word emphasis')}
        {c('extensionStrikethough', 'Strikethrough')}
        {c('extensionUnderline', 'Underline')}
        {c('extensionQuote', 'Quote')}
        {c('extensionHighlight', 'Highlight')}
        {c('extensionSuperscript', 'Superscript')}
        {c('extensionAutolink', 'Autolink')}
        {c('extensionFootnotes', 'Footnote')}
      </Group>
    </div>
  );
}

/**
 * Reveal (F-137, Out: no file browser) / Reload (F-138) segmented control,
 * plus Import… (web: adds a file to the user's styles or themes, F-161).
 */
function RevealReload({ testId, accept, onImport }: { testId: string; accept: string; onImport: (name: string, text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="prefs-segmented" role="group" aria-label="Reveal, reload or import">
      <button type="button" disabled title="Not available in the browser" data-testid={`${testId}-reveal`}>
        Reveal
      </button>
      <button type="button" data-testid={`${testId}-reload`} onClick={reloadUserAssets}>
        Reload
      </button>
      <button type="button" data-testid={`${testId}-import`} onClick={() => input.current?.click()}>
        Import…
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        data-testid={`${testId}-import-input`}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          onImport(f.name.replace(/\.(css|style)$/i, ''), await f.text());
        }}
      />
    </span>
  );
}

function EditorPane({ prefs, set }: PaneProps) {
  const [changing, setChanging] = useState(false);
  const font = prefs.editorBaseFontInfo;
  const fontChoices = FONT_CHOICES.some((f) => f.name === font.name) ? FONT_CHOICES : [{ name: font.name, label: font.name.replace(/-/g, ' ') }, ...FONT_CHOICES];
  const c = (k: BoolKey, label: string, disabled?: boolean) => (
    <Check k={k} label={label} checked={prefs[k]} disabled={disabled} onChange={(v) => set({ [k]: v } as Partial<MacDownPreferences>)} />
  );
  return (
    <>
      <Row label="Base font:">
        <span className="prefs-font-preview" data-testid="pref-editorBaseFontInfo-preview" style={{ fontFamily: `"${font.name.replace(/-(Regular|Roman)$/i, '')}", monospace` }}>
          {fontPreviewText(font)}
        </span>
        <button type="button" data-testid="pref-editorBaseFontInfo-change" aria-expanded={changing} onClick={() => setChanging((x) => !x)}>
          Change…
        </button>
      </Row>
      {changing && (
        <div className="prefs-font-panel" data-testid="pref-editorBaseFontInfo-panel">
          <select aria-label="Font family" data-testid="pref-editorBaseFontInfo-family" value={font.name} onChange={(e) => set({ editorBaseFontInfo: { name: e.target.value, size: font.size } })}>
            {fontChoices.map((f) => (
              <option key={f.name} value={f.name}>
                {f.label}
              </option>
            ))}
          </select>
          <SizeField size={font.size} onChange={(size) => set({ editorBaseFontInfo: { name: font.name, size } })} />
        </div>
      )}
      <Row label="Theme:" htmlFor="pref-editorStyleName">
        <select id="pref-editorStyleName" data-testid="pref-editorStyleName" value={prefs.editorStyleName} onChange={(e) => set({ editorStyleName: e.target.value })}>
          <option value="">{/* F-166: empty item = no theme */}</option>
          {themeNames().map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {/* Reload re-reads the list and re-applies the theme (§7.2). */}
        <RevealReload testId="pref-editorStyleName" accept=".style" onImport={addUserTheme} />
      </Row>
      <Row label="Line spacing:" htmlFor="pref-editorLineSpacing">
        <NumberField k="editorLineSpacing" label="Line spacing" value={prefs.editorLineSpacing} min={0} max={100} onChange={(v) => set({ editorLineSpacing: v })} />
      </Row>
      <Row label="Text insets:" htmlFor="pref-editorHorizontalInset">
        <NumberField k="editorHorizontalInset" label="Horizontal inset" value={prefs.editorHorizontalInset} min={0} max={35} onChange={(v) => set({ editorHorizontalInset: v })} />
        <span className="prefs-times">×</span>
        <NumberField k="editorVerticalInset" label="Vertical inset" value={prefs.editorVerticalInset} min={0} max={35} onChange={(v) => set({ editorVerticalInset: v })} />
      </Row>
      <div className="prefs-row">
        <label className="prefs-check prefs-label-wide">
          <input type="checkbox" data-testid="pref-editorWidthLimited" checked={prefs.editorWidthLimited} onChange={(e) => set({ editorWidthLimited: e.target.checked })} />
          Limit editor width to
        </label>
        <NumberField k="editorMaximumWidth" label="Maximum editor width" value={prefs.editorMaximumWidth} min={300} max={10000} disabled={!prefs.editorWidthLimited} onChange={(v) => set({ editorMaximumWidth: v })} />
      </div>
      <Row label="List marker:" htmlFor="pref-editorUnorderedListMarkerType">
        <select
          id="pref-editorUnorderedListMarkerType"
          data-testid="pref-editorUnorderedListMarkerType"
          value={prefs.editorUnorderedListMarkerType}
          onChange={(e) => set({ editorUnorderedListMarkerType: Number(e.target.value) as 0 | 1 | 2 })}
        >
          <option value={0}>* (Asterisk)</option>
          <option value={1}>+ (Plus sign)</option>
          <option value={2}>- (Minus sign)</option>
        </select>
      </Row>
      <Group title="Behavior">
        {c('editorConvertTabs', 'Insert spaces instead of tabs')}
        {c('editorCompleteMatchingCharacters', 'Auto-complete matching characters')}
        {c('editorInsertPrefixInBlock', 'Automatically insert line prefix for the current block')}
        {c('editorSmartHome', '⌘← jumps to first non-whitespace character in line')}
        {c('editorScrollsPastEnd', 'Scroll past end')}
        {c('editorEnsuresNewlineAtEndOfFile', 'Ensure newline at end of file on save')}
        {c('editorAutoIncrementNumberedLists', 'Auto-increment numbering in ordered lists', !prefs.editorInsertPrefixInBlock)}
      </Group>
    </>
  );
}

function SizeField({ size, onChange }: { size: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const ok = (n: number) => Number.isFinite(n) && n >= 4 && n <= 288;
  return (
    <input
      type="number"
      aria-label="Font size"
      data-testid="pref-editorBaseFontInfo-size"
      min={4}
      max={288}
      step={1}
      value={draft ?? String(size)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && ok(n)) onChange(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function RenderingPane({ prefs, set }: PaneProps) {
  const hl = prefs.htmlSyntaxHighlighting;
  const c = (k: BoolKey, label: string, disabled?: boolean) => (
    <Check k={k} label={label} checked={prefs[k]} disabled={disabled} onChange={(v) => set({ [k]: v } as Partial<MacDownPreferences>)} />
  );
  // A stored style that has no file still shows as selected text-less (MPHtmlPreferencesViewController loadStylesheets).
  const names = styleNames();
  const styleKnown = !prefs.htmlStyleName || names.includes(prefs.htmlStyleName);
  return (
    <>
      <Row label="CSS:" htmlFor="pref-htmlStyleName">
        <select id="pref-htmlStyleName" data-testid="pref-htmlStyleName" value={styleKnown ? prefs.htmlStyleName : ''} onChange={(e) => set({ htmlStyleName: e.target.value })}>
          <option value="">{/* F-166: empty item = no style */}</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {/* Reload re-lists the styles and re-renders open previews (F-138). */}
        <RevealReload testId="pref-htmlStyleName" accept=".css,text/css" onImport={addUserStyle} />
      </Row>
      <div className="prefs-indent">
        {c('htmlSyntaxHighlighting', 'Syntax highlighted code block')}
        <div className="prefs-sub">
          <Row label="Theme:" htmlFor="pref-htmlHighlightingThemeName">
            <select
              id="pref-htmlHighlightingThemeName"
              data-testid="pref-htmlHighlightingThemeName"
              disabled={!hl}
              value={PRISM_THEME_NAMES.includes(prefs.htmlHighlightingThemeName) ? prefs.htmlHighlightingThemeName : ''}
              onChange={(e) => set({ htmlHighlightingThemeName: e.target.value })}
            >
              {PRISM_THEME_NAMES.map((n) => (
                <option key={n || 'default'} value={n}>
                  {n || '(Default)'}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Accessory:" htmlFor="pref-htmlCodeBlockAccessory">
            {/* P-23 is always enabled (not bound to P-20). */}
            <select
              id="pref-htmlCodeBlockAccessory"
              data-testid="pref-htmlCodeBlockAccessory"
              value={prefs.htmlCodeBlockAccessory}
              onChange={(e) => set({ htmlCodeBlockAccessory: Number(e.target.value) as 0 | 1 | 2 })}
            >
              <option value={0}>None</option>
              <option value={1}>Language name</option>
              <option value={2}>Custom</option>
            </select>
          </Row>
          <div className="prefs-inline">
            {c('htmlLineNumbers', 'Show line numbers', !hl)}
            {c('htmlGraphviz', 'Graphviz', !hl)}
            {c('htmlMermaid', 'Mermaid', !hl)}
          </div>
        </div>
        {c('htmlMathJax', 'TeX-like math syntax')}
        <div className="prefs-sub">
          {c('htmlMathJaxInlineDollar', 'Use dollar sign ($) as inline delimiter', !prefs.htmlMathJax)}
          <p className="prefs-note">Math support requires Internet connection.</p>
        </div>
        {c('htmlTaskList', 'Task list syntax')}
        {c('htmlDetectFrontMatter', 'Detect Jekyll front-matter')}
        {c('htmlRendersTOC', 'Detect table of contents token')}
        {c('htmlHardWrap', 'Render newline literally')}
        {c('previewZoomRelativeToBaseFontSize', 'Scale preview based on editor font size')}
      </div>
      <Row label="Default path:" htmlFor="pref-htmlDefaultDirectoryUrl">
        {/* P-29c: stored and shown; the browser cannot resolve relative URLs against a folder (F-20). */}
        <input id="pref-htmlDefaultDirectoryUrl" data-testid="pref-htmlDefaultDirectoryUrl" type="text" readOnly value={prefs.htmlDefaultDirectoryUrl} />
      </Row>
    </>
  );
}
