// 跨屏采集的块合并：飞书虚拟滚动只渲染可视区域，区块的多次采集各有残缺，
// 需按结构合并出完整版本。纯数据操作，不涉及 DOM。

import type { BlockNode, ListBlock, ListItem, TableBlock } from '../../shared/types';
import { contentWeight, inlineWeight } from './walk';

/**
 * 合并同一 block 的多次采集结果。返回 null 表示本次采集没有带来新内容。
 * 长代码块按重叠行拼接；表格逐格、列表逐项合并；其余块保留内容更多的一份。
 */
export function mergeBlocks(existing: BlockNode[], next: BlockNode[]): BlockNode[] | null {
  if (existing.length === 1 && next.length === 1) {
    const [a] = existing;
    const [b] = next;
    if (a.type === 'code' && b.type === 'code') {
      const code = mergeCodeLines(a.code, b.code);
      if (code === a.code) return null;
      return [{ ...a, language: a.language || b.language, code }];
    }
    if (a.type === 'table' && b.type === 'table') {
      const table = mergeTables(a, b);
      if (table && JSON.stringify(table) !== JSON.stringify(a)) return [table];
    }
    if (a.type === 'list' && b.type === 'list') {
      const list = mergeLists(a, b);
      if (JSON.stringify(list) !== JSON.stringify(a)) return [list];
    }
  }
  return contentWeight(next) > contentWeight(existing) ? next : null;
}

/** 同形状的表格逐格取内容更完整的一份；形状不一致时返回 null，由调用方按内容量取舍 */
function mergeTables(a: TableBlock, b: TableBlock): TableBlock | null {
  if (a.rows.length !== b.rows.length) return null;
  if (a.rows.some((row, i) => row.length !== b.rows[i].length)) return null;
  const rows = a.rows.map((row, i) =>
    row.map((cell, j) => (inlineWeight(b.rows[i][j]) > inlineWeight(cell) ? b.rows[i][j] : cell)),
  );
  return { type: 'table', rows };
}

/** 按列表项 key（块 ID）合并多次采集，补全虚拟化未渲染的项；无 key 时退回按内容判重 */
function mergeLists(a: ListBlock, b: ListBlock): ListBlock {
  const items: ListItem[] = [];
  const byKey = new Map<string, ListItem>();
  const take = (item: ListItem) => {
    const key = item.key ?? JSON.stringify(item.children);
    const current = byKey.get(key);
    if (!current) {
      const copy = { ...item };
      byKey.set(key, copy);
      items.push(copy);
      return;
    }
    if (inlineWeight(item.children) > inlineWeight(current.children)) {
      current.children = item.children;
    }
    if (item.sublist) {
      current.sublist = current.sublist ? mergeLists(current.sublist, item.sublist) : item.sublist;
    }
  };
  a.items.forEach(take);
  b.items.forEach(take);
  return { ...a, items };
}

/** 拼接同一代码块的两次分段采集 */
export function mergeCodeLines(a: string, b: string): string {
  if (a === b) return a;
  if (b.includes(a)) return b; // b 覆盖 a 的全部内容
  if (a.includes(b)) return a;
  const A = a.split('\n');
  const B = b.split('\n');
  // 向下滚动：a 的尾部与 b 的头部重叠；反向则说明先采到了下半段
  const down = overlapLen(A, B);
  if (down) return [...A, ...B.slice(down)].join('\n');
  const up = overlapLen(B, A);
  if (up) return [...B, ...A.slice(up)].join('\n');
  // 两段无重叠（虚拟化窗口跳过头尾）：只能保留内容更多的一份
  return a.length >= b.length ? a : b;
}

/**
 * x 的尾部与 y 的头部最长重叠行数；找不到可信重叠时返回 0。
 * 要求至少 3 行且包含实质内容行，避免 JSON 里连续 `}`、`],` 等短行造成误拼。
 */
function overlapLen(x: string[], y: string[]): number {
  const max = Math.min(x.length, y.length);
  for (let len = max; len >= 3; len--) {
    const tail = x.slice(x.length - len);
    if (!tail.every((line, i) => line === y[i])) continue;
    if (!tail.some((line) => line.trim().length >= 8)) continue;
    return len;
  }
  return 0;
}
