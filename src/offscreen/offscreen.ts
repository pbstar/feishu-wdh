// offscreen document：拥有 DOM 能力，负责执行 AI 请求与把 base64 转成 Blob URL。
// MV3 service worker 生命周期受限（空闲回收 + 硬上限），长任务必须在此执行；
// 但 chrome.downloads 在 offscreen 文档中不可用，下载动作由 service worker 完成。

import { runSummarizeRequest } from '../ai/summarize';
import type {
  CreateBlobUrlRequest,
  CreateBlobUrlResponse,
  OffscreenRequest,
  SummarizeRequest,
  SummarizeResponse,
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

  if (msg.type === 'SUMMARIZE') {
    void handleSummarize(msg, sendResponse);
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

async function handleSummarize(
  msg: SummarizeRequest,
  sendResponse: (response: SummarizeResponse) => void,
): Promise<void> {
  try {
    const content = await runSummarizeRequest(msg.markdown, msg.config);
    sendResponse({ ok: true, content });
  } catch (err) {
    sendResponse({ ok: false, error: (err as Error).message });
  }
}
