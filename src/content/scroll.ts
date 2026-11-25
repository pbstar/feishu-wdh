import { DOC_ROOT_SELECTOR } from './selectors';

const STEP_DELAY = 220; // 每步滚动后等待渲染的毫秒数
const STABLE_ROUNDS = 3; // 连续多少轮高度/滚动位置不变即认为到底
const MAX_STEPS = 600; // 步数上限，防止异常页面死循环

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 从正文根向上找承载虚拟滚动的容器；找不到返回 null（回退窗口滚动） */
export function findScrollContainer(): HTMLElement | null {
  const root = document.querySelector<HTMLElement>(DOC_ROOT_SELECTOR);
  let node = root?.parentElement ?? null;
  while (node) {
    if (node.scrollHeight > node.clientHeight + 200 && node.clientHeight > 300) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * 从顶到底分步滚动，每滚一屏调用一次 onSlice 采集当前视口内容。
 * 飞书虚拟滚动会回收离开视口的 DOM，故必须边滚边采，而非滚到底再提取。
 * 完成后恢复用户原始滚动位置。
 */
export async function scrollAndCollect(
  container: HTMLElement | null,
  onSlice: () => void | Promise<void>,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const el = container ?? document.scrollingElement ?? document.documentElement;
  const originalTop = el.scrollTop;

  // 回到顶部，从头采集
  el.scrollTop = 0;
  await sleep(STEP_DELAY);
  await onSlice();

  let stableCount = 0;
  let lastHeight = el.scrollHeight;
  let lastTop = -1;

  for (let step = 0; step < MAX_STEPS; step++) {
    const clientH = el.clientHeight;
    // 步长略小于一屏，制造重叠，避免高速滚动漏掉临界 block
    el.scrollTop = el.scrollTop + clientH * 0.75;
    await sleep(STEP_DELAY);
    await onSlice();

    const curTop = el.scrollTop;
    const curHeight = el.scrollHeight;
    const atBottom = curTop + clientH >= curHeight - 2;

    if (onProgress && curHeight > 0) {
      onProgress(Math.min(1, (curTop + clientH) / curHeight));
    }

    if (curHeight === lastHeight && curTop === lastTop) {
      stableCount++;
      if (stableCount >= STABLE_ROUNDS && atBottom) break;
    } else {
      stableCount = 0;
    }
    lastHeight = curHeight;
    lastTop = curTop;
  }

  // 恢复用户原始位置
  el.scrollTop = originalTop;
}
