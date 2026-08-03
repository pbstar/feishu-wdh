import type { ExportDoneMsg, ExportProgress, ProgressMsg, RuntimeMessage } from './types';

/** 注册运行时消息监听；返回反注册函数 */
export function onRuntimeMessage(
  handler: (
    msg: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean | void,
): () => void {
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

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
