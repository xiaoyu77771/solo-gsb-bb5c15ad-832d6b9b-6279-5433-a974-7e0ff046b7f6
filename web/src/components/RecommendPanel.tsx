import type { BalanceResponse, SwapPlan } from '../types';
import { fmt } from '../lib/format';

interface RecommendPanelProps {
  result: BalanceResponse | null;
  activePlan: SwapPlan | null;
  onApply: () => void;
  onPreview: (plan: SwapPlan | null) => void;
}

function describeSwaps(plan: SwapPlan): string {
  return plan.swaps
    .map(([a, b], step) => `第${step + 1}次：槽 ${a + 1} ⇄ 槽 ${b + 1}`)
    .join('，');
}

function PlanRow({
  plan,
  current,
  emphasized,
  onPreview,
}: {
  plan: SwapPlan;
  current: number;
  emphasized?: boolean;
  onPreview: (plan: SwapPlan | null) => void;
}) {
  return (
    <li
      className={`plan-row ${emphasized ? 'plan-row-best' : ''}`}
      onMouseEnter={() => onPreview(plan)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(plan)}
      onBlur={() => onPreview(null)}
    >
      <div className="plan-row-main">
        <span className="plan-swaps">{describeSwaps(plan)}</span>
        <span className="plan-metrics">
          合力 {fmt(current)} → <strong>{fmt(plan.projectedMagnitude)}</strong> g
          <em>（降低 {fmt(plan.improvement)} g）</em>
        </span>
      </div>
    </li>
  );
}

export function RecommendPanel({
  result,
  activePlan,
  onApply,
  onPreview,
}: RecommendPanelProps) {
  const status = result?.status;
  const best = result?.recommendation ?? null;
  const alternatives = result?.alternatives ?? [];
  const others = best ? alternatives.slice(1) : alternatives;
  const current = result?.resultant.magnitude ?? 0;

  return (
    <section className="card recommend-card">
      <header className="card-header">
        <h2>配平推荐</h2>
        {result?.enumeration !== undefined && (
          <span className="hint">已枚举 {result.enumeration} 种方案（≤2 次交换）</span>
        )}
      </header>

      {status !== 'over' ? (
        <p className="hint">
          {status === 'balanced'
            ? '当前完全平衡，无需交换。'
            : '失衡合力处于阈值内，无需交换。'}
        </p>
      ) : !best ? (
        <p className="hint">
          未锁定槽位不足或没有可减小失衡的交换方案，可尝试解锁更多槽位。
        </p>
      ) : (
        <>
          <ul className="plan-list">
            <PlanRow
              plan={best}
              current={current}
              emphasized
              onPreview={onPreview}
            />
            {others.map((plan, i) => (
              <PlanRow
                key={i}
                plan={plan}
                current={current}
                onPreview={onPreview}
              />
            ))}
          </ul>
          <div className="recommend-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onApply}
              disabled={!activePlan}
            >
              一键应用推荐并重算
            </button>
            <span className="hint">
              悬停候选可在转盘上预览涉及槽位；同合力方案按交换次数、槽号升序。
            </span>
          </div>
        </>
      )}
    </section>
  );
}
