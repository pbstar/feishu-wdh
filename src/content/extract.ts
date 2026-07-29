import type {
  BlockNode,
  FetchedImage,
  InlineNode,
  InlineText,
  ListBlock,
  ListItem,
  TableBlock,
} from '../shared/types';
import { DOC_ROOT_SELECTORS, TITLE_SELECTORS, queryFirst } from './selectors';
import { extFromMime, fetchImageToBase64 } from './fetchImage';

// ── 标题提取 ──
function extractTitle(): string {
  const el = queryFirst<HTMLElement>(TITLE_SELECTORS);
  const fromDom = el?.textContent?.trim();
  if (fromDom) return fromDom;
  // 回退到页面标题，去掉飞书后缀
  const t = document.title.replace(/\s*[-|·]\s*(飞书云文档|飞书|Lark Docs|Lark).*$/i, '').trim();
  return t || '未命名文档';
}

// ── 行内内容提取 ──
// 语义已明确的行内标签，无需再查计算样式即可判定；其余元素才回退到 getComputedStyle。
const SEMANTIC_INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'del', 's', 'strike', 'code']);

function extractInline(node: Node, ctx: Partial<InlineText> = {}): InlineNode[] {
  const out: InlineNode[] = [];

  const pushText = (text: string, c: Partial<InlineText>) => {
    if (!text) return;
    out.push({ text, ...c });
  };

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      pushText(child.textContent ?? '', ctx);
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

function textContentTrim(el: Element): string {
  return (el.textContent ?? '').replace(/​/g, '').trim();
}

/** FNV-1a 32 位字符串哈希，用于块去重指纹（同长度+同哈希视为同内容） */
function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ── 列表提取 ──
function extractList(el: HTMLElement, ordered: boolean): ListBlock {
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
function extractTable(el: HTMLElement): TableBlock {
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
function extractCode(el: HTMLElement): string {
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
function elementToBlock(el: HTMLElement): BlockNode[] {
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

  if (tag === 'hr' || el.classList.contains('divider')) {
    return [{ type: 'divider' }];
  }

  // 独立图片块
  if (tag === 'img') {
    const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
    if (src) return [{ type: 'image', src, alt: el.getAttribute('alt') || undefined }];
    return [];
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
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'pre', 'table', 'hr', 'img']);

/** 飞书顶层 block 的 id 属性候选 */
const BLOCK_ID_ATTRS = ['data-block-id', 'data-record-id', 'data-page-id'];

function getBlockId(el: HTMLElement): string | null {
  for (const attr of BLOCK_ID_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) return v;
  }
  return null;
}

function isBlockElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  return (
    BLOCK_TAGS.has(tag) ||
    getBlockId(el) !== null ||
    el.classList.contains('code-block') ||
    el.classList.contains('divider')
  );
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
      const blocks = elementToBlock(el);
      if (!blocks.length) continue;

      const key = this.keyFor(el, blocks);
      if (this.map.has(key)) continue; // 已采集，跳过

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
        } else if (child.querySelector(':scope ' + [...BLOCK_TAGS].join(', :scope ')) ||
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

/** 收集一组 block 中的图片引用（就地回填用） */
function collectImageRefsInBlocks(
  blocks: BlockNode[],
): Array<{ src: string; setLocal: (p: string) => void }> {
  const refs: Array<{ src: string; setLocal: (p: string) => void }> = [];

  const visitInline = (nodes: InlineNode[]) => {
    for (const n of nodes) {
      if ('type' in n && n.type === 'image' && n.src) {
        refs.push({ src: n.src, setLocal: (p) => (n.localPath = p) });
      }
    }
  };

  const visit = (b: BlockNode) => {
    switch (b.type) {
      case 'image':
        if (b.src) refs.push({ src: b.src, setLocal: (p) => (b.localPath = p) });
        break;
      case 'heading':
      case 'paragraph':
        visitInline(b.children);
        break;
      case 'quote':
        b.children.forEach(visit);
        break;
      case 'list':
        visitList(b);
        break;
      case 'table':
        b.rows.forEach((row) => row.forEach(visitInline));
        break;
    }
  };

  const visitList = (list: ListBlock) => {
    for (const item of list.items) {
      visitInline(item.children);
      if (item.sublist) visitList(item.sublist);
    }
  };

  blocks.forEach(visit);
  return refs;
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

/** 定位文档正文根容器 */
export function getDocRoot(): HTMLElement {
  return queryFirst<HTMLElement>(DOC_ROOT_SELECTORS) || document.body;
}

/** 读取文档标题 */
export function getDocTitle(): string {
  return extractTitle();
}
