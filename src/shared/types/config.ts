// ── 配置 ──
export interface AiConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
};

/** AI 配置是否已完整填写（导出与设置页保存均依赖此判断） */
export function isAiConfigured(cfg: AiConfig): boolean {
  return Boolean(cfg.apiUrl && cfg.apiKey && cfg.model);
}
