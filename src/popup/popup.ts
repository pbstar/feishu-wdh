import type { AiConfig, AiGranularity, ExportStage, RuntimeMessage } from '../shared/types';
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
const enabledEl = document.getElementById('ai-enabled') as HTMLInputElement;
const fieldsEl = document.getElementById('ai-fields') as HTMLDivElement;
const apiUrlEl = document.getElementById('api-url') as HTMLInputElement;
const apiKeyEl = document.getElementById('api-key') as HTMLInputElement;
const modelEl = document.getElementById('model') as HTMLInputElement;
const granularityEl = document.getElementById('granularity') as HTMLSelectElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const saveStatus = document.getElementById('save-status') as HTMLSpanElement;

const STAGE_PROGRESS: Record<ExportStage, number> = {
  idle: 0,
  scrolling: 15,
  extracting: 35,
  fetchingImages: 55,
  summarizing: 75,
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

function setProgress(stage: ExportStage, imagesDone?: number, imagesTotal?: number): void {
  progressTrack.hidden = false;
  let pct = STAGE_PROGRESS[stage];
  if (stage === 'fetchingImages' && imagesTotal && imagesTotal > 0) {
    pct = 35 + Math.round((imagesDone! / imagesTotal) * 35);
  }
  progressBar.style.width = `${pct}%`;
}

function finish(running_: boolean): void {
  running = running_;
  exportBtn.disabled = running_;
  spinner.hidden = !running_;
}

exportBtn.addEventListener('click', () => {
  if (running) return;
  finish(true);
  setStatus('正在启动导出…');
  setProgress('idle');
  const msg: RuntimeMessage = { type: 'START_EXPORT' };
  chrome.runtime.sendMessage(msg);
});

chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
  if (msg.type === 'PROGRESS') {
    const { stage, message, imagesDone, imagesTotal } = msg.progress;
    if (stage === 'error') {
      setStatus(message || '导出失败', 'error');
      progressTrack.hidden = true;
      finish(false);
      return;
    }
    setStatus(message || '', 'normal');
    setProgress(stage, imagesDone, imagesTotal);
  } else if (msg.type === 'EXPORT_DONE') {
    finish(false);
    if (msg.ok) {
      const failNote = msg.imagesFailed ? `（${msg.imagesFailed} 张图片下载失败，已保留原链接）` : '';
      setStatus(`导出完成：${msg.filename}${failNote}`, 'success');
      setProgress('done');
    } else {
      setStatus(msg.error || '导出失败', 'error');
      progressTrack.hidden = true;
    }
  }
});

// ── AI 配置 ──
function syncFieldsState(): void {
  fieldsEl.classList.toggle('disabled', !enabledEl.checked);
}

enabledEl.addEventListener('change', syncFieldsState);

async function loadSettingsForm(): Promise<void> {
  const cfg = await loadAiConfig();
  enabledEl.checked = cfg.enabled;
  apiUrlEl.value = cfg.apiUrl;
  apiKeyEl.value = cfg.apiKey;
  modelEl.value = cfg.model;
  granularityEl.value = cfg.granularity;
  syncFieldsState();
}

saveBtn.addEventListener('click', async () => {
  const config: AiConfig = {
    enabled: enabledEl.checked,
    apiUrl: apiUrlEl.value.trim(),
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim(),
    granularity: granularityEl.value as AiGranularity,
  };

  if (config.enabled && (!config.apiUrl || !config.apiKey || !config.model)) {
    saveStatus.textContent = '需填写完整的 API 地址、密钥与模型名称';
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
  aiHint.textContent = cfg.enabled ? '✓ AI 总结精简已开启' : 'AI 总结精简未开启，点击右上角齿轮配置';
}

// 初始化
void loadSettingsForm();
void refreshAiHint();
