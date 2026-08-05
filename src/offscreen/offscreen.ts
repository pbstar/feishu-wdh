// offscreen document：拥有 DOM 能力，负责执行 AI 请求与把 base64 转成 Blob URL。
// MV3 service worker 生命周期受限（空闲回收 + 硬上限），长任务必须在此执行；
// 但 chrome.downloads 在 offscreen 文档中不可用，下载动作由 service worker 完成。

import { runAiRequest } from '../ai/request';
import { reportProgress } from '../shared/messaging';
import type {
  AiRequest,
  AiResponse,
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

  if (msg.type === 'AI_REQUEST') {
    void handleAiRequest(msg, sendResponse);
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

// 并发 AI 请求共享一条心跳上报：避免多个请求各自启动定时器，上报相同语义的
// 「已等待 N 秒」文案导致弹出界面文案闪烁
let inFlightAi = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatStartedAt = 0;

function startAiHeartbeat(): void {
  inFlightAi++;
  if (inFlightAi > 1) return; // 已有心跳在跑，无需重复上报
  heartbeatStartedAt = Date.now();
  heartbeatTimer = setInterval(() => {
    const seconds = Math.round((Date.now() - heartbeatStartedAt) / 1000);
    reportProgress({ stage: 'ai', message: `AI 处理中，已等待 ${seconds} 秒…` });
  }, 15_000);
}

function stopAiHeartbeat(): void {
  inFlightAi--;
  if (inFlightAi > 0) return;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function handleAiRequest(
  msg: AiRequest,
  sendResponse: (response: AiResponse) => void,
): Promise<void> {
  // 长请求期间周期性上报已等待时长：给用户反馈，同时消息到达 SW 即重置其生命周期，
  // 避免 SW 被 MV3 生命周期回收导致导出静默中断。并发请求共享同一条心跳。
  startAiHeartbeat();
  try {
    const content = await runAiRequest(msg.markdown, msg.config, msg.purpose);
    sendResponse({ ok: true, content });
  } catch (err) {
    sendResponse({ ok: false, error: (err as Error).message });
  } finally {
    stopAiHeartbeat();
  }
}
