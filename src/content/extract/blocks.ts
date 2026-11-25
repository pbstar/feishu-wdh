// 飞书 docx 块提取。
// 正文由 .block[data-block-type] 系列块组成，块类型直接决定语义；
// 不再兼容旧版文档的 h1/ul/table 等标签结构。

import type { BlockNode, InlineNode, ListBlock, ListItem, TableBlock } from '../../shared/types';
import { stripInvisible } from '../../shared/text';
import { BLOCK_ID_ATTR, CODE_SCROLLER_SELECTOR } from '../selectors';
import { extractInline } from './inline';

// ── 表格 ──
// 表头行（sticky-row-wrapper）与正文行被拆进两个 <table>，
// querySelectorAll('tr') 按文档顺序先取 sticky 表头行、再取正文行，恰好还原完整表格。
function extractTable(el: HTMLElement): TableBlock {
  const rows: InlineNode[][][] = [];
  el.querySelectorAll('tr').forEach((tr) => {
    const cells: InlineNode[][] = [];
    tr.querySelectorAll('td, th').forEach((cell) => cells.push(extractCellInline(cell)));
    if (cells.length) rows.push(cells);
  });
  return { type: 'table', rows };
}

/**
 * 单元格内容：单元格里可能有多段文本和列表块（列表项是块级子元素），
 * 逐个块提取并压平成带换行的行内内容，列表项补上项目符号。
 */
function extractCellInline(cell: Element): InlineNode[] {
  const blockEls = cell.querySelectorAll<HTMLElement>(':scope > .render-unit-wrapper > .block');
  if (!blockEls.length) return extractInline(cell);

  const out: InlineNode[] = [];
  const pushLine = (nodes: InlineNode[]) => {
    if (!nodes.length) return;
    if (out.length) out.push({ text: '\n' });
    out.push(...nodes);
  };

  blockEls.forEach((blockEl) => {
    elementToBlock(blockEl).forEach((block) => {
      switch (block.type) {
        case 'heading':
        case 'paragraph':
          pushLine(block.children);
          break;
        case 'list':
          pushLine(listToInline(block, 0));
          break;
        case 'image':
          pushLine([{ type: 'image', src: block.src, alt: block.alt }]);
          break;
      }
    });
  });
  return out;
}

/** 列表压平成单元格内联内容：项目符号 + 缩进嵌套 */
function listToInline(list: ListBlock, depth: number): InlineNode[] {
  const out: InlineNode[] = [];
  list.items.forEach((item, i) => {
    if (out.length) out.push({ text: '\n' });
    const marker = list.ordered ? `${i + 1}. ` : '• ';
    out.push({ text: '  '.repeat(depth) + marker }, ...item.children);
    if (item.sublist) {
      out.push({ text: '\n' }, ...listToInline(item.sublist, depth + 1));
    }
  });
  return out;
}

// ── 代码块 ──
/** 代码正文在内部滚动区里，取它可避开语言标签、复制按钮等外框文本 */
export function getCodeElement(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>(CODE_SCROLLER_SELECTOR) ?? el;
}

/** 代码正文由 Slate 按行渲染成 .ace-line；没有行元素时用渲染文本兜底 */
export function extractCode(el: HTMLElement): string {
  const lines = el.querySelectorAll<HTMLElement>('.ace-line');
  if (!lines.length) return stripInvisible(el.innerText).replace(/\n+$/, '');
  return Array.from(lines)
    .map((line) => stripInvisible(line.textContent ?? ''))
    .join('\n')
    .replace(/\n+$/, '');
}

/** 代码语言：头部语言按钮的文本（如 JSON、纯文本），纯文本不标围栏语言 */
function detectLanguage(el: HTMLElement): string | undefined {
  const label = stripInvisible(el.querySelector<HTMLElement>('.code-block-header-btn')?.textContent ?? '').trim();
  if (!label) return undefined;
  const key = label.toLowerCase();
  return key === '纯文本' || key === 'plain text' ? 'text' : key;
}

// ── 列表块 ──
// 结构：block[data-block-type=ordered|bullet|todo] > .list-wrapper > .list
// （按钮序号 + .list-content），嵌套项在 .list-children 里递归
const LIST_BLOCK_TYPES = new Set(['ordered', 'bullet', 'todo']);

function extractDocxList(el: HTMLElement, ordered: boolean): ListBlock {
  return { type: 'list', ordered, items: [docxListItem(el)] };
}

/** 解析一个列表项块（含其嵌套子项） */
function docxListItem(el: HTMLElement): ListItem {
  const content = el.querySelector<HTMLElement>('.list-content');
  const children = docxChildLists(el);
  return {
    key: getBlockId(el) ?? undefined,
    children: content ? extractInline(content) : extractInline(el),
    sublist: children.length
      ? { ...children[0], items: children.flatMap((list) => list.items) }
      : undefined,
  };
}

/** .list-children 下的子列表块；虚拟化未渲染的项此处没有元素，跨屏采集时再合并 */
function docxChildLists(el: HTMLElement): ListBlock[] {
  const box = el.querySelector<HTMLElement>(':scope > .list-wrapper > .list > .list-children');
  if (!box) return [];
  const lists: ListBlock[] = [];
  box
    .querySelectorAll<HTMLElement>(':scope > .render-unit-wrapper > .block[data-block-type]')
    .forEach((blockEl) => {
      const type = blockEl.getAttribute('data-block-type') ?? '';
      if (LIST_BLOCK_TYPES.has(type)) lists.push(extractDocxList(blockEl, type === 'ordered'));
    });
  return lists;
}

// ── 单个元素 → 块节点 ──
export function elementToBlock(el: HTMLElement): BlockNode[] {
  const type = el.getAttribute('data-block-type') ?? '';

  const heading = /^heading([1-9])$/.exec(type);
  if (heading) {
    // 文档标题已占用 H1，章节标题整体降一级，保持单一 H1 层级
    const level = Math.min(6, Number(heading[1]) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    return [{ type: 'heading', level, children: extractInline(el) }];
  }

  if (LIST_BLOCK_TYPES.has(type)) return [extractDocxList(el, type === 'ordered')];

  if (type === 'code') {
    const codeEl = getCodeElement(el);
    return [{ type: 'code', language: detectLanguage(el), code: extractCode(codeEl) }];
  }

  if (type === 'table') return [extractTable(el)];
  if (type === 'divider') return [{ type: 'divider' }];
  if (type === 'quote_container') {
    return [{ type: 'quote', children: extractChildBlocks(el) }];
  }

  // 其他容器块（如高亮块）内部还有子块时下钻，避免被压平成一个段落
  if (el.querySelector(`[${BLOCK_ID_ATTR}]`)) return extractChildBlocks(el);

  // 文本块、图片块等：提取行内内容，独立图片拆成图片块
  return inlineToBlocks(extractInline(el));
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

/** 提取容器块内部的子块，单屏内递归，不跨屏 */
function extractChildBlocks(root: HTMLElement): BlockNode[] {
  const children = Array.from(root.children) as HTMLElement[];
  if (!children.length) return inlineToBlocks(extractInline(root));
  return children.flatMap((child) => elementToBlock(child));
}

/** 块 ID：正文块唯一标识，跨屏采集去重与列表项合并都依赖它 */
export function getBlockId(el: HTMLElement): string | null {
  return el.getAttribute(BLOCK_ID_ATTR);
}
