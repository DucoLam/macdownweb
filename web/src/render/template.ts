/**
 * HTML page template, a port of `Templates/Default.handlebars` (spec §7.4,
 * F-139). The structure and blank lines match the original file.
 */

export interface TemplateInput {
  /** Document title without extension, or empty/undefined for untitled. */
  title?: string;
  styleTags: string[];
  body: string;
  scriptTags: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** `<style type="text/css">CONTENT</style>` (MPAsset embedded form). */
export function inlineStyleTag(css: string): string {
  return `<style type="text/css">\n${css}\n</style>`;
}

/** `<link rel="stylesheet" type="text/css" href="URL">` (MPAsset linked form). */
export function linkStyleTag(url: string): string {
  return `<link rel="stylesheet" type="text/css" href="${escapeHtml(url)}">`;
}

/** `<script type="text/javascript" src="URL"></script>` */
export function linkScriptTag(url: string): string {
  return `<script type="text/javascript" src="${escapeHtml(url)}"></script>`;
}

/** `<script type="text/javascript">CONTENT</script>` */
export function inlineScriptTag(js: string): string {
  return `<script type="text/javascript">\n${js}\n</script>`;
}

export function renderTemplate({ title, styleTags, body, scriptTags }: TemplateInput): string {
  const titleTag = title ? `<title>${escapeHtml(title)}</title>` : '';
  const each = (tags: string[]) => tags.map((t) => `\n${t}\n`).join('');
  return (
    '<!DOCTYPE html>\n<html>\n\n<head>\n\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">\n' +
    `${titleTag}\n\n` +
    each(styleTags) +
    '\n</head>\n\n<body>\n\n' +
    `${body}\n\n` +
    each(scriptTags) +
    '\n</body>\n\n</html>\n'
  );
}
