import type { BlockNode, InlineNode, ListBlock, ListItem, TableBlock } from '../../shared/types';
import { extractInline } from './inline';

// ── 列表提取 ──
export function extractList(el: HTMLElement, ordered: boolean): ListBlock {
  const items: ListItem[] = [];
  el.querySelectorAll(':scope > li').forEach((li) => {
    const liEl = li as HTMLElement;
    // 分离子列表
    const sublistEl = liEl.querySelector(':scope > ul, :scope > ol') as HTMLElement | null;
    const clone = liEl.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(':scope > ul, :scope > ol').forEach((n) => n.remove());

    // 任务列表勾选框
    let checked: boolean | undefined;
    const checkbox = liEl.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (checkbox) checked = checkbox.checked;

    items.push({
      children: extractInline(clone),
      checked,
      sublist: sublistEl
        ? extractList(sublistEl, sublistEl.tagName.toLowerCase() === 'ol')
        : undefined,
    });
  });
  return { type: 'list', ordered, items };
}

// ── 表格提取 ──
export function extractTable(el: HTMLElement): TableBlock {
  const rows: InlineNode[][][] = [];
  el.querySelectorAll('tr').forEach((tr) => {
    const cells: InlineNode[][] = [];
    tr.querySelectorAll('td, th').forEach((cell) => {
      cells.push(extractInline(cell));
    });
    if (cells.length) rows.push(cells);
  });
  return { type: 'table', rows };
}

// ── 代码块提取 ──
export function extractCode(el: HTMLElement): string {
  // 优先按行元素拼接（飞书代码块常按行拆 div），否则用 textContent
  const lineEls = el.querySelectorAll('.code-line, [data-line], pre > div');
  if (lineEls.length > 1) {
    return Array.from(lineEls)
      .map((l) => l.textContent ?? '')
      .join('\n')
      .replace(/​/g, '');
  }
  return (el.textContent ?? '').replace(/​/g, '').replace(/\n+$/, '');
}

function detectLanguage(el: HTMLElement): string | undefined {
  const cls = el.className || '';
  const m = cls.match(/language-([\w+-]+)/i);
  if (m) return m[1];
  const dataLang = el.getAttribute('data-language') || el.getAttribute('data-lang');
  return dataLang || undefined;
}

// ── 单个元素 → 块节点 ──
export function elementToBlock(el: HTMLElement): BlockNode[] {
  const tag = el.tagName.toLowerCase();

  // 标题 h1-h6
  const hMatch = tag.match(/^h([1-6])$/);
  if (hMatch) {
    const level = Number(hMatch[1]) as 1 | 2 | 3 | 4 | 5 | 6;
    return [{ type: 'heading', level, children: extractInline(el) }];
  }

  if (tag === 'ul') return [extractList(el, false)];
  if (tag === 'ol') return [extractList(el, true)];

  if (tag === 'blockquote') {
    return [{ type: 'quote', children: extractChildBlocks(el) }];
  }

  if (tag === 'pre' || el.classList.contains('code-block')) {
    const codeEl = (el.querySelector('code') as HTMLElement) || el;
    return [{ type: 'code', language: detectLanguage(el) || detectLanguage(codeEl), code: extractCode(codeEl) }];
  }

  if (tag === 'table') return [extractTable(el)];

  // 飞书表格块：表头行（sticky-row-wrapper）与正文行被拆进两个 <table>，
  // 若走下方通用下钻会被识别成两张表、并重复表头。这里整体收敛为一张逻辑表：
  // querySelectorAll('tr') 按文档顺序先取 sticky 表头行、再取正文行，恰好还原完整表格。
  if (el.matches('.docx-table-block, [data-block-type="table"]') && el.querySelector('table')) {
    return [extractTable(el)];
  }

  if (tag === 'hr' || el.classList.contains('divider')) {
    return [{ type: 'divider' }];
  }

  // 独立图片块
  if (tag === 'img') {
    const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
    if (src) return [{ type: 'image', src, alt: el.getAttribute('alt') || undefined }];
    return [];
  }

  // 通用容器：若内部包裹了语义块（如带 data-block-id 的 div 里嵌 table/列表/代码块），
  // 下钻到真正的块，避免被当作段落整体 extractInline 展平（表格会因此丢失结构）。
  if (el.querySelector(BLOCK_TAG_SELECTOR)) {
    return extractChildBlocks(el);
  }

  // 段落 / 通用块：提取行内内容。若含独立图片则拆成图片块。
  const inline = extractInline(el);
  return inlineToBlocks(inline);
}

/** 将行内内容拆分：独立图片提升为 ImageBlock，其余归为段落 */
function inlineToBlocks(inline: InlineNode[]): BlockNode[] {
  const blocks: BlockNode[] = [];
  let buffer: InlineNode[] = [];
  const flush = () => {
    const hasText = buffer.some((n) => !('type' in n) && n.text.trim());
    if (hasText) blocks.push({ type: 'paragraph', children: buffer });
    buffer = [];
  };
  for (const n of inline) {
    if ('type' in n && n.type === 'image') {
      flush();
      blocks.push({ type: 'image', src: n.src, alt: n.alt });
    } else {
      buffer.push(n);
    }
  }
  flush();
  return blocks;
}

/** 提取容器块（如 blockquote）内部的子块，单屏内递归，不跨屏 */
function extractChildBlocks(root: HTMLElement): BlockNode[] {
  const blocks: BlockNode[] = [];
  const children = Array.from(root.children) as HTMLElement[];
  if (!children.length) {
    // 无子元素容器，直接当作段落
    return inlineToBlocks(extractInline(root));
  }
  for (const child of children) {
    blocks.push(...elementToBlock(child));
  }
  return blocks;
}

// ── 顶层块识别 ──
// 飞书正文由一系列 block 容器组成。优先识别语义标签，
// 否则把每个直接子容器当作一个段落级块处理。
// 唯一数据源：其余选择器/集合均从此派生，避免新增块标签时忘同步。
const BLOCK_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'pre', 'table', 'hr', 'img'] as const;
const BLOCK_TAG_SET = new Set<string>(BLOCK_TAGS);

// 探测通用容器内是否嵌有语义块的选择器（排除 img：含行内图片的段落仍按段落处理）。
const BLOCK_TAG_SELECTOR = BLOCK_TAGS.filter((t) => t !== 'img').join(', ');

// 直接子级是否含语义块的选择器（findTopBlocks 下钻判断用）
export const BLOCK_CHILD_SELECTOR = BLOCK_TAGS.map((t) => `:scope ${t}`).join(', ');

/** 飞书顶层 block 的 id 属性候选 */
export const BLOCK_ID_ATTRS = ['data-block-id', 'data-record-id', 'data-page-id'];

export function getBlockId(el: HTMLElement): string | null {
  for (const attr of BLOCK_ID_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) return v;
  }
  return null;
}

export function isBlockElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  return (
    BLOCK_TAG_SET.has(tag) ||
    getBlockId(el) !== null ||
    el.classList.contains('code-block') ||
    el.classList.contains('divider')
  );
}
