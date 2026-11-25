// offscreen document：拥有 DOM 能力，负责把 base64 转成 Blob URL（SW 无此 API）。
// chrome.downloads 在 offscreen 文档中不可用，下载动作由 service worker 完成。

import type {
  CreateBlobUrlRequest,
  CreateBlobUrlResponse,
  OffscreenRequest,
} from '../shared/offscreen';

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

chrome.runtime.onMessage.addListener((msg: OffscreenRequest, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.type === 'CREATE_BLOB_URL') {
    handleCreateBlobUrl(msg, sendResponse);
    return true; // 异步响应
  }
});

function handleCreateBlobUrl(
  msg: CreateBlobUrlRequest,
  sendResponse: (response: CreateBlobUrlResponse) => void,
): void {
  try {
    const blob = base64ToBlob(msg.base64, 'application/zip');
    const url = URL.createObjectURL(blob);
    // 下载启动后延迟撤销，确保浏览器已完整读取 blob
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    sendResponse({ ok: true, url });
  } catch (err) {
    sendResponse({ ok: false, error: (err as Error).message });
  }
}
