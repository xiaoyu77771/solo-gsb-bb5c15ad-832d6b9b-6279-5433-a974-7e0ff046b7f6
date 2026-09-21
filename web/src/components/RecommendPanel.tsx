import type {
  AnyPlan,
  BalanceMode,
  BalanceResponse,
  CompensationPlan,
  SwapPlan,
} from '../types';
import { fmt } from '../lib/format';

interface RecommendPanelProps {
  result: BalanceResponse | null;
  activePlan: AnyPlan | null;
  mode: BalanceMode;
  step: number;
  maxAddPerSlot: number;
  compConfigValid: boolean;
  onApply: () => void;
  onPreview: (plan: AnyPlan | null) => void;
  onModeChange: (mode: BalanceMode) => void;
  onStepChange: (value: number) => void;
  onMaxAddChange: (value: number) => void;
}

function describeSwaps(plan: SwapPlan): string {
  return plan.swaps
    .map(([a, b], stepIndex) => `第${stepIndex + 1}次：槽 ${a + 1} ⇄ 槽 ${b + 1}`)
    .join('，');
}

function describeAdditions(plan: CompensationPlan): string {
  return plan.additions
    .map((a) => `槽 ${a.slot + 1} 加 ${fmt(a.amount)} g`)
    .join('，');
}

function SwapRow({
  plan,
  current,
  emphasized,
  onPreview,
}: {
  plan: SwapPlan;
  current: number;
  emphasized?: boolean;
  onPreview: (plan: AnyPlan | null) => void;
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

function CompensationRow({
  plan,
  current,
  threshold,
  emphasized,
  onPreview,
}: {
  plan: CompensationPlan;
  current: number;
  threshold: number;
  emphasized?: boolean;
  onPreview: (plan: AnyPlan | null) => void;
}) {
  const reachable = plan.projectedMagnitude <= threshold;
  return (
    <li
      className={`plan-row ${emphasized ? 'plan-row-best' : ''}`}
      onMouseEnter={() => onPreview(plan)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(plan)}
      onBlur={() => onPreview(null)}
    >
      <div className="plan-row-main">
        <span className="plan-swaps">{describeAdditions(plan)}</span>
        <span className="plan-metrics">
          合力 {fmt(current)} →{' '}
          <strong className={reachable ? '' : 'metric-warn'}>
            {fmt(plan.projectedMagnitude)}
          </strong>{' '}
          g
          <em>
            （降低 {fmt(plan.improvement)} g · 共加 {fmt(plan.totalAdded)} g ·{' '}
            {plan.slotCount} 槽）
          </em>
        </span>
      </div>
    </li>
  );
}

export function RecommendPanel({
  result,
  activePlan,
  mode,
  step,
  maxAddPerSlot,
  compConfigValid,
  onApply,
  onPreview,
  onModeChange,
  onStepChange,
  onMaxAddChange,
}: RecommendPanelProps) {
  const status = result?.status;
  const best = result?.recommendation ?? null;
  const alternatives = result?.alternatives ?? [];
  const others = best ? alternatives.slice(1) : alternatives;
  const current = result?.resultant.magnitude ?? 0;

  const enumHint =
    mode === 'compensate'
      ? `已枚举 ${result?.enumeration ?? 0} 种配重组合（≤2 槽）`
      : `已枚举 ${result?.enumeration ?? 0} 种方案（≤2 次交换）`;

  return (
    <section className="card recommend-card">
      <header className="card-header">
        <h2>配平推荐</h2>
        {result?.enumeration !== undefined && (
          <span className="hint">{enumHint}</span>
        )}
      </header>

      {/* 模式切换 */}
      <div className="mode-switch" role="tablist" aria-label="推荐模式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'swap'}
          className={`mode-btn ${mode === 'swap' ? 'mode-btn-active' : ''}`}
          onClick={() => onModeChange('swap')}
        >
          交换换位
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'compensate'}
          className={`mode-btn ${mode === 'compensate' ? 'mode-btn-active' : ''}`}
          onClick={() => onModeChange('compensate')}
        >
          定量补偿
        </button>
      </div>

      {mode === 'compensate' && (
        <div className="comp-config">
          <label className="control comp-control">
            补偿步长 (g)
            <input
              type="number"
              min={0}
              step={0.1}
              className="threshold-input"
              value={Number.isFinite(step) ? step : ''}
              onChange={(event) => onStepChange(Number(event.target.value))}
            />
          </label>
          <label className="control comp-control">
            每槽最大可加 (g)
            <input
              type="number"
              min={0}
              step={0.5}
              className="threshold-input"
              value={Number.isFinite(maxAddPerSlot) ? maxAddPerSlot : ''}
              onChange={(event) => onMaxAddChange(Number(event.target.value))}
            />
          </label>
          <span className="hint comp-hint">
            配重量为步长整数倍；仅在未锁定槽加重，至多使用两个加重槽，锁定槽不可加重。
          </span>
        </div>
      )}

      {mode === 'compensate' && !compConfigValid ? (
        <p className="hint error-text">
          请设置有效的补偿步长与每槽最大可加质量（均需为正数，且最大可加不小于步长）。
        </p>
      ) : status !== 'over' ? (
        <p className="hint">
          {status === 'balanced'
            ? '当前完全平衡，无需处理。'
            : '失衡合力处于阈值内，无需处理。'}
        </p>
      ) : !best ? (
        <p className="hint">
          {mode === 'compensate'
            ? '没有可加重的未锁定槽位（全部锁定），无法进行定量补偿；最小可达合力即当前合力。'
            : '未锁定槽位不足或没有可减小失衡的交换方案，可尝试解锁更多槽位。'}
        </p>
      ) : mode === 'swap' ? (
        <>
          <ul className="plan-list">
            <SwapRow plan={best as SwapPlan} current={current} emphasized onPreview={onPreview} />
            {others.map((plan, i) => (
              <SwapRow
                key={i}
                plan={plan as SwapPlan}
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
      ) : (
        <>
          {/* 无法降到阈值时明确显示最小可达合力 */}
          {result?.thresholdReachable === false && (
            <p className="comp-warning">
              ⚠️ 在当前步长 / 每槽上限与锁定条件下，合力无法降至阈值{' '}
              {fmt(result.threshold)} g 以内；最小可达合力为{' '}
              <strong>{fmt(result.minimumMagnitude)} g</strong>。
            </p>
          )}
          {result && (
            <ul className="plan-list">
              <CompensationRow
                plan={best as CompensationPlan}
                current={current}
                threshold={result.threshold}
                emphasized
                onPreview={onPreview}
              />
              {others.map((plan, i) => (
                <CompensationRow
                  key={i}
                  plan={plan as CompensationPlan}
                  current={current}
                  threshold={result.threshold}
                  onPreview={onPreview}
                />
              ))}
            </ul>
          )}
          <div className="recommend-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onApply}
              disabled={!activePlan}
            >
              一键应用补偿并重算
            </button>
            <span className="hint">
              悬停候选可在转盘上预览补偿后合力；排序：合力 → 总加质量 → 使用槽数 → 槽号。
            </span>
          </div>
        </>
      )}
    </section>
  );
}
