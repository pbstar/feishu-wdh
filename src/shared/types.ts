// 跨模块共享类型定义

// ── 文档中间结构:结构化节点树 ──
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

// ── 配置 ──
/** AI 用途：文档优化 / 前端研发任务总结 */
export type AiPurpose = 'optimize' | 'tasks';

export interface AiConfig {
  /** 文档优化：导出时额外生成 AI 优化版 Markdown */
  enabled: boolean;
  /** 前端研发任务总结：导出时额外生成任务清单 */
  tasksEnabled: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  tasksEnabled: false,
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
};

// ── 消息协议 ──
export type ExportStage =
  | 'idle'
  | 'scrolling'
  | 'extracting'
  | 'ai'
  | 'packaging'
  | 'done'
  | 'error';

export interface ExportProgress {
  stage: ExportStage;
  message?: string;
}

/** popup → background：请求导出当前 tab */
export interface StartExportMsg {
  type: 'START_EXPORT';
}

/** background → content：执行提取（滚动+抽取+抓图） */
export interface ExtractMsg {
  type: 'EXTRACT';
}

/** content → background：提取结果（失败时带 error，不含 doc/images） */
export interface ExtractResultMsg {
  type: 'EXTRACT_RESULT';
  doc?: DocumentModel;
  images?: FetchedImage[];
  error?: string;
}

/** content/background → popup：进度上报 */
export interface ProgressMsg {
  type: 'PROGRESS';
  progress: ExportProgress;
}

/** 导出最终结果 → popup */
export interface ExportDoneMsg {
  type: 'EXPORT_DONE';
  ok: boolean;
  filename?: string;
  imagesFailed?: number;
  error?: string;
}

export type RuntimeMessage =
  | StartExportMsg
  | ExtractMsg
  | ExtractResultMsg
  | ProgressMsg
  | ExportDoneMsg;
