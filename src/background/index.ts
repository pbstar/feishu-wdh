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

    // AI 为必开功能：配置不完整时直接报错，引导去设置页
    const aiConfig = await loadAiConfig();
    if (!(aiConfig.apiUrl && aiConfig.apiKey && aiConfig.model)) {
      throw new Error('请先在设置中完成 AI 配置（API 地址、密钥与模型名称）');
    }

    // 原文仅作为 AI 输入，不再写入 ZIP
    const markdown = toMarkdown(doc);

    // 主输出：AI 优化版。必开且失败即整体导出失败，不再降级导出原文。
    // AI 请求在 offscreen 执行，其周期性心跳消息与挂起通道会保活 SW，避免长等待被回收。
    reportProgress({ stage: 'ai', message: '正在调用 AI 优化文档…' });
    const optimized = await requestAiContent(markdown, aiConfig, 'optimize');

    // 可选附加：前端研发任务清单。失败仅跳过该文件并提示，不阻断主导出。
    const extra: Array<{ filename: string; content: string }> = [];
    if (aiConfig.tasksEnabled) {
      reportProgress({ stage: 'ai', message: '正在生成任务清单…' });
      try {
        const tasks = await requestAiContent(markdown, aiConfig, 'tasks');
        extra.push({ filename: `${sanitizeFilename(doc.title)}-任务清单.md`, content: tasks });
      } catch (err) {
        reportProgress({ stage: 'ai', message: `任务清单生成失败，已跳过：${(err as Error).message}` });
      }
    }

    // 打包并下载
    reportProgress({ stage: 'packaging', message: '正在打包 ZIP…' });
    const zipBase64 = await packageZip(doc.title, optimized, images, extra);
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
