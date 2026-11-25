import type { ExportStateResult } from './types';

const EXPORT_RESULT_KEY = 'lastExportResult';

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
