import type { AiConfig, ExportStage, ExportStateResp, RuntimeMessage } from '../shared/types';
import { loadAiConfig, saveAiConfig } from '../shared/storage';

// ── 主视图元素 ──
const viewMain = document.getElementById('view-main') as HTMLElement;
const viewSettings = document.getElementById('view-settings') as HTMLElement;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const spinner = document.getElementById('spinner') as HTMLSpanElement;
const progressTrack = document.getElementById('progress-track') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const aiHint = document.getElementById('ai-hint') as HTMLSpanElement;

// ── 设置视图元素 ──
const tasksEnabledEl = document.getElementById('ai-tasks-enabled') as HTMLInputElement;
const apiUrlEl = document.getElementById('api-url') as HTMLInputElement;
const apiKeyEl = document.getElementById('api-key') as HTMLInputElement;
const modelEl = document.getElementById('model') as HTMLInputElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const saveStatus = document.getElementById('save-status') as HTMLSpanElement;

const STAGE_PROGRESS: Record<ExportStage, number> = {
  idle: 0,
  scrolling: 30,
  extracting: 55,
  ai: 75,
  packaging: 90,
  done: 100,
  error: 0,
};

let running = false;

// ── 视图切换 ──
function showSettings(show: boolean): void {
  viewMain.hidden = show;
  viewSettings.hidden = !show;
}

settingsBtn.addEventListener('click', () => showSettings(true));
backBtn.addEventListener('click', () => {
  showSettings(false);
  void refreshAiHint();
});

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

function finish(running_: boolean): void {
  running = running_;
  exportBtn.disabled = running_;
  spinner.hidden = !running_;
}

/** 渲染导出最终结果（成功/失败），EXPORT_DONE 广播与打开时恢复共用，幂等 */
function renderDone(result: { ok: boolean; filename?: string; imagesFailed?: number; error?: string }): void {
  finish(false);
  if (result.ok) {
    const failNote = result.imagesFailed ? `（${result.imagesFailed} 张图片下载失败，已保留原链接）` : '';
    setStatus(`导出完成：${result.filename}${failNote}`, 'success');
    setProgress('done');
  } else {
    setStatus(result.error || '导出失败', 'error');
    progressTrack.hidden = true;
  }
}

exportBtn.addEventListener('click', () => {
  if (running) return;
  finish(true);
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
    finish(true);
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
      setStatus(message || '导出失败', 'error');
      progressTrack.hidden = true;
      finish(false);
      return;
    }
    setStatus(message || '', 'normal');
    setProgress(stage);
  } else if (msg.type === 'EXPORT_DONE') {
    renderDone(msg);
  }
});

// ── AI 配置 ──
async function loadSettingsForm(): Promise<void> {
  const cfg = await loadAiConfig();
  tasksEnabledEl.checked = cfg.tasksEnabled;
  apiUrlEl.value = cfg.apiUrl;
  apiKeyEl.value = cfg.apiKey;
  modelEl.value = cfg.model;
}

saveBtn.addEventListener('click', async () => {
  const config: AiConfig = {
    tasksEnabled: tasksEnabledEl.checked,
    apiUrl: apiUrlEl.value.trim(),
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim(),
  };

  // AI 文档优化为必开功能，API 配置必须完整
  if (!config.apiUrl || !config.apiKey || !config.model) {
    saveStatus.textContent = 'AI 优化为必开功能，需填写完整的 API 地址、密钥与模型名称';
    saveStatus.style.color = 'var(--md-error)';
    return;
  }

  await saveAiConfig(config);
  saveStatus.textContent = '✓ 已保存';
  saveStatus.style.color = 'var(--md-success)';
  setTimeout(() => (saveStatus.textContent = ''), 2000);
});

// ── AI 状态提示 ──
async function refreshAiHint(): Promise<void> {
  const cfg = await loadAiConfig();
  if (!(cfg.apiUrl && cfg.apiKey && cfg.model)) {
    aiHint.textContent = 'AI 文档优化已开启，请先点击 ⚙ 完成 API 配置';
    return;
  }
  const features = ['AI 文档优化已开启'];
  if (cfg.tasksEnabled) features.push('任务总结已开启');
  aiHint.textContent = `✓ ${features.join('、')}`;
}

// 初始化
void loadSettingsForm();
void refreshAiHint();
void restoreState();
