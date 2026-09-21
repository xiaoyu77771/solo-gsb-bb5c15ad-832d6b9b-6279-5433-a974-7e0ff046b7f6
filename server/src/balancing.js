/**
 * 离心机转子配平核心算法
 *
 * 约定：
 *  - 0 号槽位于正上方（12 点钟方向），槽号沿顺时针递增；
 *  - 角度使用数学坐标（x 轴向右，y 轴向上，逆时针为正）参与矢量求和；
 *  - 失衡方向以「自正上方顺时针的角度」呈现给前端。
 *
 * 推荐枚举：未锁定槽位之间的交换，至多两次。
 *  - 0 次交换（当前状态）参与整体排序但不会被作为“推荐方案”；
 *  - 单次交换为无序对 (i,j)；
 *  - 两次交换按「执行顺序」枚举有序的交换对 (i,j)->(k,l)，
 *    因此共享槽位的两次交换两种先后顺序都会被计算；
 *  - 排序键 = [失衡合力(四舍五入到 1e-6), 交换次数, 槽号序列...]，
 *    合力相同的同值方案按交换槽号字典序排序，次数少者优先。
 */

const TAU = Math.PI * 2;
const EPS = 1e-9;
const ROUND_FACTOR = 1e6;
const MAX_ALTERNATIVES = 6;

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
    swaps: candidate.swaps,
    projectedMagnitude: candidate.magnitude,
    finalWeights: candidate.weights,
    improvement: round6(currentMagnitude - candidate.magnitude),
    tuple: candidate.tuple,
  };
}

function assertFiniteNumber(value, message) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(message);
  }
}

/**
 * 分析一次请求：矢量合力、状态与（超阈值时的）交换推荐。
 * 校验失败时抛出 Error（由路由转为 400）。
 */
export function analyze(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('请求体必须是 JSON 对象');
  }
  const { holeCount, weights, locked, threshold } = input;

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

  const normalizedWeights = weights.map((w, i) => {
    assertFiniteNumber(w, `weights[${i}] 必须是有限数值`);
    if (w < 0) throw new Error(`weights[${i}] 不能为负数（空槽请填 0）`);
    return w;
  });
  const normalizedLocked = locked.map((v) => Boolean(v));

  const { slots, resultant } = computeSlots(
    normalizedWeights,
    holeCount,
  );

  let directionDeg = null;
  let nearestSlotIndex = null;
  if (resultant.magnitude > EPS) {
    directionDeg = round6(
      directionDegFromVector(resultant.x, resultant.y),
    );
    // 与合力夹角最小的槽位（单位矢量点积最大）
    let bestDot = -Infinity;
    for (let i = 0; i < holeCount; i += 1) {
      const angle = slotAngleRad(i, holeCount);
      const dot =
        (resultant.x * Math.cos(angle) +
          resultant.y * Math.sin(angle)) /
        resultant.magnitude;
      if (dot > bestDot) {
        bestDot = dot;
        nearestSlotIndex = i;
      }
    }
  }

  const magnitude = round6(resultant.magnitude);
  const status =
    magnitude <= EPS
      ? 'balanced'
      : magnitude > threshold + EPS
        ? 'over'
        : 'ok';

  const response = {
    holeCount,
    threshold,
    status,
    slots,
    resultant: {
      x: round6(resultant.x),
      y: round6(resultant.y),
      magnitude,
      directionDeg,
      nearestSlotIndex,
    },
  };

  // 仅在超阈值时枚举交换方案（0/1 个未锁定槽位时无交换可言）
  if (status === 'over') {
    const unlocked = normalizedLocked
      .map((isLocked, index) => (isLocked ? -1 : index))
      .filter((index) => index >= 0);
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
  }

  return response;
}
