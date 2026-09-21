export type HoleCount = 8 | 12 | 24;

export type BalanceStatus = 'balanced' | 'ok' | 'over';

export interface SlotResult {
  index: number;
  weight: number;
  angleDeg: number;
  x: number;
  y: number;
}

export interface Resultant {
  x: number;
  y: number;
  magnitude: number;
  /** 自正上方顺时针的角度（度） */
  directionDeg: number | null;
  nearestSlotIndex: number | null;
}

export interface SwapPlan {
  /** 交换对（0 基槽号，按执行顺序） */
  swaps: [number, number][];
  projectedMagnitude: number;
  finalWeights: number[];
  improvement: number;
  /** 排序键：[交换次数, 槽号序列...] */
  tuple: number[];
}

export interface BalanceResponse {
  holeCount: HoleCount;
  threshold: number;
  status: BalanceStatus;
  slots: SlotResult[];
  resultant: Resultant;
  enumeration?: number;
  recommendation?: SwapPlan | null;
  alternatives?: SwapPlan[];
}

export interface BalanceRequest {
  holeCount: HoleCount;
  weights: number[];
  locked: boolean[];
  threshold: number;
}

export interface SavedPlan {
  id: string;
  name: string;
  savedAt: number;
  holeCount: HoleCount;
  weights: number[];
  locked: boolean[];
  threshold: number;
}

/** 当前编辑中的工作台状态 */
export interface WorkbenchDraft {
  holeCount: HoleCount;
  weights: number[];
  locked: boolean[];
  threshold: number;
}
