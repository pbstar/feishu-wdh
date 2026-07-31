import type { ExportProgress, ProgressMsg, RuntimeMessage } from './types';

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

/** 向 popup 上报导出进度；popup 可能已关闭，发送失败时忽略 */
export function reportProgress(progress: ExportProgress): void {
  const msg: ProgressMsg = { type: 'PROGRESS', progress };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* popup 可能已关闭 */
  });
}
