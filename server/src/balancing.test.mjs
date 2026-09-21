import { analyze, slotAngleRad } from './balancing.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${detail}`);
  }
}

// 1) 对向放置等重试管 => 完全平衡
const balanced = new Array(12).fill(0);
balanced[0] = 10;
balanced[6] = 10;
const r1 = analyze({
  holeCount: 12,
  weights: balanced,
  locked: new Array(12).fill(false),
  threshold: 1,
});
check('对向等重 -> balanced', r1.status === 'balanced');
check('平衡时合力为 0', Math.abs(r1.resultant.magnitude) < 1e-9, JSON.stringify(r1.resultant));
check('平衡时无推荐', r1.recommendation === undefined);

// 2) 同侧重物 => 超阈值，推荐应把较重试管移到对侧
const weights2 = new Array(12).fill(0);
weights2[0] = 10;
weights2[1] = 10.2;
const r2 = analyze({
  holeCount: 12,
  weights: weights2,
  locked: new Array(12).fill(false),
  threshold: 1,
});
check('同侧两管 -> over', r2.status === 'over');
check('存在推荐', r2.recommendation !== null);
check(
  '推荐合力小于当前',
  r2.recommendation &&
    r2.recommendation.projectedMagnitude < r2.resultant.magnitude,
  `${r2.recommendation?.projectedMagnitude} < ${r2.resultant.magnitude}`,
);
check(
  '一次交换即可近似配平：槽0 的 10 移到槽 7（残差 0.2g，优于 10.2 移槽 7 的 5.2g）',
  JSON.stringify(r2.recommendation.swaps) === '[[0,7]]',
  JSON.stringify(r2.recommendation.swaps),
);
check(
  '方向角介于槽 0 与槽 1 之间（约 15°）',
  r2.resultant.directionDeg > 10 && r2.resultant.directionDeg < 20,
  String(r2.resultant.directionDeg),
);
check('nearestSlot 为 0 或 1', [0, 1].includes(r2.resultant.nearestSlotIndex));

// 3) 锁定槽位不参与交换
const weights3 = new Array(12).fill(0);
weights3[0] = 10;
weights3[1] = 10.2;
const locked3 = new Array(12).fill(false);
locked3[7] = true; // 锁住对侧目标槽
const r3 = analyze({
  holeCount: 12,
  weights: weights3,
  locked: locked3,
  threshold: 1,
});
const touchesLocked = r3.recommendation.swaps
  .flat()
  .some((slot) => slot === 7);
check('推荐不触碰锁定槽', !touchesLocked);
check('锁定时备选同样不含 7 槽', !r3.alternatives.some(
  (p) => p.swaps.flat().includes(7),
));

// 4) 全部锁定且超阈值 => 无推荐
const r4 = analyze({
  holeCount: 8,
  weights: [10, 10, 0, 0, 0, 0, 0, 0],
  locked: new Array(8).fill(true),
  threshold: 1,
});
check('全部锁定 -> over 且无推荐', r4.status === 'over' && r4.recommendation === null);
check('枚举数为 1', r4.enumeration === 1);

// 5) 枚举数核对（8 孔全解锁：1 + C(8,2) + P(8,2有效对...) ）
//    pairs=28，单次=28（重量互异），两次=28*27=756，合计 785
const r5 = analyze({
  holeCount: 8,
  weights: [1, 2, 3, 4, 5, 6, 7, 8],
  locked: new Array(8).fill(false),
  threshold: 0,
});
check('8 孔枚举总数 785', r5.enumeration === 785, String(r5.enumeration));

// 6) 同合力方案按次数、槽号排序
check(
  '备选按合力升序',
  r5.alternatives.every((p, i, arr) =>
    i === 0 ? true : p.projectedMagnitude >= arr[i - 1].projectedMagnitude - 1e-9,
  ),
);
const firstSingle = r5.alternatives.find((p) => p.swaps.length === 1);
const firstDouble = r5.alternatives.find((p) => p.swaps.length === 2);
check(
  '同合力单次优先于两次',
  !firstDouble ||
    !firstSingle ||
    firstDouble.projectedMagnitude > firstSingle.projectedMagnitude + 1e-9 ||
    r5.alternatives.indexOf(firstSingle) < r5.alternatives.indexOf(firstDouble),
);

// 7) 24 孔最坏情况性能
const t0 = performance.now();
const r7 = analyze({
  holeCount: 24,
  weights: Array.from({ length: 24 }, (_, i) => i + 1),
  locked: new Array(24).fill(false),
  threshold: 0,
});
const elapsed = performance.now() - t0;
check('24 孔枚举总数', r7.enumeration === 1 + 276 + 276 * 275, String(r7.enumeration));
check(`24 孔耗时 ${elapsed.toFixed(0)}ms < 500ms`, elapsed < 500);
check('备选至多 6 个', r7.alternatives.length <= 6);

