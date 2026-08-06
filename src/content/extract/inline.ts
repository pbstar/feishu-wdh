import type { InlineNode, InlineText } from '../../shared/types';

// 语义已明确的行内标签，无需再查计算样式即可判定；其余元素才回退到 getComputedStyle。
const SEMANTIC_INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'del', 's', 'strike', 'code']);

// ── 行内内容提取 ──
export function extractInline(node: Node, ctx: Partial<InlineText> = {}): InlineNode[] {
  const out: InlineNode[] = [];

  const pushText = (text: string, c: Partial<InlineText>) => {
    if (!text) return;
    out.push({ text, ...c });
  };

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      // 飞书 DOM 大量插入零宽空格（U+200B）做排版，需先剔除
      pushText((child.textContent ?? '').replace(/​/g, ''), ctx);
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

    // 样式标签：语义标签直接判定；否则查一次计算样式，识别飞书用 CSS 携带的样式。
    const nextCtx: Partial<InlineText> = { ...ctx };
    if (tag === 'b' || tag === 'strong') nextCtx.bold = true;
    if (tag === 'i' || tag === 'em') nextCtx.italic = true;
    if (tag === 'del' || tag === 's' || tag === 'strike') nextCtx.strike = true;
    if (tag === 'code') nextCtx.code = true;

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
export function mergeInline(nodes: InlineNode[]): InlineNode[] {
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
      last.code === n.code &&
      last.link === n.link
    ) {
      last.text += n.text;
    } else {
      merged.push({ ...n });
    }
  }
  return merged;
}

/** FNV-1a 32 位字符串哈希，用于块去重指纹（同长度+同哈希视为同内容） */
export function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
