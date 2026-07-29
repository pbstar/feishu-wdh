import type { AiConfig } from '../shared/types';
import { getPrompt } from './prompts';

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

  const resp = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.3,
      stream: false,
    }),
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
}
