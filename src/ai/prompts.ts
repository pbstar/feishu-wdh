import type { AiGranularity } from '../shared/types';

const COMMON_RULES = `你是一个专业的文档处理助手。请遵守以下规则：
- 输出必须是合法的 GitHub Flavored Markdown（GFM）。
- 完整保留所有 Markdown 图片引用（形如 ![...](...)），不得删除、改写或移动其路径。
- 保留代码块、表格、链接等结构化元素的语法。
- 不要添加任何解释性前言或结语，直接输出处理后的正文。
- 使用与原文一致的语言。`;

const PROMPTS: Record<AiGranularity, string> = {
  summary: `${COMMON_RULES}

任务：将下面的文档提炼为简短的要点摘要，大幅压缩篇幅，突出核心信息与关键结论。可使用标题和列表组织要点。`,

  perParagraph: `${COMMON_RULES}

任务：保留原文的整体结构与段落顺序，对每一段落分别进行精简与去冗余，让表达更凝练，但不要合并或删除段落，也不要丢失关键信息。`,

  dedupeOnly: `${COMMON_RULES}

任务：尽量保留原文的全部含义与结构，仅删除重复、啰嗦、冗余的表达，让文字更干净利落。不要做额外的概括或改写。`,
};

/** 按粒度返回系统提示词 */
export function getPrompt(granularity: AiGranularity): string {
  return PROMPTS[granularity];
}
