import type { BlockNode, FetchedImage } from '../../shared/types';
import { BLOCK_ID_ATTR, CODE_SCROLLER_SELECTOR } from '../selectors';
import { extFromMime, fetchImageToBase64 } from '../fetchImage';
import { elementToBlock, extractCode, getBlockId, getCodeElement } from './blocks';
import { collectImageRefsInBlocks } from './walk';
import { mergeBlocks, mergeCodeLines } from './merge';

/**
 * 采集器：跨屏累积 block。飞书虚拟滚动会回收离开视口的 DOM，
 * 故每滚一屏调用一次 collectSlice，按块 ID 去重、按文档坐标排序。
 * 图片在采集当屏就地抓取为 base64：飞书正文图多为 blob: URL，一旦所在
 * block 被回收，blob 即被 revoke，滚完再抓必然失败。
 */
export class BlockCollector {
  // 块 ID → { blocks, order }。order 为该 block 在文档中的绝对垂直坐标，用于排序。
  private map = new Map<string, { blocks: BlockNode[]; order: number }>();
  private seq = 0; // 无坐标时的兜底自增序号
  private scrollEl: HTMLElement | null;
  // 图片抓取结果：src → 结果（含 localPath / base64 / mime，或失败标记）
  private images = new Map<string, FetchedImage>();
  private imgSeq = 0;
  // 已完成内部滚动展开的代码块 ID：长代码块开销较大，每块只展开一次
  private expandedCode = new Set<string>();

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

      const key = getBlockId(el)!;
      const existing = this.map.get(key);
      // 已采集过：合并多次采集结果。表格单元格、列表项会被虚拟化占位，长代码块
      // 按窗口分段渲染，单次采集都不完整，需按结构合并而非保留内容最多的一份
      if (existing) {
        const merged = mergeBlocks(existing.blocks, blocks);
        if (!merged) continue; // 本次采集没有带来新内容
        blocks = merged;
      }

      // 长代码块带内部滚动、只渲染可视行：首次采集时滚遍它，拼出完整代码
      if (blocks.length === 1 && blocks[0].type === 'code' && !this.expandedCode.has(key)) {
        const code = await captureFullCode(el, getCodeElement(el));
        blocks = [{ ...blocks[0], code }];
        this.expandedCode.add(key);
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

  /** 找到 root 下的顶层 block 元素：带块 ID 的即为块，包裹层继续下钻 */
  private findTopBlocks(root: HTMLElement): HTMLElement[] {
    const result: HTMLElement[] = [];
    const walk = (node: HTMLElement) => {
      for (const child of Array.from(node.children) as HTMLElement[]) {
        if (child.hasAttribute(BLOCK_ID_ATTR)) {
          result.push(child);
        } else if (child.querySelector(`[${BLOCK_ID_ATTR}]`)) {
          walk(child);
        }
      }
    };
    walk(root);
    return result;
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
    return [...this.map.values()]
      .sort((a, b) => a.order - b.order)
      .flatMap((entry) => entry.blocks);
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

/**
 * 滚遍代码块内部滚动条，按重叠行拼出完整代码（虚拟化只渲染可视行）。
 * 结束后恢复原来的滚动位置，不改变用户看到的状态。
 */
async function captureFullCode(blockEl: HTMLElement, codeEl: HTMLElement): Promise<string> {
  const scroller = blockEl.querySelector<HTMLElement>(CODE_SCROLLER_SELECTOR);
  // 代码正文在内部滚动区里，从滚动区取文本可避开语言标签、复制按钮等外框文本
  const contentEl = scroller ?? codeEl;
  let code = extractCode(contentEl);
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 4) return code;

  const restore = scroller.scrollTop;
  // 步长略小于可视高度，制造重叠，拼接时能对齐
  const step = Math.max(40, Math.floor(scroller.clientHeight * 0.8));
  try {
    for (let top = 0; top <= scroller.scrollHeight; top += step) {
      scroller.scrollTop = top;
      await sleep(80); // 等虚拟化重新渲染
      code = mergeCodeLines(code, extractCode(contentEl));
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) break;
    }
  } finally {
    scroller.scrollTop = restore;
  }
  return code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
