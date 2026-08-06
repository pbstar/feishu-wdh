// ── 消息协议 ──
import type { DocumentModel, FetchedImage } from './doc';

export type ExportStage =
  | 'idle'
  | 'scrolling'
  | 'extracting'
  | 'ai'
  | 'packaging'
  | 'done'
  | 'error';

export interface ExportProgress {
  stage: ExportStage;
  message?: string;
}

/** popup → background：请求导出当前 tab */
export interface StartExportMsg {
  type: 'START_EXPORT';
}

/** background → content：执行提取（滚动+抽取+抓图） */
export interface ExtractMsg {
  type: 'EXTRACT';
}

/** content → background：提取结果（失败时带 error，不含 doc/images） */
export interface ExtractResultMsg {
  type: 'EXTRACT_RESULT';
  doc?: DocumentModel;
  images?: FetchedImage[];
  error?: string;
}

/** content/background → popup：进度上报 */
export interface ProgressMsg {
  type: 'PROGRESS';
  progress: ExportProgress;
}

/** 一次导出的结果字段：成功/失败、产物、图片失败数，EXPORT_DONE 广播与持久化结果共用 */
export interface ExportOutcome {
  ok: boolean;
  filename?: string;
  imagesFailed?: number;
  error?: string;
}

/** 导出最终结果 → popup */
export interface ExportDoneMsg extends ExportOutcome {
  type: 'EXPORT_DONE';
}

/** popup → background：查询当前导出状态（popup 重新打开时恢复进度/上次结果） */
export interface GetExportStateMsg {
  type: 'GET_EXPORT_STATE';
}

/** 一次导出的最终结果（持久化到 storage，SW 回收后仍可恢复） */
export interface ExportStateResult extends ExportOutcome {
  /** 完成时间戳（ms） */
  finishedAt: number;
}

/** GET_EXPORT_STATE 的响应负载（非广播消息，不入 RuntimeMessage 联合） */
export interface ExportStateResp {
  running: boolean;
  progress: ExportProgress;
  /** 最近一次导出的最终结果；进行中或从未导出时为 undefined */
  result?: ExportStateResult;
}

export type RuntimeMessage =
  | StartExportMsg
  | ExtractMsg
  | ExtractResultMsg
  | ProgressMsg
  | ExportDoneMsg
  | GetExportStateMsg;
