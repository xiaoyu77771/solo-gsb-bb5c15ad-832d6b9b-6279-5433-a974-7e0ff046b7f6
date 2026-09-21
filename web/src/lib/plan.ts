import type { AnyPlan, WeightAddition } from '../types';

/** 方案涉及的槽位（交换的两个槽 / 加重槽） */
export function planSlots(plan: AnyPlan | null): Set<number> {
  const set = new Set<number>();
  if (!plan) return set;
  if (plan.kind === 'swap') {
    plan.swaps.forEach(([a, b]) => {
      set.add(a);
      set.add(b);
    });
  } else {
    plan.additions.forEach((a) => set.add(a.slot));
  }
  return set;
}

/** 补偿方案：槽号 -> 加质量 映射 */
export function planAdditions(plan: AnyPlan | null): Map<number, number> {
  const map = new Map<number, number>();
  if (plan && plan.kind === 'compensate') {
    plan.additions.forEach((a: WeightAddition) => map.set(a.slot, a.amount));
  }
  return map;
}
