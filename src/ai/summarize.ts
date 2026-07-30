import type { AiConfig } from '../shared/types';
import { getPrompt, getTemperature } from './prompts';

/** AI 请求超时时间（毫秒）：超长文档处理较慢，留足余量 */
const REQUEST_TIMEOUT_MS = 60_000;

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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(config.apiUrl, {
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
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`AI 请求超时（超过 ${REQUEST_TIMEOUT_MS / 1000} 秒）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

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
}
