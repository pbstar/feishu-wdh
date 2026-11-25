import type { BlockNode, FetchedImage } from '../../shared/types';
import { stripInvisible } from '../../shared/text';
import { extFromMime, fetchImageToBase64 } from '../fetchImage';
import { hashString } from './inline';
import { BLOCK_CHILD_SELECTOR, BLOCK_ID_ATTRS, elementToBlock, getBlockId, isBlockElement } from './blocks';
import { collectImageRefsInBlocks, contentWeight } from './walk';

function textContentTrim(el: Element): string {
  return stripInvisible(el.textContent ?? '').trim();
}

/**
 * 采集器：跨屏累积 block。飞书虚拟滚动会回收离开视口的 DOM，
 * 故每滚一屏调用一次 collectSlice，按 block 唯一键去重、按文档坐标排序。
 * 图片在采集当屏就地抓取为 base64：飞书正文图多为 blob: URL，一旦所在
 * block 被回收，blob 即被 revoke，滚完再抓必然失败。
 */
export class BlockCollector {
  // key → { block, order }。order 为该 block 在文档中的绝对垂直坐标，用于排序。
  private map = new Map<string, { blocks: BlockNode[]; order: number }>();
  private seq = 0; // 无坐标时的兜底自增序号
  private scrollEl: HTMLElement | null;
  // 图片抓取结果：src → 结果（含 localPath / base64 / mime，或失败标记）
  private images = new Map<string, FetchedImage>();
  private imgSeq = 0;

  /** @param scrollContainer 滚动容器；null 表示窗口滚动 */
  constructor(scrollContainer: HTMLElement | null) {
    this.scrollEl = scrollContainer;
  }

  /** 采集当前视口内的 block，并就地抓取其中的图片 */
  async collectSlice(root: HTMLElement): Promise<void> {
    const tops = this.findTopBlocks(root);
    for (const el of tops) {
      let blocks = elementToBlock(el);
      if (!blocks.length) continue;

      const key = this.keyFor(el, blocks);
      const existing = this.map.get(key);
      // 已采集过：合并多次采集结果。表格/块骨架首次扫到可能残缺，长代码块还会被
      // 虚拟化按窗口分段渲染、单次只含一部分行，故需拼接而非保留内容最多的一份。
      if (existing) {
        const merged = mergeBlocks(existing.blocks, blocks);
        if (!merged) continue; // 本次采集没有带来新内容
        blocks = merged;
      }

      // 就地抓取该 block 内的图片（此刻图片仍存活于 DOM，blob 未被 revoke）
      await this.captureImagesIn(blocks);

      const order = this.orderFor(el);
      this.map.set(key, { blocks, order });
    }
  }

  /** 遍历一组 block 中的图片节点，就地抓取并回填 localPath */
  private async captureImagesIn(blocks: BlockNode[]): Promise<void> {
    const imgs = collectImageRefsInBlocks(blocks);
    for (const ref of imgs) {
      if (!ref.src) continue;
      let result = this.images.get(ref.src);
      if (!result) {
        const captured = await fetchImageToBase64(ref.src);
        if (captured) {
          const localPath = `images/img-${++this.imgSeq}.${extFromMime(captured.mime)}`;
          result = { src: ref.src, localPath, base64: captured.base64, mime: captured.mime };
        } else {
          result = { src: ref.src, localPath: '', failed: true };
        }
        this.images.set(ref.src, result);
      }
      if (!result.failed) ref.setLocal(result.localPath);
    }
  }

  /** 找到 root 下的顶层 block 元素列表（跨嵌套容器下钻到真正的 block 层） */
  private findTopBlocks(root: HTMLElement): HTMLElement[] {
    const result: HTMLElement[] = [];
    const walk = (node: HTMLElement) => {
      for (const child of Array.from(node.children) as HTMLElement[]) {
        if (isBlockElement(child)) {
          result.push(child);
        } else if (child.querySelector(BLOCK_CHILD_SELECTOR) ||
                   BLOCK_ID_ATTRS.some((a) => child.querySelector(`:scope [${a}]`))) {
          walk(child); // 内部还有 block，继续下钻
        } else {
          const text = textContentTrim(child);
          if (text || child.querySelector('img')) result.push(child);
        }
      }
    };
    walk(root);
    return result;
  }

  /** block 唯一键：优先 data-block-id，否则用完整内容哈希 */
  private keyFor(el: HTMLElement, blocks: BlockNode[]): string {
    const id = getBlockId(el);
    if (id) return `id:${id}`;
    // 无 id：对整块序列化内容做哈希（含长度），同内容视为同块。
    // 用完整内容而非截断前缀，避免长块前缀相同被误判重复。
    const json = JSON.stringify(blocks);
    return `fp:${json.length}:${hashString(json)}`;
  }

  /** block 在文档中的绝对垂直位置，用于跨屏排序 */
  private orderFor(el: HTMLElement): number {
    const rect = el.getBoundingClientRect();
    // 视口坐标 + 当前滚动量 = 文档绝对坐标；滚动过程中对同一元素保持稳定。
    // 飞书为容器内滚动，window.scrollY 恒为 0，须用滚动容器的 scrollTop。
    const scrollTop = this.scrollEl
      ? this.scrollEl.scrollTop
      : window.scrollY || document.documentElement.scrollTop || 0;
    const containerTop = this.scrollEl ? this.scrollEl.getBoundingClientRect().top : 0;
    const abs = rect.top - containerTop + scrollTop;
    if (Number.isFinite(abs)) return abs;
    return 1e9 + this.seq++; // 拿不到坐标的兜底：追加到末尾
  }

  /** 合并所有已采集 block，按文档坐标排序输出 */
  finalize(): BlockNode[] {
    const entries = [...this.map.values()].sort((a, b) => a.order - b.order);
    const out: BlockNode[] = [];
    for (const e of entries) out.push(...e.blocks);
    return dedupeAdjacent(out);
  }

  /** 已就地抓取的图片列表（含成功与失败） */
  getImages(): FetchedImage[] {
    return [...this.images.values()];
  }

  /** 当前累计的图片抓取统计 */
  imageStats(): { total: number; failed: number } {
    const all = [...this.images.values()];
    return { total: all.length, failed: all.filter((i) => i.failed).length };
  }
}

/** 去除相邻完全重复的块 */
function dedupeAdjacent(blocks: BlockNode[]): BlockNode[] {
  const out: BlockNode[] = [];
  let lastKey = '';
  for (const b of blocks) {
    const key = JSON.stringify(b);
    if (key === lastKey) continue;
    out.push(b);
    lastKey = key;
  }
  return out;
}

/**
 * 合并同一 block 的多次采集结果。返回 null 表示本次采集没有带来新内容。
 * 长代码块在虚拟滚动下按窗口分段渲染，单次只有一部分行，需按重叠行拼接；
 * 其余块保留内容更多的一份即可。
 */
function mergeBlocks(existing: BlockNode[], next: BlockNode[]): BlockNode[] | null {
  const [a] = existing;
  const [b] = next;
  if (existing.length === 1 && next.length === 1 && a.type === 'code' && b.type === 'code') {
    const code = mergeCodeLines(a.code, b.code);
    if (code === a.code) return null;
    return [{ ...a, language: a.language || b.language, code }];
  }
  return contentWeight(next) > contentWeight(existing) ? next : null;
}

/** 拼接同一代码块的两次分段采集 */
function mergeCodeLines(a: string, b: string): string {
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
