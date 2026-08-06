// 文档中间结构:结构化节点树
// content 提取产出、converter 消费的中间表示。与飞书 DOM、Markdown 都解耦。

/** 行内内容片段 */
export interface InlineText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
}

export type InlineNode = InlineText | InlineImage;

/** 行内图片 */
export interface InlineImage {
  type: 'image';
  /** 图片来源 URL（原始，用于抓取） */
  src: string;
  alt?: string;
  /** 抓取后填充：ZIP 内相对路径，如 images/img-1.png */
  localPath?: string;
}

export type BlockNode =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | CodeBlock
  | TableBlock
  | ImageBlock
  | DividerBlock;

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
}

export interface ParagraphBlock {
  type: 'paragraph';
  children: InlineNode[];
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: ListItem[];
}

export interface ListItem {
  children: InlineNode[];
  /** 嵌套子列表 */
  sublist?: ListBlock;
  /** 任务列表勾选状态；非任务项为 undefined */
  checked?: boolean;
}

export interface QuoteBlock {
  type: 'quote';
  /** 引用可包含多个块 */
  children: BlockNode[];
}

export interface CodeBlock {
  type: 'code';
  language?: string;
  code: string;
}

export interface TableBlock {
  type: 'table';
  /** 每个单元格是行内内容；首行视为表头 */
  rows: InlineNode[][][];
}

export interface ImageBlock {
  type: 'image';
  src: string;
  alt?: string;
  localPath?: string;
}

export interface DividerBlock {
  type: 'divider';
}

/** 提取产出的完整文档 */
export interface DocumentModel {
  title: string;
  blocks: BlockNode[];
}

// ── 图片抓取 ──
export interface FetchedImage {
  src: string;
  /** ZIP 内相对路径 */
  localPath: string;
  /** base64（不含 data: 前缀） */
  base64?: string;
  mime?: string;
  /** 抓取失败时为 true，导出降级为保留原链接 */
  failed?: boolean;
}
