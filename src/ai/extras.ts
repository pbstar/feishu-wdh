// 支线 AI 任务注册表：导出时在必开的文档优化之外，并行生成的可选附加文件。
// 新增支线任务只需在此追加一条，并在 prompts.ts 补充对应用途的提示词、
// types.ts 的 ExtraKey 追加 key——导出流程、存储读写与设置页 UI 均无需改动。

import type { ExtraKey } from '../shared/types';
import { sanitizeFilename } from '../shared/filename';

export interface AiExtraGoal {
  /** 支线任务 key，同时作为 AI 用途（对应 prompts 中的系统提示词） */
  key: ExtraKey;
  /** 设置页开关行标题 */
  label: string;
  /** 设置页开关行说明 */
  desc: string;
  /** 主视图状态提示中的支线短名（如「任务总结」） */
  hint: string;
  /** 生成附加文件名（基于文档标题） */
  filename(title: string): string;
  /** 失败跳过的进度提示（不含错误详情，调用方拼接错误信息） */
  skipMessage: string;
}

export const EXTRA_GOALS: AiExtraGoal[] = [
  {
    key: 'tasks',
    label: 'AI 前端研发任务总结',
    desc: '导出时基于需求文档自动梳理前端研发待开发任务，生成任务清单，默认关闭。',
    hint: '任务总结',
    filename: (title) => `${sanitizeFilename(title)}-任务清单.md`,
    skipMessage: '任务清单生成失败，已跳过',
  },
];

/** 返回当前配置中已启用的支线任务 */
export function enabledExtraGoals(
  extras: Record<ExtraKey, boolean>,
): AiExtraGoal[] {
  return EXTRA_GOALS.filter((goal) => extras[goal.key]);
}