// 8) 参数校验
let threw = false;
try {
  analyze({ holeCount: 10, weights: [], locked: [], threshold: 1 });
} catch {
  threw = true;
}
check('非法孔数抛错', threw);

threw = false;
try {
  analyze({ holeCount: 8, weights: new Array(8).fill(-1), locked: new Array(8).fill(false), threshold: 1 });
} catch {
  threw = true;
}
check('负重量抛错', threw);

// 9) finalWeights 与 swaps 一致（应用后结果即方案描述的结果）
for (const plan of r2.alternatives) {
  const expected = [...weights2];
  for (const [a, b] of plan.swaps) {
    const tmp = expected[a];
    expected[a] = expected[b];
    expected[b] = tmp;
  }
  check(
    `finalWeights 与交换序列一致 ${JSON.stringify(plan.swaps)}`,
    JSON.stringify(expected) === JSON.stringify(plan.finalWeights),
  );
}

// ---------- 定量补偿模式 ----------

// 10) 对侧空槽加等重配重 => 完全补偿
const compWeights = new Array(12).fill(0);
compWeights[0] = 10;
const c1 = analyze({
  holeCount: 12,
  weights: compWeights,
  locked: new Array(12).fill(false),
  threshold: 1,
  mode: 'compensate',
  step: 0.5,
  maxAddPerSlot: 10,
});
check('补偿模式回显 mode', c1.mode === 'compensate');
check('补偿模式 -> over 且有推荐', c1.status === 'over' && c1.recommendation !== null);
check(
  '对侧槽 7 加 10g 完全补偿',
  JSON.stringify(c1.recommendation.additions) === '[{"slot":6,"amount":10}]',
  JSON.stringify(c1.recommendation.additions),
);
check('补偿后合力为 0', Math.abs(c1.recommendation.projectedMagnitude) < 1e-6);
check('可达到阈值', c1.thresholdReachable === true);
check('使用槽数 = 1', c1.recommendation.slotCount === 1);
check('总加质量 = 10', c1.recommendation.totalAdded === 10);
check(
  'finalWeights 为原重量叠加补偿量',
  c1.recommendation.finalWeights[0] === 10 && c1.recommendation.finalWeights[6] === 10,
);
check(
  '默认 mode 仍为 swap（旧客户端兼容）',
  analyze({ holeCount: 8, weights: new Array(8).fill(0), locked: new Array(8).fill(false), threshold: 1 }).mode === 'swap',
);

// 11) 锁定槽不可加重：锁住对侧槽后推荐仅使用未锁定槽
const compLocked = new Array(12).fill(false);
compLocked[6] = true;
const c2 = analyze({
  holeCount: 12,
  weights: compWeights,
  locked: compLocked,
  threshold: 0.5,
  mode: 'compensate',
  step: 0.5,
  maxAddPerSlot: 10,
});
const c2TouchesLocked = c2.alternatives.some((p) =>
  p.additions.some((a) => a.slot === 6),
);
check('补偿推荐不触碰锁定槽', !c2TouchesLocked);
check(
  '补偿后合力小于当前合力',
  c2.recommendation.projectedMagnitude < c2.resultant.magnitude,
);
check('至多两个加重槽', c2.recommendation.slotCount <= 2);

// 12) 无法达到阈值 => 明确返回最小可达合力
const c3 = analyze({
  holeCount: 12,
  weights: compWeights,
  locked: new Array(12).fill(false),
  threshold: 0.01,
  mode: 'compensate',
  step: 3,
  maxAddPerSlot: 10,
});
check('粗步长无法达到阈值', c3.thresholdReachable === false);
check('最小可达合力 = 最佳方案合力', c3.minimumMagnitude === c3.recommendation.projectedMagnitude);
check('最小可达合力仍大于阈值', c3.minimumMagnitude > 0.01);

// 13) 全部锁定且超阈值 => 无推荐，最小可达合力即当前合力
const c4 = analyze({
  holeCount: 8,
  weights: [10, 10, 0, 0, 0, 0, 0, 0],
  locked: new Array(8).fill(true),
  threshold: 1,
  mode: 'compensate',
  step: 1,
  maxAddPerSlot: 10,
});
check('全部锁定补偿推荐为 null', c4.recommendation === null);
check('全部锁定枚举数为 1', c4.enumeration === 1);
check('最小可达合力 = 当前合力', Math.abs(c4.minimumMagnitude - c4.resultant.magnitude) < 1e-6);
check('全部锁定 thresholdReachable=false', c4.thresholdReachable === false);

