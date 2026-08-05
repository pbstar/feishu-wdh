import type { AiConfig, ExportStateResult } from './types';
import { DEFAULT_AI_CONFIG } from './types';

const AI_CONFIG_KEY = 'aiConfig';
const EXPORT_RESULT_KEY = 'lastExportResult';

export async function loadAiConfig(): Promise<AiConfig> {
  const result = await chrome.storage.local.get(AI_CONFIG_KEY);
  const stored = result[AI_CONFIG_KEY] as Partial<AiConfig> | undefined;
  return { ...DEFAULT_AI_CONFIG, ...stored };
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await chrome.storage.local.set({ [AI_CONFIG_KEY]: config });
}

/**
 * 持久化最近一次导出的最终结果。SW 空闲回收后内存状态即失，
 * 结果必须落 storage 才能在 popup 重开时恢复；传入 null 表示清除（新导出开始）。
 */
export async function saveExportResult(result: ExportStateResult | null): Promise<void> {
  await chrome.storage.local.set({ [EXPORT_RESULT_KEY]: result });
}

export async function loadExportResult(): Promise<ExportStateResult | null> {
  const stored = await chrome.storage.local.get(EXPORT_RESULT_KEY);
  return (stored[EXPORT_RESULT_KEY] as ExportStateResult | undefined) ?? null;
}
