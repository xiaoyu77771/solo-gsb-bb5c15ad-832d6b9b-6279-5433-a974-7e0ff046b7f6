/**
 * 离心机转子配平核心算法
 *
 * 约定：
 *  - 0 号槽位于正上方（12 点钟方向），槽号沿顺时针递增；
 *  - 角度使用数学坐标（x 轴向右，y 轴向上，逆时针为正）参与矢量求和；
 *  - 失衡方向以「自正上方顺时针的角度」呈现给前端。
 *
 * 两种推荐模式：
 *  A. 交换换位（mode='swap'，默认）：未锁定槽位之间的交换，至多两次。
 *  - 0 次交换（当前状态）参与整体排序但不会被作为“推荐方案”；
 *  - 单次交换为无序对 (i,j)；
 *  - 两次交换按「执行顺序」枚举有序的交换对 (i,j)->(k,l)，
 *    因此共享槽位的两次交换两种先后顺序都会被计算；
 *  - 排序键 = [失衡合力(四舍五入到 1e-6), 交换次数, 槽号序列...]，
 *    合力相同的同值方案按交换槽号字典序排序，次数少者优先。
 *
 *  B. 定量补偿（mode='compensate'）：样本位置不能交换时，向未锁定槽位加
 *     离散配重（配重量 = step 的整数倍，每槽至多 maxAddPerSlot），枚举
 *     至多两个加重槽位，使补偿后合力最小。锁定槽位不可加重。
 *  - 排序键 = [补偿后合力, 总加质量, 使用槽数, 槽号/步数序列...]；
 *  - 不能降至阈值时返回最小可达合力（minimumMagnitude）。
 */

const TAU = Math.PI * 2;
const EPS = 1e-9;
const ROUND_FACTOR = 1e6;
const MAX_ALTERNATIVES = 6;
/** 定量补偿最多加重槽位数量 */
export const MAX_COMPENSATION_SLOTS = 2;
/** 定量补偿枚举的离散方案数上限（防止步长过小 / 单槽上限过大时组合爆炸） */
const MAX_COMPENSATION_COMBOS = 5_000_000;

export const SUPPORTED_HOLE_COUNTS = [8, 12, 24];

/** 槽位数学角（弧度，0 号槽在正上方，顺时针） */
export function slotAngleRad(index, holeCount) {
  return TAU / 4 - (index * TAU) / holeCount;
}

/** 槽位显示角（度，自正上方顺时针） */
export function slotAngleDeg(index, holeCount) {
  return (index * 360) / holeCount;
}

