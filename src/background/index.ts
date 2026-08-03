import { loadAiConfig } from '../shared/storage';
import { reportDone, reportProgress } from '../shared/messaging';
import type { ExtractResultMsg, RuntimeMessage } from '../shared/types';
import { toMarkdown } from '../converter';
import { requestAiContent } from '../ai/request';
import { packageZip, sanitizeFilename } from '../export/zip';
import { downloadZip } from '../export/download';

const FEISHU_HOST = /(feishu\.cn|larksuite\.com)$/i;

async function getActiveFeishuTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('未找到当前标签页');
  const host = new URL(tab.url).hostname;
  if (!FEISHU_HOST.test(host)) {
    throw new Error('请在飞书文档页面使用本扩展');
  }
  return tab;
}

// 导出互斥：导出期间重复触发（如关闭再打开 popup 后再次点击）会被忽略，避免并发采集错乱
let exporting = false;

async function runExport(): Promise<void> {
  if (exporting) {
    reportProgress({ stage: 'error', message: '已有导出进行中，请稍候再试' });
    return;
  }
  exporting = true;
  try {
    const tab = await getActiveFeishuTab();

    // 向 content script 请求提取（含滚动预加载、抽取、抓图）
    let extractResult: ExtractResultMsg;
    try {
      extractResult = await chrome.tabs.sendMessage(tab.id!, { type: 'EXTRACT' });
    } catch {
      throw new Error('无法连接到页面脚本，请刷新文档页面后重试');
    }
    if (extractResult.error) throw new Error(extractResult.error);

    const { doc, images = [] } = extractResult;
    if (!doc || !doc.blocks.length) {
      throw new Error('未能提取到文档内容，请确认已打开飞书文档');
    }

    const imagesFailed = images.filter((i) => i.failed).length;

    // 转 Markdown：始终导出原文
    const markdown = toMarkdown(doc);

    // 可选 AI 能力：文档优化 / 前端研发任务总结，各额外生成一份 Markdown 写入 ZIP。
    // AI 请求在 offscreen 执行，其周期性心跳消息与挂起通道会保活 SW，避免长等待被回收。
    const aiConfig = await loadAiConfig();
    const aiReady = !!(aiConfig.apiKey && aiConfig.apiUrl && aiConfig.model);
    const safeTitle = sanitizeFilename(doc.title);
    const extra: Array<{ filename: string; content: string }> = [];

    if (aiReady && (aiConfig.enabled || aiConfig.tasksEnabled)) {
      reportProgress({ stage: 'ai', message: '正在调用 AI 处理…' });
      // 两个 AI 请求并行发出，省去串行等待；任一失败均不阻断导出，仅跳过对应文件
      const optimize = aiConfig.enabled
        ? requestAiContent(markdown, aiConfig, 'optimize').then(
            (content) => extra.push({ filename: `${safeTitle}-AI优化.md`, content }),
            (err) => reportProgress({ stage: 'ai', message: `AI 文档优化失败，已跳过：${(err as Error).message}` }),
          )
        : Promise.resolve();
      const tasks = aiConfig.tasksEnabled
        ? requestAiContent(markdown, aiConfig, 'tasks').then(
            (content) => extra.push({ filename: `${safeTitle}-任务清单.md`, content }),
            (err) => reportProgress({ stage: 'ai', message: `AI 任务总结失败，已跳过：${(err as Error).message}` }),
          )
        : Promise.resolve();
      await Promise.all([optimize, tasks]);
    }

    // 打包并下载
    reportProgress({ stage: 'packaging', message: '正在打包 ZIP…' });
    const zipBase64 = await packageZip(doc.title, markdown, images, extra);
    const filename = await downloadZip(zipBase64, doc.title);

    reportProgress({ stage: 'done', message: '导出完成' });
    reportDone({ ok: true, filename, imagesFailed });
  } catch (err) {
    const message = (err as Error).message || String(err);
    reportProgress({ stage: 'error', message });
    reportDone({ ok: false, error: message });
  } finally {
    exporting = false;
  }
}

chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
  if (msg.type === 'START_EXPORT') {
    void runExport();
  }
});
