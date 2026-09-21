export type HoleCount = 8 | 12 | 24;

export type BalanceStatus = 'balanced' | 'ok' | 'over';

/** 推荐模式：交换换位 / 定量补偿（样本位置不可交换时加配重） */
export type BalanceMode = 'swap' | 'compensate';

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
  kind: 'swap';
  /** 交换对（0 基槽号，按执行顺序） */
  swaps: [number, number][];
  projectedMagnitude: number;
  finalWeights: number[];
  improvement: number;
  /** 排序键：[交换次数, 槽号序列...] */
  tuple: number[];
}

/** 单个槽位的定量配重 */
export interface WeightAddition {
  /** 0 基槽号 */
  slot: number;
  /** 加重质量（g，步长的整数倍） */
  amount: number;
}

export interface CompensationPlan {
  kind: 'compensate';
  additions: WeightAddition[];
  /** 总加质量（g） */
  totalAdded: number;
  /** 使用槽数（1 或 2） */
  slotCount: number;
  projectedMagnitude: number;
  /** 补偿后合力矢量（用于转盘预览） */
  projectedResultant: Resultant;
  finalWeights: number[];
  improvement: number;
  /** 最佳方案合力是否已降至阈值内 */
  thresholdReachable: boolean;
  /** 排序键：[总加质量, 槽号, 步数, ...] */
  tuple: number[];
}

export type AnyPlan = SwapPlan | CompensationPlan;

export interface BalanceResponse {
  holeCount: HoleCount;
  threshold: number;
  mode: BalanceMode;
  status: BalanceStatus;
  slots: SlotResult[];
  resultant: Resultant;
  enumeration?: number;
  recommendation?: AnyPlan | null;
  alternatives?: AnyPlan[];
  /** 定量补偿：最佳方案能否把合力降至阈值 */
  thresholdReachable?: boolean;
  /** 定量补偿：枚举范围内的最小可达合力 */
  minimumMagnitude?: number;
  step?: number;
  maxAddPerSlot?: number;
}

export interface BalanceRequest {
  holeCount: HoleCount;
  weights: number[];
  locked: boolean[];
  threshold: number;
  mode: BalanceMode;
  step?: number;
  maxAddPerSlot?: number;
}

export interface SavedPlan {
  id: string;
  name: string;
  savedAt: number;
  holeCount: HoleCount;
  weights: number[];
  locked: boolean[];
  threshold: number;
  mode?: BalanceMode;
  step?: number;
  maxAddPerSlot?: number;
}

/** 当前编辑中的工作台状态 */
export interface WorkbenchDraft {
  holeCount: HoleCount;
  weights: number[];
  locked: boolean[];
  threshold: number;
  mode: BalanceMode;
  step: number;
  maxAddPerSlot: number;
}
