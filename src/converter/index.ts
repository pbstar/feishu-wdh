import type { BlockNode, DocumentModel, ListBlock } from '../shared/types';
import { fenceFor, renderInline, renderTableCell } from './rules';

const INDENT = '  '; // 列表嵌套缩进（2 空格）

function renderList(list: ListBlock, depth: number): string {
  const lines: string[] = [];
  list.items.forEach((item, i) => {
    const pad = INDENT.repeat(depth);
    const marker = list.ordered ? `${i + 1}.` : '-';
    const content = renderInline(item.children).trim().replace(/\n/g, '<br>');
    lines.push(`${pad}${marker} ${content}`);
    if (item.sublist) {
      lines.push(renderList(item.sublist, depth + 1));
    }
  });
  return lines.join('\n');
}

function renderBlock(block: BlockNode): string {
  switch (block.type) {
    case 'heading':
      // 标题内不能有换行，硬换行合并为空格
      return `${'#'.repeat(block.level)} ${renderInline(block.children).replace(/\n+/g, ' ').trim()}`;

    case 'paragraph':
      // 段内换行按硬换行输出，避免 GFM 软换行把两行合并成一行
      return renderInline(block.children).trim().replace(/\n/g, '<br>');

    case 'list':
      return renderList(block, 0);

    case 'quote': {
      const inner = block.children.map(renderBlock).join('\n\n');
      return inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    }

    case 'code': {
      const fence = fenceFor(block.code);
      return `${fence}${block.language ?? ''}\n${block.code}\n${fence}`;
    }

    case 'table': {
      if (!block.rows.length) return '';
      const [header, ...body] = block.rows;
      const cols = block.rows.reduce((max, r) => Math.max(max, r.length), 0);
      const pad = (row: typeof header) => {
        const cells = row.map(renderTableCell);
        while (cells.length < cols) cells.push('');
        return `| ${cells.join(' | ')} |`;
      };
      const lines = [pad(header), `| ${Array(cols).fill('---').join(' | ')} |`];
      body.forEach((r) => lines.push(pad(r)));
      return lines.join('\n');
    }

    case 'image': {
      const path = block.localPath || block.src;
      return `![${block.alt ?? ''}](${path})`;
    }

    case 'divider':
      return '---';
  }
}

/**
 * 相邻同类型列表块合并：飞书把每个列表项存为独立 block，
 * 不合并的话每项都会各自从 1 开始编号
 */
function mergeAdjacentLists(blocks: BlockNode[]): BlockNode[] {
  const out: BlockNode[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.type === 'list' && last?.type === 'list' && last.ordered === block.ordered) {
      last.items.push(...block.items);
    } else {
      out.push(block);
    }
  }
  return out;
}

/** 节点树 → GFM Markdown 全文 */
export function toMarkdown(doc: DocumentModel): string {
  const parts: string[] = [`# ${doc.title}`];
  for (const block of mergeAdjacentLists(doc.blocks)) {
    const rendered = renderBlock(block);
    if (rendered.trim()) parts.push(rendered);
  }
  return parts.join('\n\n') + '\n';
}
