import type { AiConfig } from '../shared/types';
import { getPrompt, getTemperature } from './prompts';

/** AI 请求超时时间（毫秒）：超长文档处理较慢，留足余量，且不宜逼近 SW 生命周期上限（约 5 分钟） */
const REQUEST_TIMEOUT_MS = 120_000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/**
 * 调用兼容 OpenAI Chat Completions 的大模型，对 Markdown 全文按配置粒度处理。
 * 失败时抛出错误，由调用方决定是否降级为原文。
 */
export async function summarizeMarkdown(markdown: string, config: AiConfig): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: getPrompt(config.granularity) },
    { role: 'user', content: markdown },
  ];

  // 超时必须覆盖整个请求（含响应体读取）：服务端常先返回响应头、再边生成边写 body，
  // 若只保护 await fetch()，resp.json() 可能无限挂起，UI 会一直停在"正在调用 AI 处理内容"。
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
        temperature: getTemperature(config.granularity),
        stream: false,
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
