import type { RuntimeMessage } from './types';

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
