import type { AiConfig, AiPurpose } from '../shared/types';
import { ensureOffscreen, sendToOffscreen, type AiResponse } from '../shared/offscreen';

/**
 * 后台入口：把 AI 请求交给 offscreen 文档执行。
 * await sendMessage 的挂起消息通道会把 SW 保活，请求超时后 offscreen 返回明确错误，
 * 避免 SW 被回收导致 UI 永久卡住。
 */
export async function requestAiContent(
  markdown: string,
  config: AiConfig,
  purpose: AiPurpose,
): Promise<string> {
  await ensureOffscreen();
  const resp = await sendToOffscreen<AiResponse>({
    target: 'offscreen',
    type: 'AI_REQUEST',
    markdown,
    config,
    purpose,
  });
  if (!resp?.ok || !resp.content) {
    throw new Error(resp?.error || 'AI 处理未返回结果');
  }
  return resp.content;
}
