import type { AiConfig } from './types';
import { DEFAULT_AI_CONFIG } from './types';

const AI_CONFIG_KEY = 'aiConfig';

export async function loadAiConfig(): Promise<AiConfig> {
  const result = await chrome.storage.local.get(AI_CONFIG_KEY);
  const stored = result[AI_CONFIG_KEY] as Partial<AiConfig> | undefined;
  return { ...DEFAULT_AI_CONFIG, ...stored };
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await chrome.storage.local.set({ [AI_CONFIG_KEY]: config });
}
