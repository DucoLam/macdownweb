import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { APP_BUILD, APP_VERSION } from '../document/draft';

/**
 * Document sheets (spec §2.2, §2.3, §2.8). The texts are the standard
 * NSDocument / AppKit sheets MacDown uses (it does not override them).
 */

export type SaveChoice = 'save' | 'dont-save' | 'cancel';

/**
 * F-25 / F-34: "Do you want to save the changes…" (NSDocument
 * `canCloseDocumentWithDelegate:`), shown before an edited document is
 * closed or replaced. Buttons as on macOS: Save (default), Cancel, Don't Save.
 */
export function SavePrompt({ name, onChoice }: { name: string; onChoice: (c: SaveChoice) => void }) {
  const save = useRef<HTMLButtonElement>(null);
  return (
    <Modal label="Save changes" testId="save-prompt" onClose={() => onChoice('cancel')} initialFocus={save} closeOnBackdrop={false} className="alert">
      <img className="alert-icon" src={`${import.meta.env.BASE_URL}icons/AppIcon.png`} alt="" width={48} height={48} />
      <div className="alert-body">
        <p className="alert-message" data-testid="save-prompt-message">
          Do you want to save the changes made to the document “{name}”?
        </p>
        <p className="alert-info">Your changes will be lost if you don’t save them.</p>
        <div className="dialog-buttons">
          <button type="button" data-testid="save-prompt-dont-save" className="left" onClick={() => onChoice('dont-save')}>
            Don’t Save
          </button>
          <button type="button" data-testid="save-prompt-cancel" onClick={() => onChoice('cancel')}>
            Cancel
          </button>
          <button type="button" data-testid="save-prompt-save" className="default" ref={save} onClick={() => onChoice('save')}>
            Save…
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** F-28 Revert to Saved confirmation (NSDocument `revertDocumentToSaved:`). */
export function RevertPrompt({ name, onChoice }: { name: string; onChoice: (revert: boolean) => void }) {
  const revert = useRef<HTMLButtonElement>(null);
  return (
    <Modal label="Revert" testId="revert-prompt" onClose={() => onChoice(false)} initialFocus={revert} closeOnBackdrop={false} className="alert">
      <img className="alert-icon" src={`${import.meta.env.BASE_URL}icons/AppIcon.png`} alt="" width={48} height={48} />
      <div className="alert-body">
        <p className="alert-message" data-testid="revert-prompt-message">
          Do you want to revert to the most recently saved version of the document “{name}”?
        </p>
        <p className="alert-info">Your current changes will be lost.</p>
        <div className="dialog-buttons">
          <button type="button" data-testid="revert-prompt-cancel" onClick={() => onChoice(false)}>
            Cancel
          </button>
          <button type="button" data-testid="revert-prompt-revert" className="default" ref={revert} onClick={() => onChoice(true)}>
            Revert
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** A one-button error sheet (for example a file that is not UTF-8 text). */
export function AlertDialog({ message, info, onClose }: { message: string; info?: string; onClose: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  return (
    <Modal label="Alert" testId="alert" onClose={onClose} initialFocus={ok} className="alert">
      <img className="alert-icon" src={`${import.meta.env.BASE_URL}icons/AppIcon.png`} alt="" width={48} height={48} />
      <div className="alert-body">
        <p className="alert-message" data-testid="alert-message">
          {message}
        </p>
        {info && <p className="alert-info">{info}</p>}
        <div className="dialog-buttons">
          <button type="button" data-testid="alert-ok" className="default" ref={ok} onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * F-35 Export HTML: the save panel's accessory view
 * (`MPExportPanelAccessoryViewController`) with "Include styles" and
 * "Include syntax highlighting". The file name and folder come from the
 * browser's save picker (or the download) after "Export…".
 */
export function ExportHtmlDialog({
  fileName,
  defaults,
  onExport,
  onCancel,
}: {
  fileName: string;
  defaults: { styles: boolean; highlighting: boolean };
  onExport: (o: { styles: boolean; highlighting: boolean }) => void;
  onCancel: () => void;
}) {
  const [styles, setStyles] = useState(defaults.styles);
  const [highlighting, setHighlighting] = useState(defaults.highlighting);
  const go = useRef<HTMLButtonElement>(null);
  return (
    <Modal label="Export HTML" testId="export-html-dialog" onClose={onCancel} initialFocus={go} closeOnBackdrop={false}>
      <h2 className="dialog-title">Export HTML</h2>
      <p className="dialog-file" data-testid="export-html-filename">
        {fileName}
      </p>
      <ul className="dialog-list">
        <li>
          <label>
            <input type="checkbox" data-testid="export-include-styles" checked={styles} onChange={(e) => setStyles(e.target.checked)} />
            Include styles
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              data-testid="export-include-highlighting"
              checked={highlighting}
              onChange={(e) => setHighlighting(e.target.checked)}
            />
            Include syntax highlighting
          </label>
        </li>
      </ul>
      <div className="dialog-buttons">
        <button type="button" data-testid="export-html-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" data-testid="export-html-save" className="default" ref={go} onClick={() => onExport({ styles, highlighting })}>
          Export…
        </button>
      </div>
    </Modal>
  );
}

/**
 * F-142 About MacDown (`orderFrontStandardAboutPanel:`): icon, name,
 * version (CFBundleShortVersionString and CFBundleVersion), copyright
 * (NSHumanReadableCopyright) and the licence.
 */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="About MacDown" testId="about" onClose={onClose} className="about">
      <img src={`${import.meta.env.BASE_URL}icons/AppIcon.png`} alt="MacDown" width={96} height={96} />
      <h2 className="about-name">MacDown</h2>
      <p data-testid="about-version">
        Version {APP_VERSION} ({APP_BUILD})
      </p>
      <p data-testid="about-copyright">Copyright © 2014–2016 Tzu-ping Chung.</p>
      <p className="about-licence">
        Released under the MIT License. Web rebuild of MacDown {APP_VERSION}.
      </p>
      <div className="dialog-buttons">
        <button type="button" data-testid="about-close" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/** U-12: P-02 unchecked, no document open. */
export function EmptyState({ onNew, onOpen }: { onNew: () => void; onOpen: () => void }) {
  return (
    <div className="empty-state" data-testid="empty-state">
      <img src={`${import.meta.env.BASE_URL}icons/AppIcon.png`} alt="" width={96} height={96} />
      <p>No document is open.</p>
      <div className="dialog-buttons">
        <button type="button" data-testid="empty-state-new" onClick={onNew}>
          New
        </button>
        <button type="button" data-testid="empty-state-open" onClick={onOpen}>
          Open…
        </button>
      </div>
    </div>
  );
}
