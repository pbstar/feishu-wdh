import { loadAiConfig, loadExportResult, saveExportResult } from '../shared/storage';
import { reportDone, reportProgress } from '../shared/messaging';
import type { ExportProgress, ExportStateResult, ExtractResultMsg, RuntimeMessage } from '../shared/types';
import { toMarkdown } from '../converter';
import { requestAiContent } from '../ai/request';
import { enabledExtraGoals } from '../ai/extras';
import { packageZip } from '../export/zip';
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

// 当前导出进度（内存态）：popup 重开时通过 GET_EXPORT_STATE 拉取。
// 导出期间 SW 由挂起的消息通道保活，此状态必然存活；导出结束后随 SW 回收而复位，
// 最终结果另由 storage 持久化（见 saveExportResult）。
let currentProgress: ExportProgress = { stage: 'idle', message: '' };

/** 更新内存进度并广播给 popup */
function trackProgress(progress: ExportProgress): void {
  currentProgress = progress;
  reportProgress(progress);
}

async function runExport(): Promise<void> {
  if (exporting) {
    reportProgress({ stage: 'error', message: '已有导出进行中，请稍候再试' });
    return;
  }
  exporting = true;
  try {
    // 清理上次导出结果并上报初始状态（popup 重开时据此恢复）
    await saveExportResult(null);
    trackProgress({ stage: 'idle', message: '正在启动导出…' });

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

    // 导出依赖 AI 优化：配置不完整时直接报错，引导去设置页
    const aiConfig = await loadAiConfig();
    if (!(aiConfig.apiUrl && aiConfig.apiKey && aiConfig.model)) {
      throw new Error('请先在设置中完成 AI 配置（API 地址、密钥与模型名称）');
    }

    // 原文仅作为 AI 输入，不再写入 ZIP
    const markdown = toMarkdown(doc);

    // 并行发起 AI 请求：文档优化为主输出，与所有启用的支线任务相互独立同时执行，
    // 以缩短总耗时。优化失败即整体失败；支线任务失败仅跳过对应附加文件并提示。
    // AI 请求在 offscreen 执行，其周期性心跳消息与挂起通道会保活 SW，避免长等待被回收。
    const goals = enabledExtraGoals(aiConfig.extras);
    const aiLabel = goals.length ? '正在调用 AI 优化文档并生成附加任务…' : '正在调用 AI 优化文档…';
    trackProgress({ stage: 'ai', message: aiLabel });

    const optimizePromise = requestAiContent(markdown, aiConfig, 'optimize');
    const goalsPromise = Promise.all(
      goals.map((goal) =>
        requestAiContent(markdown, aiConfig, goal.key)
          .then((content) => ({ filename: goal.filename(doc.title), content }))
          .catch((err) => {
            trackProgress({ stage: 'ai', message: `${goal.skipMessage}：${(err as Error).message}` });
            return null;
          }),
      ),
    );

    // 先等主输出：优化失败立即中断导出，不必再等支线任务
    const optimized = await optimizePromise;
    const extra = (await goalsPromise).filter(
      (item): item is { filename: string; content: string } => item !== null,
    );

    // 打包并下载
    trackProgress({ stage: 'packaging', message: '正在打包 ZIP…' });
    const zipBase64 = await packageZip(doc.title, optimized, images, extra);
    const filename = await downloadZip(zipBase64, doc.title);

    // 先持久化结果再进入同步收尾：storage 写入放在 trackProgress 之前，
    // 保证 done → exporting=false 之间无 await，避免状态查询观测到不一致组合
    const result: ExportStateResult = { ok: true, filename, imagesFailed, finishedAt: Date.now() };
    await saveExportResult(result);
    trackProgress({ stage: 'done', message: '导出完成' });
    reportDone({ ok: true, filename, imagesFailed });
  } catch (err) {
    const message = (err as Error).message || String(err);
    const result: ExportStateResult = { ok: false, error: message, finishedAt: Date.now() };
    await saveExportResult(result);
    trackProgress({ stage: 'error', message });
    reportDone({ ok: false, error: message });
  } finally {
    exporting = false;
  }
}

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (msg.type === 'START_EXPORT') {
    void runExport();
    return;
  }
  // content/offscreen 广播的实时进度（滚动、抽取、AI 心跳）→ 同步进内存态，
  // 保证 popup 重开时拉到的 progress 是最新文案。SW 收不到自己的广播，不会回环覆盖。
  if (msg.type === 'PROGRESS' && exporting) {
    currentProgress = msg.progress;
    return;
  }
  if (msg.type === 'GET_EXPORT_STATE') {
    // 异步响应（需读 storage 取上次结果），须 return true 保持通道
    void (async () => {
      let result: ExportStateResult | null = null;
      try {
        result = await loadExportResult();
      } catch {
        /* 读取失败按无结果处理，保证始终 sendResponse，避免 popup 等待悬挂 */
      }
      sendResponse({ running: exporting, progress: currentProgress, result: result ?? undefined });
    })();
    return true;
  }
});
