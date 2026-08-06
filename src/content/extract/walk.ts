import type { BlockNode, CodeBlock, ImageBlock, InlineNode, ListBlock } from '../../shared/types';

/** 通用 block 树访问者：叶子节点动作由消费者提供，遍历结构只写一份 */
interface BlockVisitor {
  onInline?(nodes: InlineNode[]): void;
  onImage?(block: ImageBlock): void;
  onCode?(block: CodeBlock): void;
}

function walkList(list: ListBlock, v: BlockVisitor): void {
  for (const item of list.items) {
    v.onInline?.(item.children);
    if (item.sublist) walkList(item.sublist, v);
  }
}

/** 递归遍历一组 block，按类型分发到访问者对应回调 */
export function walkBlocks(blocks: BlockNode[], v: BlockVisitor): void {
  for (const b of blocks) {
    switch (b.type) {
      case 'heading':
      case 'paragraph':
        v.onInline?.(b.children);
        break;
      case 'quote':
        walkBlocks(b.children, v);
        break;
      case 'list':
        walkList(b, v);
        break;
      case 'table':
        b.rows.forEach((row) => row.forEach((cell) => v.onInline?.(cell)));
        break;
      case 'code':
        v.onCode?.(b);
        break;
      case 'image':
        v.onImage?.(b);
        break;
    }
  }
}

/** 收集一组 block 中的图片引用（就地回填用） */
export function collectImageRefsInBlocks(
  blocks: BlockNode[],
): Array<{ src: string; setLocal: (p: string) => void }> {
  const refs: Array<{ src: string; setLocal: (p: string) => void }> = [];
  const collectInline = (nodes: InlineNode[]) => {
    for (const n of nodes) {
      if ('type' in n && n.type === 'image' && n.src) {
        refs.push({ src: n.src, setLocal: (p) => (n.localPath = p) });
      }
    }
  };
  walkBlocks(blocks, {
    onInline: collectInline,
    onImage: (b) => {
      if (b.src) refs.push({ src: b.src, setLocal: (p) => (b.localPath = p) });
    },
  });
  return refs;
}

/** 块内容量：文本总字符数 + 图片计数。用于判断同一 block 的新版本是否更完整。 */
export function contentWeight(blocks: BlockNode[]): number {
  let weight = 0;
  const inlineWeight = (nodes: InlineNode[]) => {
    for (const n of nodes) {
      if ('type' in n) weight += 1; // 图片
      else weight += n.text.length;
    }
  };
  walkBlocks(blocks, {
    onInline: inlineWeight,
    onImage: () => {
      weight += 1;
    },
    onCode: (b) => {
      weight += b.code.length;
    },
  });
  return weight;
}
