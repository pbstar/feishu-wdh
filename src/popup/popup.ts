import type { AiConfig, ExportOutcome, ExportStage, ExportStateResp, ExtraKey, RuntimeMessage } from '../shared/types';
import { isAiConfigured } from '../shared/types';
import { loadAiConfig, saveAiConfig } from '../shared/storage';
import { EXTRA_GOALS } from '../ai/extras';

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
const extrasContainer = document.getElementById('ai-extras') as HTMLElement;
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

// ── AI 配置 ──
// 支线任务开关行的 input 元素，key → element；渲染时填充，供收集/回填状态直接读取
const extraInputs = new Map<ExtraKey, HTMLInputElement>();

/** 按注册表渲染支线任务开关行；后续新增支线任务无需改动此处 */
function renderExtraSwitches(): void {
  extrasContainer.innerHTML = '';
  extraInputs.clear();
  for (const goal of EXTRA_GOALS) {
    const row = document.createElement('div');
    row.className = 'switch-row';

    const info = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'switch-label';
    label.textContent = goal.label;
    const desc = document.createElement('div');
    desc.className = 'switch-desc';
    desc.textContent = goal.desc;
    info.append(label, desc);

    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    const slider = document.createElement('span');
    slider.className = 'slider';
    switchLabel.append(input, slider);

    row.append(info, switchLabel);
    extrasContainer.appendChild(row);
    extraInputs.set(goal.key, input);
  }
}

/** 收集各开关状态为 extras 对象 */
function collectExtras(): Record<ExtraKey, boolean> {
  const extras = {} as Record<ExtraKey, boolean>;
  for (const [key, el] of extraInputs) {
    extras[key] = el.checked;
  }
  return extras;
}

async function loadSettingsForm(): Promise<void> {
  const cfg = await loadAiConfig();
  for (const [key, el] of extraInputs) {
    el.checked = cfg.extras[key];
  }
  apiUrlEl.value = cfg.apiUrl;
  apiKeyEl.value = cfg.apiKey;
  modelEl.value = cfg.model;
}

saveBtn.addEventListener('click', async () => {
  const config: AiConfig = {
    extras: collectExtras(),
    apiUrl: apiUrlEl.value.trim(),
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim(),
  };

  // 导出依赖 AI 优化，API 配置必须完整
  if (!isAiConfigured(config)) {
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
  if (!isAiConfigured(cfg)) {
    aiHint.textContent = '请先点击 ⚙ 完成 AI API 配置';
    return;
  }
  const features = ['AI 配置已完成'];
  for (const goal of EXTRA_GOALS) {
    if (cfg.extras[goal.key]) features.push(`${goal.hint}已开启`);
  }
  aiHint.textContent = `✓ ${features.join('、')}`;
}

// 初始化
renderExtraSwitches();
void loadSettingsForm();
void refreshAiHint();
void restoreState();
