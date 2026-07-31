import { loadAiConfig } from '../shared/storage';
import { reportProgress } from '../shared/messaging';
import type {
  ExportDoneMsg,
  ExtractResultMsg,
  RuntimeMessage,
} from '../shared/types';
import { toMarkdown } from '../converter';
import { summarizeMarkdown } from '../ai/summarize';
import { packageZip } from '../export/zip';
import { downloadZip } from '../export/download';

const FEISHU_HOST = /(feishu\.cn|larksuite\.com)$/i;

function reportDone(result: Omit<ExportDoneMsg, 'type'>): void {
  const msg: ExportDoneMsg = { type: 'EXPORT_DONE', ...result };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* popup 可能已关闭 */
  });
}

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

    // 转 Markdown
    let markdown = toMarkdown(doc);

    // 可选 AI 总结
    const aiConfig = await loadAiConfig();
    if (aiConfig.enabled && aiConfig.apiKey && aiConfig.apiUrl && aiConfig.model) {
      reportProgress({ stage: 'summarizing', message: '正在调用 AI 处理内容…' });
      try {
        markdown = await summarizeMarkdown(markdown, aiConfig);
      } catch (err) {
        // AI 失败不阻断导出，降级为原文
        reportProgress({
          stage: 'summarizing',
          message: `AI 处理失败，将导出原文：${(err as Error).message}`,
        });
      }
    }

    // 打包并下载
    reportProgress({ stage: 'packaging', message: '正在打包 ZIP…' });
    const zipBase64 = await packageZip(doc.title, markdown, images);
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
