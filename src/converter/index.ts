import type { BlockNode, DocumentModel, ListBlock } from '../shared/types';
import { fenceFor, renderInline, renderTableCell } from './rules';

const INDENT = '  '; // 列表嵌套缩进（2 空格）

function renderList(list: ListBlock, depth: number): string {
  const lines: string[] = [];
  list.items.forEach((item, i) => {
    const pad = INDENT.repeat(depth);
    let marker: string;
    if (item.checked !== undefined) {
      marker = `- [${item.checked ? 'x' : ' '}]`;
    } else {
      marker = list.ordered ? `${i + 1}.` : '-';
    }
    const content = renderInline(item.children).trim();
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
      return `${'#'.repeat(block.level)} ${renderInline(block.children).trim()}`;

    case 'paragraph':
      return renderInline(block.children).trim();

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
      const cols = Math.max(...block.rows.map((r) => r.length));
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

/** 节点树 → GFM Markdown 全文 */
export function toMarkdown(doc: DocumentModel): string {
  const parts: string[] = [`# ${doc.title}`];
  for (const block of doc.blocks) {
    const rendered = renderBlock(block);
    if (rendered.trim()) parts.push(rendered);
  }
  return parts.join('\n\n') + '\n';
}