// 14) 配重量为步长整数倍且不超过每槽上限
const cw = new Array(12).fill(0);
cw[0] = 10;
cw[2] = 7.3;
const c5 = analyze({
  holeCount: 12,
  weights: cw,
  locked: new Array(12).fill(false),
  threshold: 0.3,
  mode: 'compensate',
  step: 0.25,
  maxAddPerSlot: 8,
});
for (const plan of c5.alternatives) {
  for (const a of plan.additions) {
    const steps = Math.round(a.amount / 0.25);
    check(
      `加质量 ${a.amount} 为 0.25 整数倍`,
      Math.abs(steps * 0.25 - a.amount) < 1e-6,
    );
    check(`单槽加质量 ${a.amount} 不超过 8`, a.amount <= 8 + 1e-9);
  }
  check(
    'finalWeights = 原重量 + 补偿量',
    plan.finalWeights.every((fw, i) => {
      const add = plan.additions.find((x) => x.slot === i)?.amount ?? 0;
      return Math.abs(fw - (cw[i] + add)) < 1e-6;
    }),
  );
}

// 15) 排序：合力 → 总加质量 → 使用槽数 → 槽号字典序
const sortedOk = c5.alternatives.every((plan, i, arr) => {
  if (i === 0) return true;
  const prev = arr[i - 1];
  if (plan.projectedMagnitude > prev.projectedMagnitude + 1e-6) return true;
  if (Math.abs(plan.projectedMagnitude - prev.projectedMagnitude) > 1e-6) return false;
  if (plan.totalAdded !== prev.totalAdded) return plan.totalAdded > prev.totalAdded;
  if (plan.slotCount !== prev.slotCount) return plan.slotCount > prev.slotCount;
  for (let k = 1; k < plan.tuple.length; k += 1) {
    if (plan.tuple[k] !== prev.tuple[k]) return plan.tuple[k] > prev.tuple[k];
  }
  return true;
});
check('补偿备选排序键正确', sortedOk);
check('补偿备选至多 6 个（最佳 + 5 备选）', c5.alternatives.length <= 6);

// 16) projectedResultant 与 finalWeights 全量重算一致
for (const plan of c5.alternatives) {
  let x = 0;
  let y = 0;
  plan.finalWeights.forEach((fw, i) => {
    const angle = slotAngleRad(i, 12);
    x += fw * Math.cos(angle);
    y += fw * Math.sin(angle);
  });
  check(
    'projectedResultant 合力一致',
    Math.abs(Math.hypot(x, y) - plan.projectedResultant.magnitude) < 1e-5,
  );
}

// 17) 补偿枚举数核对：1 + n·K + C(n,2)·K²
const c6 = analyze({
  holeCount: 8,
  weights: [10, 10, 0, 0, 0, 0, 0, 0],
  locked: new Array(8).fill(false),
  threshold: 0,
  mode: 'compensate',
  step: 1,
  maxAddPerSlot: 3,
});
check('8 孔 K=3 补偿枚举数 = 277（1+8·3+28·9）', c6.enumeration === 277, String(c6.enumeration));

// 18) 补偿参数校验
const badComp = [
  { mode: 'compensate' },
  { mode: 'compensate', step: 0, maxAddPerSlot: 5 },
  { mode: 'compensate', step: 1, maxAddPerSlot: 0 },
  { mode: 'compensate', step: 5, maxAddPerSlot: 1 },
  { mode: 'compensate', step: 'x', maxAddPerSlot: 5 },
  { mode: 'other', step: 1, maxAddPerSlot: 5 },
];
for (const extra of badComp) {
  let threw = false;
  try {
    analyze({
      holeCount: 8,
      weights: new Array(8).fill(10),
      locked: new Array(8).fill(false),
      threshold: 1,
      ...extra,
    });
  } catch {
    threw = true;
  }
  check(`非法补偿参数抛错 ${JSON.stringify(extra)}`, threw);
}

// 19) 组合数超过上限抛错
let capThrew = false;
try {
  analyze({
    holeCount: 24,
    weights: new Array(24).fill(0).map((_, i) => (i === 0 ? 10 : 0)),
    locked: new Array(24).fill(false),
    threshold: 0.001,
    mode: 'compensate',
    step: 0.01,
    maxAddPerSlot: 2,
  });
} catch {
  capThrew = true;
}
check('补偿组合数超上限抛错', capThrew);

// 20) 交换模式与补偿模式互不干扰：同输入分别调用
const sw = analyze({
  holeCount: 12,
  weights: compWeights,
  locked: new Array(12).fill(false),
  threshold: 1,
});
check('交换模式推荐含 swaps', Array.isArray(sw.recommendation.swaps));
check('交换模式推荐不含 additions', sw.recommendation.additions === undefined);

console.log(failures === 0 ? '\n全部通过 ✔' : `\n${failures} 项失败 ✘`);
process.exit(failures === 0 ? 0 : 1);
