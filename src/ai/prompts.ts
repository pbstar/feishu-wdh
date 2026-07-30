import type { AiGranularity } from "../shared/types";

const COMMON_RULES = `你是需求文档专家。处理文档时，必须：
1. 输出严格符合 GFM 规范的 Markdown。
2. 保留所有图片、代码块、表格、链接等元素，内容零丢失。
3. 剔除乱码以及与需求无关的冗余信息。
4. 禁止修改 UI 文案、提示语、固定话术之类的短语或句子。
5. 统一专业术语，核心概念前后一致。
6. 仅输出正文内容，不添加任何解释或评论。
7. 保持原文语言。`;

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

// 不同粒度对确定性的需求不同:仅去重要稳定、摘要可放开发挥
const TEMPERATURES: Record<AiGranularity, number> = {
  summary: 0.8,
  perParagraph: 0.5,
  dedupeOnly: 0.2,
};

/** 按粒度返回采样温度 */
export function getTemperature(granularity: AiGranularity): number {
  return TEMPERATURES[granularity];
}
