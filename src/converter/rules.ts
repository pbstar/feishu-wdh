import type { InlineNode, InlineText } from '../shared/types';

/** 转义 Markdown 特殊字符（用于普通文本，不用于代码） */
function escapeText(text: string): string {
  return text.replace(/([\\`])/g, '\\$1');
}

/** 行内图片：优先本地相对路径，降级为原始 URL */
function renderInlineImage(src: string, alt: string | undefined, localPath?: string): string {
  const path = localPath || src;
  return `![${alt ? escapeText(alt) : ''}](${path})`;
}

/** 渲染一段行内内容为 Markdown */
export function renderInline(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      if ('type' in n && n.type === 'image') {
        return renderInlineImage(n.src, n.alt, n.localPath);
      }
      const t = n as InlineText;
      let s = t.text;
      if (!s) return '';

      if (t.code) {
        // 代码内容不转义，用反引号包裹；内容含反引号时用双反引号
        const fence = s.includes('`') ? '`` ' : '`';
        const close = s.includes('`') ? ' ``' : '`';
        return `${fence}${s}${close}`;
      }

      s = escapeText(s);
      // 保留首尾空格：加粗/斜体标记必须紧贴非空白字符，故把空格移到标记外
      const lead = s.match(/^\s*/)?.[0] ?? '';
      const trail = s.match(/\s*$/)?.[0] ?? '';
      let core = s.slice(lead.length, s.length - trail.length);

      if (t.strike) core = `~~${core}~~`;
      if (t.bold && t.italic) core = `***${core}***`;
      else if (t.bold) core = `**${core}**`;
      else if (t.italic) core = `*${core}*`;

      let result = `${lead}${core}${trail}`;
      if (t.link) result = `[${result.trim()}](${t.link})`;
      return result;
    })
    .join('');
}

/** 表格单元格内容：换行替换为 <br>，转义竖线 */
export function renderTableCell(nodes: InlineNode[]): string {
  return renderInline(nodes).replace(/\n/g, '<br>').replace(/\|/g, '\\|');
}

/** 代码块围栏：内容含 ``` 时用更长围栏 */
export function fenceFor(code: string): string {
  let len = 3;
  const matches = code.match(/`{3,}/g);
  if (matches) {
    for (const m of matches) len = Math.max(len, m.length + 1);
  }
  return '`'.repeat(len);
}
