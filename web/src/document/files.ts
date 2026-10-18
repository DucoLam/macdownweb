/**
 * Browser file access for spec §2.2 / §2.3 (F-22, F-26, F-27, F-28, F-35):
 * the File System Access API where the browser has it (Chromium), with an
 * `<input type="file">` and a download as the fallback (spec §11).
 * Text is read and written as UTF-8 (spec §1, `NSUTF8StringEncoding`).
 */

/** Minimal File System Access API types (not in lib.dom). */
export interface FsWritable {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface FsFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsWritable>;
  queryPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}
export interface FsPickerType {
  description: string;
  accept: Record<string, string[]>;
}
interface FsWindow {
  showOpenFilePicker?: (o?: { types?: FsPickerType[]; excludeAcceptAllOption?: boolean; multiple?: boolean }) => Promise<FsFileHandle[]>;
  showSaveFilePicker?: (o?: { suggestedName?: string; types?: FsPickerType[]; excludeAcceptAllOption?: boolean }) => Promise<FsFileHandle>;
}

const fsWindow = () => (typeof window === 'undefined' ? {} : (window as unknown as FsWindow));

/** Document types of Info.plist (`md`, `markdown`, plain text) [spec §1]. */
export const MARKDOWN_PICKER_TYPES: FsPickerType[] = [
  { description: 'Markdown document', accept: { 'text/markdown': ['.md', '.markdown'] } },
  { description: 'Plain text', accept: { 'text/plain': ['.txt', '.text'] } },
];
export const HTML_PICKER_TYPES: FsPickerType[] = [{ description: 'HTML', accept: { 'text/html': ['.html'] } }];

/** `accept` of the fallback open input. */
export const OPEN_ACCEPT = '.md,.markdown,.mdown,.mkd,.mkdn,.txt,.text,text/markdown,text/x-markdown,text/plain';

export const canOpenWithPicker = () => typeof fsWindow().showOpenFilePicker === 'function';
export const canSaveWithPicker = () => typeof fsWindow().showSaveFilePicker === 'function';

/** The user dismissed a picker. */
export function isAbort(e: unknown): boolean {
  return e instanceof DOMException ? e.name === 'AbortError' : (e as { name?: string })?.name === 'AbortError';
}

/** Strict UTF-8 decoding; null when the data is not UTF-8 (`initWithData:encoding:` returns nil). */
export function decodeUtf8(data: ArrayBuffer | Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(data);
  } catch {
    return null;
  }
}

export async function readFileText(file: Blob): Promise<string | null> {
  return decodeUtf8(await file.arrayBuffer());
}

export interface OpenedFile {
  name: string;
  /** null when the file is not UTF-8 text. */
  text: string | null;
  handle: FsFileHandle | null;
}

/** F-22 with the File System Access API. Resolves null when cancelled. */
export async function pickFileToOpen(): Promise<OpenedFile | null> {
  const picker = fsWindow().showOpenFilePicker;
  if (!picker) throw new Error('File System Access API not available');
  try {
    const [handle] = await picker({ types: MARKDOWN_PICKER_TYPES, excludeAcceptAllOption: false, multiple: false });
    if (!handle) return null;
    const file = await handle.getFile();
    return { name: handle.name || file.name, text: await readFileText(file), handle };
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** Save panel (F-26, F-27, F-35). Resolves null when cancelled. */
export async function pickSaveHandle(suggestedName: string, types: FsPickerType[]): Promise<FsFileHandle | null> {
  const picker = fsWindow().showSaveFilePicker;
  if (!picker) throw new Error('File System Access API not available');
  try {
    return await picker({ suggestedName, types, excludeAcceptAllOption: false });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** Writes UTF-8 text through a handle (asks for write permission when needed). */
export async function writeToHandle(handle: FsFileHandle, text: string): Promise<void> {
  if (handle.queryPermission && handle.requestPermission) {
    const state = await handle.queryPermission({ mode: 'readwrite' });
    if (state !== 'granted' && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      throw new DOMException('Write permission denied', 'NotAllowedError');
    }
  }
  const w = await handle.createWritable();
  await w.write(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  await w.close();
}

/** Fallback save: downloads `text` as `name` (the browser's download folder). */
export function downloadText(name: string, text: string, type = 'text/markdown;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Adds `ext` when the name has no extension of that type (save panel `allowedFileTypes`). */
export function withExtension(name: string, ext: string, also: string[] = []): string {
  const lower = name.toLowerCase();
  if ([ext, ...also].some((e) => lower.endsWith(`.${e}`))) return name;
  return `${name}.${ext}`;
}

/**
 * O-03: a file name the save pickers accept: characters that file systems
 * or the browser refuse become "-", and a name that would be hidden or empty
 * gets "Untitled" in front (".html" -> "Untitled.html").
 */
export function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-').trim();
  return !s || s.startsWith('.') ? `Untitled${s}` : s;
}