function round6(value) {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

/** 字典序：先比长度（交换次数），再逐位比槽号 */
function tupleLess(a, b) {
  if (a.length !== b.length) return a.length < b.length;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** 计算每个重量矢量及其合力 */
function computeSlots(weights, holeCount) {
  const slots = new Array(holeCount);
  let x = 0;
  let y = 0;
  for (let i = 0; i < holeCount; i += 1) {
    const angle = slotAngleRad(i, holeCount);
    const weight = weights[i];
    const sx = weight * Math.cos(angle);
    const sy = weight * Math.sin(angle);
    x += sx;
    y += sy;
    slots[i] = {
      index: i,
      weight,
      angleDeg: slotAngleDeg(i, holeCount),
      x: sx,
      y: sy,
    };
  }
  return { slots, resultant: { x, y, magnitude: Math.hypot(x, y) } };
}

/** 合力方向：自正上方顺时针的角度（度，0~360） */
function directionDegFromVector(x, y) {
  const deg = (90 - (Math.atan2(y, x) * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}

function magnitudeOf(values, holeCount) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < holeCount; i += 1) {
    const angle = slotAngleRad(i, holeCount);
    x += values[i] * Math.cos(angle);
    y += values[i] * Math.sin(angle);
  }
  return Math.hypot(x, y);
}

/**
 * 枚举至多两次交换，返回按失衡合力升序排列的候选（含当前状态）。
 */
function enumerateSwaps(weights, holeCount, unlocked, currentMagnitude) {
  // 未锁定槽位间的所有无序对
  const pairs = [];
  for (let a = 0; a < unlocked.length; a += 1) {
    for (let b = a + 1; b < unlocked.length; b += 1) {
      pairs.push([unlocked[a], unlocked[b]]);
    }
  }

  // 预计算每一种单次交换后的重量数组（空交换对/同值交换跳过）
  const base = Float64Array.from(weights);
  const singles = new Array(pairs.length);
  for (let p = 0; p < pairs.length; p += 1) {
    const [i, j] = pairs[p];
    if (weights[i] === weights[j]) continue; // 同值交换无效果
    const arr = new Float64Array(base);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    singles[p] = arr;
  }

  const ranked = [];

  const pushCandidate = (magnitude, tuple, swaps, values) => {
    const candidate = {
      magnitude: round6(magnitude),
      tuple,
      swaps,
      weights: Array.from(values),
    };
    if (
      ranked.length >= MAX_ALTERNATIVES &&
      candidate.magnitude > ranked[ranked.length - 1].magnitude + EPS
    ) {
      return;
    }
    let pos = ranked.length;
    for (let k = 0; k < ranked.length; k += 1) {
      const existing = ranked[k];
      if (
        candidate.magnitude < existing.magnitude - EPS ||
        (Math.abs(candidate.magnitude - existing.magnitude) <= EPS &&
          tupleLess(candidate.tuple, existing.tuple))
      ) {
        pos = k;
        break;
      }
    }
    if (pos < MAX_ALTERNATIVES) {
      ranked.splice(pos, 0, candidate);
      if (ranked.length > MAX_ALTERNATIVES) ranked.pop();
    }
  };

  let enumerated = 1; // 当前状态（0 次交换）
  pushCandidate(currentMagnitude, [], [], base);

  // 单次交换
  for (let p = 0; p < pairs.length; p += 1) {
    if (!singles[p]) continue;
    const [i, j] = pairs[p];
    enumerated += 1;
    pushCandidate(
      magnitudeOf(singles[p], holeCount),
      [1, i, j],
      [[i, j]],
      singles[p],
    );
  }

  // 两次交换（按执行顺序枚举）
  const tmp = new Float64Array(holeCount);
  for (let p = 0; p < pairs.length; p += 1) {
    if (!singles[p]) continue; // 第一次交换为同值空操作，结果等价于单次交换
    const [i, j] = pairs[p];
    for (let q = 0; q < pairs.length; q += 1) {
      if (q === p || !singles[q]) continue; // 同一交换重复 / 第二次为空操作
      const [k, l] = pairs[q];
      tmp.set(singles[p]);
      const t = tmp[k];
      tmp[k] = tmp[l];
      tmp[l] = t;
      enumerated += 1;
      pushCandidate(
        magnitudeOf(tmp, holeCount),
        [2, i, j, k, l],
        [
          [i, j],
          [k, l],
        ],
        tmp,
      );
    }
  }

  return { ranked, enumerated };
}

function toPlanDTO(candidate, currentMagnitude) {
  return {
    kind: 'swap',
    swaps: candidate.swaps,
    projectedMagnitude: candidate.magnitude,
    finalWeights: candidate.weights,
    improvement: round6(currentMagnitude - candidate.magnitude),
    tuple: candidate.tuple,
  };
}

/**
 * 由当前合力分量生成「合力 + 方向 + 最近槽位」摘要。
 */
function describeResultant(x, y, holeCount, magnitude) {
  const summary = {
    x: round6(x),
    y: round6(y),
    magnitude,
    directionDeg: null,
    nearestSlotIndex: null,
  };
  if (magnitude <= EPS) return summary;
  summary.directionDeg = round6(directionDegFromVector(x, y));
  // 与合力夹角最小的槽位（单位矢量点积最大）
  let bestDot = -Infinity;
  for (let i = 0; i < holeCount; i += 1) {
    const angle = slotAngleRad(i, holeCount);
    const dot =
      (x * Math.cos(angle) + y * Math.sin(angle)) / magnitude;
    if (dot > bestDot) {
      bestDot = dot;
      summary.nearestSlotIndex = i;
    }
  }
  return summary;
}

/**
 * 枚举「定量补偿」方案：在至多 MAX_COMPENSATION_SLOTS 个未锁定槽位上加
 * step 整数倍配重（每槽 1..maxSteps 步），使补偿后合力最小。
 *
 * 利用 |R + Σ aᵢvᵢ|² = |R|² + 2Σ aᵢ(R·vᵢ) + ΣΣ aᵢaⱼ(vᵢ·vⱼ) 增量计算，
 * 内部循环只做乘加与平方比较，避免重复三角函数与开方。
 *
 * 排序键 = [合力, 总加质量, 使用槽数, 槽号/步数序列]（均为四舍五入后的稳定值）。
 */
function enumerateCompensation(weights, holeCount, unlocked, step, maxSteps) {
  const base = Float64Array.from(weights);

  // 当前合力
  let rx = 0;
  let ry = 0;
  for (let i = 0; i < holeCount; i += 1) {
    const angle = slotAngleRad(i, holeCount);
    rx += base[i] * Math.cos(angle);
    ry += base[i] * Math.sin(angle);
  }

  // 每个未锁定槽位的单位方向与每一步配重的标量投影 / 自项 / 增量矢量
  const info = unlocked.map((slot) => {
    const angle = slotAngleRad(slot, holeCount);
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const steps = new Array(maxSteps);
    // u[a-1] = 该槽加 a 步配重时对 |合力|² 的单槽贡献
    //        = 2a·step·(R·v) + a²·step²
    const u = new Float64Array(maxSteps);
    for (let a = 1; a <= maxSteps; a += 1) {
      const amount = round6(a * step);
      steps[a - 1] = { count: a, amount };
      u[a - 1] =
        2 * (rx * vx + ry * vy) * a * step + a * a * step * step;
    }
    return { slot, vx, vy, steps, u };
  });

  const ranked = [];

  // 排序键（合力之后）：[总加质量, 使用槽数, 槽号, 步数, 槽号, 步数...]
  // 槽数少者优先（即便两槽各加 1 与一槽加 1 总量相同）；同槽数按槽号、步数。
  const compensationTupleLess = (a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0]; // 总加质量
    const slotsA = (a.length - 1) / 2;
    const slotsB = (b.length - 1) / 2;
    if (slotsA !== slotsB) return slotsA < slotsB;
    for (let i = 1; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
  };

  const insertCandidate = (magSq, tuple, additions) => {
    const magnitude = round6(Math.sqrt(magSq));
    const finalWeights = new Float64Array(base);
    for (const { slot, amount } of additions) {
      finalWeights[slot] = round6(finalWeights[slot] + amount);
    }
    const candidate = {
      magnitude,
      tuple,
      totalAdded: tuple[0],
      additions,
      weights: Array.from(finalWeights),
    };
    let pos = ranked.length;
    for (let k = 0; k < ranked.length; k += 1) {
      const existing = ranked[k];
      if (
        candidate.magnitude < existing.magnitude - EPS ||
        (Math.abs(candidate.magnitude - existing.magnitude) <= EPS &&
          compensationTupleLess(candidate.tuple, existing.tuple))
      ) {
        pos = k;
        break;
      }
    }
    if (pos < MAX_ALTERNATIVES) {
      ranked.splice(pos, 0, candidate);
      if (ranked.length > MAX_ALTERNATIVES) ranked.pop();
    }
  };

  // 内层热循环只比较平方值，合力按 1e-6 四舍五入，预留余量避免误淘汰
  let worstCutSq = Infinity;
  const qualifies = (magSq) =>
    ranked.length < MAX_ALTERNATIVES || magSq <= worstCutSq;
  const updateCut = () => {
    if (ranked.length >= MAX_ALTERNATIVES) {
      const c = ranked[ranked.length - 1].magnitude + 1e-6 + EPS;
      worstCutSq = c * c;
    }
  };

  let enumerated = 1; // 不加配重（当前状态）
  const baseMagSq = rx * rx + ry * ry;

  // 单槽加重：magSq = |R|² + u[a]
  for (const entry of info) {
    for (let a = 0; a < maxSteps; a += 1) {
      enumerated += 1;
      const magSq = baseMagSq + entry.u[a];
      if (!qualifies(magSq)) continue;
      const s = entry.steps[a];
      insertCandidate(
        magSq,
        [s.amount, entry.slot, s.count],
        [{ slot: entry.slot, amount: s.amount, count: s.count }],
      );
      updateCut();
    }
  }

  // 两槽加重（槽位按未锁定顺序升序，不重复）：
  // magSq = |R|² + u_p[a] + u_q[b] + 2·a·b·step²·(v_p·v_q)
  for (let p = 0; p < info.length; p += 1) {
    const first = info[p];
    for (let q = p + 1; q < info.length; q += 1) {
      const second = info[q];
      const cross = 2 * step * step * (first.vx * second.vx + first.vy * second.vy);
      for (let a = 0; a < maxSteps; a += 1) {
        const ua = first.u[a];
        for (let b = 0; b < maxSteps; b += 1) {
          enumerated += 1;
          const magSq =
            baseMagSq + ua + second.u[b] + cross * (a + 1) * (b + 1);
          if (!qualifies(magSq)) continue;
          const s1 = first.steps[a];
          const s2 = second.steps[b];
          const totalAdded = round6(s1.amount + s2.amount);
          insertCandidate(
            magSq,
            [totalAdded, first.slot, s1.count, second.slot, s2.count],
            [
              { slot: first.slot, amount: s1.amount, count: s1.count },
              { slot: second.slot, amount: s2.amount, count: s2.count },
            ],
          );
          updateCut();
        }
      }
    }
  }

  return { ranked, enumerated };
}

function toCompensationDTO(candidate, currentMagnitude, threshold, holeCount) {
  const additions = candidate.additions.map(({ slot, amount }) => ({
    slot,
    amount,
  }));
  // 由当前合力 + 各加重矢量推导补偿后合力，保证与 finalWeights 全量重算一致
  let px = 0;
  let py = 0;
  for (let i = 0; i < holeCount; i += 1) {
    const angle = slotAngleRad(i, holeCount);
    px += candidate.weights[i] * Math.cos(angle);
    py += candidate.weights[i] * Math.sin(angle);
  }
  return {
    kind: 'compensate',
    additions,
    totalAdded: candidate.totalAdded,
    slotCount: candidate.additions.length,
    projectedMagnitude: candidate.magnitude,
    projectedResultant: describeResultant(
      px,
      py,
      holeCount,
      candidate.magnitude,
    ),
    finalWeights: candidate.weights,
    improvement: round6(currentMagnitude - candidate.magnitude),
    thresholdReachable: candidate.magnitude <= threshold + EPS,
    tuple: candidate.tuple,
  };
}

function assertFiniteNumber(value, message) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(message);
  }
}

