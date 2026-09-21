import type { SavedPlan, WorkbenchDraft } from '../types';

const PLANS_KEY = 'centrifuge-balance:saved-plans:v1';
const DRAFT_KEY = 'centrifuge-balance:draft:v1';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用（隐私模式等）时静默降级
  }
}

export function loadPlans(): SavedPlan[] {
  const plans = readJSON<SavedPlan[]>(PLANS_KEY);
  return Array.isArray(plans) ? plans : [];
}

export function savePlan(plan: SavedPlan): SavedPlan[] {
  const plans = loadPlans().filter((item) => item.id !== plan.id);
  plans.unshift(plan);
  writeJSON(PLANS_KEY, plans);
  return plans;
}

export function deletePlan(id: string): SavedPlan[] {
  const plans = loadPlans().filter((item) => item.id !== id);
  writeJSON(PLANS_KEY, plans);
  return plans;
}

export function loadDraft(): WorkbenchDraft | null {
  return readJSON<WorkbenchDraft>(DRAFT_KEY);
}

export function persistDraft(draft: WorkbenchDraft): void {
  writeJSON(DRAFT_KEY, draft);
}
