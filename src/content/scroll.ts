import { SCROLL_CONTAINER_SELECTORS, queryFirst } from './selectors';

const STEP_DELAY = 220; // 每步滚动后等待渲染的毫秒数
const STABLE_ROUNDS = 3; // 连续多少轮高度/滚动位置不变即认为到底
const MAX_STEPS = 600; // 步数上限，防止异常页面死循环

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 找到承载虚拟滚动的滚动容器；找不到则返回 null（回退到窗口滚动） */
export function findScrollContainer(): HTMLElement | null {
  const el = queryFirst<HTMLElement>(SCROLL_CONTAINER_SELECTORS);
  if (el && el.scrollHeight > el.clientHeight) return el;
  // 回退：遍历找一个可滚动的容器
  const candidates = document.querySelectorAll<HTMLElement>('div');
  for (const c of candidates) {
    if (c.scrollHeight > c.clientHeight + 200 && c.clientHeight > 300) {
      const style = getComputedStyle(c);
      if (/(auto|scroll)/.test(style.overflowY)) return c;
    }
  }
  return null;
}

interface ScrollTarget {
  getScrollTop: () => number;
  setScrollTop: (v: number) => void;
  getScrollHeight: () => number;
  getClientHeight: () => number;
}

function makeTarget(container: HTMLElement | null): ScrollTarget {
  if (container) {
    return {
      getScrollTop: () => container.scrollTop,
      setScrollTop: (v) => (container.scrollTop = v),
      getScrollHeight: () => container.scrollHeight,
      getClientHeight: () => container.clientHeight,
    };
  }
  const doc = document.scrollingElement || document.documentElement;
  return {
    getScrollTop: () => doc.scrollTop,
    setScrollTop: (v) => (doc.scrollTop = v),
    getScrollHeight: () => doc.scrollHeight,
    getClientHeight: () => doc.clientHeight,
  };
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
  const target = makeTarget(container);
  const originalTop = target.getScrollTop();

  // 回到顶部，从头采集
  target.setScrollTop(0);
  await sleep(STEP_DELAY);
  await onSlice();

  let stableCount = 0;
  let lastHeight = target.getScrollHeight();
  let lastTop = -1;

  for (let step = 0; step < MAX_STEPS; step++) {
    const clientH = target.getClientHeight();
    // 步长略小于一屏，制造重叠，避免高速滚动漏掉临界 block
    target.setScrollTop(target.getScrollTop() + clientH * 0.75);
    await sleep(STEP_DELAY);
    await onSlice();

    const curTop = target.getScrollTop();
    const curHeight = target.getScrollHeight();
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
  target.setScrollTop(originalTop);
}