/**
 * 分析一次请求：矢量合力、状态与（超阈值时的）推荐方案。
 * mode='swap'（默认）枚举至多两次交换；mode='compensate' 枚举至多两个
 * 槽位的定量配重。校验失败时抛出 Error（由路由转为 400）。
 */
export function analyze(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('请求体必须是 JSON 对象');
  }
  const {
    holeCount,
    weights,
    locked,
    threshold,
    mode = 'swap',
    step,
    maxAddPerSlot,
  } = input;

  if (!SUPPORTED_HOLE_COUNTS.includes(holeCount)) {
    throw new Error(
      `holeCount 仅支持 ${SUPPORTED_HOLE_COUNTS.join('/')} 孔转子`,
    );
  }
  if (!Array.isArray(weights) || weights.length !== holeCount) {
    throw new Error(`weights 必须是长度 ${holeCount} 的数组`);
  }
  if (!Array.isArray(locked) || locked.length !== holeCount) {
    throw new Error(`locked 必须是长度 ${holeCount} 的数组`);
  }
  assertFiniteNumber(threshold, 'threshold 必须是有限数值');
  if (threshold < 0) throw new Error('threshold 不能为负数');
  if (mode !== 'swap' && mode !== 'compensate') {
    throw new Error("mode 仅支持 'swap'（交换换位）或 'compensate'（定量补偿）");
  }
  if (mode === 'compensate') {
    assertFiniteNumber(step, '定量补偿模式下 step（补偿步长）必须是有限数值');
    if (step <= 0) throw new Error('step（补偿步长）必须为正数');
    assertFiniteNumber(
      maxAddPerSlot,
      '定量补偿模式下 maxAddPerSlot（每槽最大可加质量）必须是有限数值',
    );
    if (maxAddPerSlot <= 0) {
      throw new Error('maxAddPerSlot（每槽最大可加质量）必须为正数');
    }
    if (maxAddPerSlot < step) {
      throw new Error('maxAddPerSlot 不能小于 step（每槽至少允许加 1 个步长）');
    }
  }

  const normalizedWeights = weights.map((w, i) => {
    assertFiniteNumber(w, `weights[${i}] 必须是有限数值`);
    if (w < 0) throw new Error(`weights[${i}] 不能为负数（空槽请填 0）`);
    return w;
  });
  const normalizedLocked = locked.map((v) => Boolean(v));

  const { slots, resultant: rawResultant } = computeSlots(
    normalizedWeights,
    holeCount,
  );

  const magnitude = round6(rawResultant.magnitude);
  const status =
    magnitude <= EPS
      ? 'balanced'
      : magnitude > threshold + EPS
        ? 'over'
        : 'ok';

  const response = {
    holeCount,
    threshold,
    mode,
    status,
    slots,
    resultant: describeResultant(
      rawResultant.x,
      rawResultant.y,
      holeCount,
      magnitude,
    ),
  };

  if (mode === 'compensate') {
    response.step = step;
    response.maxAddPerSlot = maxAddPerSlot;
  }

  // 仅在超阈值时枚举推荐方案
  if (status === 'over') {
    const unlocked = normalizedLocked
      .map((isLocked, index) => (isLocked ? -1 : index))
      .filter((index) => index >= 0);

    if (mode === 'swap') {
      const { ranked, enumerated } = enumerateSwaps(
        normalizedWeights,
        holeCount,
        unlocked,
        magnitude,
      );
      const alternatives = ranked
        .filter((candidate) => candidate.tuple.length > 0)
        .map((candidate) => toPlanDTO(candidate, magnitude));
      response.enumeration = enumerated;
      response.recommendation = alternatives[0] ?? null;
      response.alternatives = alternatives;
    } else {
      // 每槽离散步数；对浮点边界做 1e-9 容差
      const maxSteps = Math.max(
        1,
        Math.floor(maxAddPerSlot / step + 1e-9),
      );
      const n = unlocked.length;
      const comboCount =
        1 + n * maxSteps + (n * (n - 1)) / 2 * maxSteps * maxSteps;
      if (comboCount > MAX_COMPENSATION_COMBOS) {
        throw new Error(
          `补偿方案数量 ${comboCount} 超过枚举上限 ${MAX_COMPENSATION_COMBOS}，请增大步长或减小每槽最大可加质量`,
        );
      }
      const { ranked, enumerated } = enumerateCompensation(
        normalizedWeights,
        holeCount,
        unlocked,
        step,
        maxSteps,
      );
      const alternatives = ranked.map((candidate) =>
        toCompensationDTO(candidate, magnitude, threshold, holeCount),
      );
      const best = alternatives[0] ?? null;
      response.enumeration = enumerated;
      response.recommendation = best;
      response.alternatives = alternatives;
      // 最佳方案仍无法降至阈值时，明确给出最小可达合力
      response.thresholdReachable = best
        ? best.thresholdReachable
        : false;
      response.minimumMagnitude = best ? best.projectedMagnitude : magnitude;
    }
  }

  return response;
}
