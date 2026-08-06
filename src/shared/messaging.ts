import type { ExportDoneMsg, ExportProgress, ProgressMsg, RuntimeMessage } from './types';

/** 向 popup 发送消息；popup 可能已关闭，发送失败时忽略 */
function sendToPopup(msg: RuntimeMessage): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    /* popup 可能已关闭 */
  });
}

/** 向 popup 上报导出进度 */
export function reportProgress(progress: ExportProgress): void {
  const msg: ProgressMsg = { type: 'PROGRESS', progress };
  sendToPopup(msg);
}

/** 向 popup 发送导出最终结果 */
export function reportDone(result: Omit<ExportDoneMsg, 'type'>): void {
  const msg: ExportDoneMsg = { type: 'EXPORT_DONE', ...result };
  sendToPopup(msg);
}
