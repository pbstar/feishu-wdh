import type { ExportOutcome, ExportStage, ExportStateResp, RuntimeMessage } from '../shared/types';

const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const spinner = document.getElementById('spinner') as HTMLSpanElement;
const progressTrack = document.getElementById('progress-track') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;

const STAGE_PROGRESS: Record<ExportStage, number> = {
  idle: 0,
  scrolling: 30,
  extracting: 55,
  packaging: 90,
  done: 100,
  error: 0,
};

let running = false;

// ── 导出流程 ──
function setStatus(text: string, kind: 'normal' | 'error' | 'success' = 'normal'): void {
  statusEl.hidden = false;
  statusText.textContent = text;
  statusText.className = 'status-text' + (kind === 'error' ? ' error' : kind === 'success' ? ' success' : '');
}

function setProgress(stage: ExportStage): void {
  progressTrack.hidden = false;
  progressBar.style.width = `${STAGE_PROGRESS[stage]}%`;
}

function setRunning(next: boolean): void {
  running = next;
  exportBtn.disabled = next;
  spinner.hidden = !next;
}

/** 展示导出失败态：错误文案 + 隐藏进度条 + 恢复可再次导出，多处失败分支共用 */
function showError(message: string): void {
  setStatus(message, 'error');
  progressTrack.hidden = true;
  setRunning(false);
}

/** 渲染导出最终结果（成功/失败），EXPORT_DONE 广播与打开时恢复共用，幂等 */
function renderDone(result: ExportOutcome): void {
  if (result.ok) {
    setRunning(false);
    const failNote = result.imagesFailed ? `（${result.imagesFailed} 张图片下载失败，已保留原链接）` : '';
    setStatus(`导出完成：${result.filename}${failNote}`, 'success');
    setProgress('done');
  } else {
    showError(result.error || '导出失败');
  }
}

exportBtn.addEventListener('click', () => {
  if (running) return;
  setRunning(true);
  setStatus('正在启动导出…');
  setProgress('idle');
  const msg: RuntimeMessage = { type: 'START_EXPORT' };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* background 不 sendResponse，忽略 Promise 拒绝 */
  });
});

// popup 每次打开都是全新页面（切走标签页即关闭），导出任务由后台 SW 持有。
// 打开时主动拉取快照恢复：进行中 → 显示进度并禁用按钮；已有上次结果 → 显示完成/失败。
async function restoreState(): Promise<void> {
  let resp: ExportStateResp | undefined;
  try {
    resp = (await chrome.runtime.sendMessage({ type: 'GET_EXPORT_STATE' })) as ExportStateResp | undefined;
  } catch {
    /* SW 未就绪/重启：按待机处理 */
  }
  if (!resp) return;
  if (resp.running) {
    setRunning(true);
    setStatus(resp.progress.message || '正在导出…', 'normal');
    setProgress(resp.progress.stage);
  } else if (resp.result) {
    renderDone(resp.result);
  }
}

chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
  if (msg.type === 'PROGRESS') {
    const { stage, message } = msg.progress;
    if (stage === 'error') {
      showError(message || '导出失败');
      return;
    }
    setStatus(message || '', 'normal');
    setProgress(stage);
  } else if (msg.type === 'EXPORT_DONE') {
    renderDone(msg);
  }
});

// 初始化
void restoreState();
