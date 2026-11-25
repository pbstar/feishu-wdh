import type { InlineNode, InlineText } from '../../shared/types';
import { stripInvisible } from '../../shared/text';

// 语义已明确的行内标签，无需再查计算样式即可判定；其余元素才回退到 getComputedStyle。
const SEMANTIC_INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'del', 's', 'strike']);

// ── 行内内容提取 ──
export function extractInline(node: Node, ctx: Partial<InlineText> = {}): InlineNode[] {
  const out: InlineNode[] = [];

  const pushText = (text: string, c: Partial<InlineText>) => {
    if (!text) return;
    out.push({ text, ...c });
  };

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      pushText(stripInvisible(child.textContent ?? ''), ctx);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // 图片
    if (tag === 'img') {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
      if (src) out.push({ type: 'image', src, alt: el.getAttribute('alt') || undefined });
      return;
    }

    // 链接
    if (tag === 'a') {
      const href = el.getAttribute('href') || undefined;
      out.push(...extractInline(el, { ...ctx, link: href }));
      return;
    }

    // 硬换行（Shift+Enter）：保留为换行，表格单元格渲染时再转为 <br>
    if (tag === 'br') {
      pushText('\n', ctx);
      return;
    }

    // 块内多个 .ace-line 是软/硬换行的行容器，行与行之间补换行，避免文字粘连
    if (el.classList.contains('ace-line') && out.length) {
      pushText('\n', ctx);
    }

    // 样式标签：语义标签直接判定；否则查一次计算样式，识别飞书用 CSS 携带的样式。
    const nextCtx: Partial<InlineText> = { ...ctx };
    if (tag === 'b' || tag === 'strong') nextCtx.bold = true;
    if (tag === 'i' || tag === 'em') nextCtx.italic = true;
    if (tag === 'del' || tag === 's' || tag === 'strike') nextCtx.strike = true;

    const semantic = SEMANTIC_INLINE_TAGS.has(tag);
    if (!semantic) {
      const style = getComputedStyle(el);
      if (Number(style.fontWeight) >= 600) nextCtx.bold = true;
      if (style.fontStyle === 'italic') nextCtx.italic = true;
      if (style.textDecorationLine?.includes('line-through')) nextCtx.strike = true;
    }

    out.push(...extractInline(el, nextCtx));
  });

  return mergeInline(out);
}

/** 合并相邻同样式文本，去除空片段 */
function mergeInline(nodes: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];
  for (const n of nodes) {
    if ('type' in n) {
      merged.push(n);
      continue;
    }
    if (!n.text) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      !('type' in last) &&
      last.bold === n.bold &&
      last.italic === n.italic &&
      last.strike === n.strike &&
      last.link === n.link
    ) {
      last.text += n.text;
    } else {
      merged.push({ ...n });
    }
  }
  return merged;
}
