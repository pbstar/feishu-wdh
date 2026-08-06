// ── 配置 ──
/** 可并行执行的支线 AI 任务（导出额外附加文件）标识；新增支线任务在此追加 key */
export type ExtraKey = 'tasks';

/** AI 用途：文档优化为主输出（optimize），支线任务复用各自 key 作为用途 */
export type AiPurpose = 'optimize' | ExtraKey;

export interface AiConfig {
  /** 支线任务开关集合：默认关闭，导出时并行生成对应附加文件 */
  extras: Record<ExtraKey, boolean>;
  apiUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  extras: { tasks: false },
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
};

/** AI 配置是否已完整填写（导出与设置页保存均依赖此判断） */
export function isAiConfigured(cfg: AiConfig): boolean {
  return Boolean(cfg.apiUrl && cfg.apiKey && cfg.model);
}
