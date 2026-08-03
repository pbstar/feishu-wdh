// offscreen document 的统一入口与消息协议。
// MV3 里 service worker 生命周期受限（空闲回收 + 硬上限），长任务（AI 请求、Blob URL
// 生成）必须放到 offscreen 文档中执行；SW 侧 await sendMessage 的挂起通道会把 SW 保活。

import type { AiConfig } from './types';

export const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

// ── offscreen 消息协议（独立于 popup/background/content 的 RuntimeMessage）──

export interface OffscreenBase {
  target: 'offscreen';
}

/** SW → offscreen：把 ZIP base64 转成 Blob URL（SW 无 URL.createObjectURL） */
export interface CreateBlobUrlRequest extends OffscreenBase {
  type: 'CREATE_BLOB_URL';
  base64: string;
}

export interface CreateBlobUrlResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

/** SW → offscreen：执行 AI 请求（长耗时，必须在 offscreen 中跑） */
export interface SummarizeRequest extends OffscreenBase {
  type: 'SUMMARIZE';
  markdown: string;
  config: AiConfig;
}

export interface SummarizeResponse {
  ok: boolean;
  content?: string;
  error?: string;
}

export type OffscreenRequest = CreateBlobUrlRequest | SummarizeRequest;

/** 确保 offscreen document 已创建（幂等） */
export async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: '执行 AI 请求并把导出的 ZIP 转为 Blob URL 以触发下载',
  });
}

/** 向 offscreen 发消息并等待响应；无监听方响应时 resolve 为 undefined */
export async function sendToOffscreen<Res>(msg: OffscreenRequest): Promise<Res> {
  return (await chrome.runtime.sendMessage(msg)) as Res;
}
