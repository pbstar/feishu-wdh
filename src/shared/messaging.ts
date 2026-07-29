import type { RuntimeMessage } from './types';

/** 发送运行时消息（popup ↔ background），返回响应 */
export async function sendRuntimeMessage<R = unknown>(
  msg: RuntimeMessage,
): Promise<R> {
  return chrome.runtime.sendMessage(msg);
}

/** 向指定 tab 的 content script 发消息 */
export async function sendTabMessage<R = unknown>(
  tabId: number,
  msg: RuntimeMessage,
): Promise<R> {
  return chrome.tabs.sendMessage(tabId, msg);
}

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
