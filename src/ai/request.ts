import type { AiConfig, AiPurpose } from '../shared/types';
import { getPrompt } from './prompts';
import { ensureOffscreen, sendToOffscreen, type AiResponse } from '../shared/offscreen';

/** AI 请求超时时间（毫秒）：长文档处理较慢，给足 5 分钟。
 *  请求在 offscreen 中执行，SW 等待期间由心跳消息与挂起通道保活，不受其生命周期上限约束 */
const REQUEST_TIMEOUT_MS = 300_000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/**
 * 调用兼容 OpenAI Chat Completions 的大模型，对 Markdown 按用途处理（文档优化 / 任务总结）。
 * 由 offscreen 文档执行：SW 生命周期受限，裸 fetch 挂起时会被回收，导致 UI 永久卡在
 * "正在调用 AI 处理内容"；offscreen 是真实页面，定时器可靠触发、无硬上限。
 * 失败时抛出错误：优化为必开主输出，调用方应让导出整体失败；任务清单为可选，由调用方决定是否跳过。
 */
export async function runAiRequest(
  markdown: string,
  config: AiConfig,
  purpose: AiPurpose,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: getPrompt(purpose) },
    { role: 'user', content: markdown },
  ];

  // 超时必须覆盖整个请求（含响应体读取）：服务端常先返回响应头、再边生成边写 body，
  // 若只保护 await fetch()，resp.json() 可能无限挂起。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        temperature: 0.5,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try {
        const errJson = (await resp.json()) as ChatResponse;
        if (errJson.error?.message) detail = errJson.error.message;
      } catch {
        /* 忽略解析失败 */
      }
      throw new Error(`AI 请求失败：${detail}`);
    }

    const data = (await resp.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI 返回内容为空');
    return content.trim();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`AI 请求超时（超过 ${REQUEST_TIMEOUT_MS / 1000} 秒）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
