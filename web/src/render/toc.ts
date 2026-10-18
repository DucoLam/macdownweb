/**
 * F-123 table of contents (P-27), spec §6.1 step 4 and §6.6.
 * Ports Hoedown's TOC renderer with MacDown's `hoedown_patch_render_toc_header`
 * [vendor/macdown/MacDown/Code/Extension/hoedown_html_patch.c:147-185] and
 * `toc_finalize` [hoedown:src/html.c:600-615].
 */
import type { MarkdownIt, Token } from 'markdown-it';

export interface TocHeader {
  level: number;
  /** Header content rendered with the TOC renderer's inline callbacks. */
  html: string;
}

/**
 * The TOC renderer only has codespan, emphasis, underline, highlight, quote,
 * link (text only), triple emphasis, strikethrough, superscript and normal
 * text callbacks. Everything else (images, raw HTML, math, footnote refs)
 * is not recognised by Hoedown and stays as escaped source text.
 */
function tocInline(md: MarkdownIt, children: Token[], env: Record<string, unknown>): string {
  const kept: Token[] = [];
  for (const t of children) {
    switch (t.type) {
      case 'link_open':
      case 'link_close':
        break;
      case 'image': {
        const alt = t.children ? t.children.map((c) => c.content).join('') : t.content;
        kept.push(textToken(t, `![${alt}](${t.attrGet('src') ?? ''})`));
        break;
      }
      case 'html_inline':
      case 'macdown_math':
        kept.push(textToken(t, t.type === 'macdown_math' ? t.markup : t.content));
        break;
      case 'footnote_ref':
        kept.push(textToken(t, `[^${(t.meta as { label?: string }).label ?? ''}]`));
        break;
      default:
        kept.push(t);
    }
  }
  return md.renderer.renderInline(kept, md.options, env);
}

function textToken(like: Token, content: string): Token {
  const T = like.constructor as new (type: string, tag: string, nesting: number) => Token;
  const t = new T('text', '', 0);
  t.content = content;
  return t;
}

export function collectHeaders(md: MarkdownIt, tokens: Token[], env: Record<string, unknown>): TocHeader[] {
  const out: TocHeader[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    out.push({ level: Number(tokens[i].tag.slice(1)), html: tocInline(md, inline.children ?? [], env) });
  }
  return out;
}

/** The TOC HTML exactly as the patched Hoedown TOC renderer writes it. */
export function renderToc(headers: TocHeader[]): string {
  let ob = '';
  let current = 0;
  let offset = 0;
  let count = 0;
  for (const h of headers) {
    let level = h.level;
    // The level of the first header becomes level 1.
    if (current === 0) offset = level - 1;
    level -= offset;
    if (level > current) {
      while (level > current) {
        ob += current === 0 ? '<ul class="toc">\n<li>\n' : '<ul>\n<li>\n';
        current++;
      }
    } else if (level < current) {
      ob += '</li>\n';
      while (level < current) {
        ob += '</ul>\n</li>\n';
        current--;
      }
      ob += '<li>\n';
    } else {
      ob += '</li>\n<li>\n';
    }
    ob += `<a href="#toc_${count++}">${h.html}</a>\n`;
  }
  while (current > 0) {
    ob += '</li>\n</ul>\n';
    current--;
  }
  return ob;
}

/** `<p.*?>\s*\[TOC\]\s*</p>`, case-insensitive; every match is replaced. */
const TOC_PARAGRAPH = /<p.*?>\s*\[TOC\]\s*<\/p>/gi;

export function insertToc(html: string, toc: string): string {
  return html.replace(TOC_PARAGRAPH, () => toc);
}
