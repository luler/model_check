// =========================================================================
// LM-Detector 纯前端推理引擎 (Browser & Node.js 兼容)
// 基于 https://github.com/Ikaleio/lm-detector 算法与数学模型实现
// =========================================================================

(function (global) {
  'use strict';

  const VALUE_MIN = 1;
  const VALUE_MAX = 355;
  const DIMENSION = VALUE_MAX - VALUE_MIN + 1; // 355
  const ALPHA = 0.5;
  const POSITIONAL_WEIGHTS = [0.6, 0.15, 0.125, 0.125];
  const CENTRES = Array.from({ length: 24 }, (_, i) => 1 + i * 354 / 23);
  const LAGS = [1, 2, 3, 5, 8, 13, 21, 34];
  const SEQUENCE_LIMITS = { autocorrelation: -0.23, small_step_share: 0.05 };

  // 1. 特征提取核心函数
  function parseNumbers(text) {
    const runs = [];
    let current = [];
    let previousEnd = 0;
    const str = String(text || '');
    for (const match of str.matchAll(/\d+/g)) {
      const separator = str.slice(previousEnd, match.index);
      const value = Number(match[0]);
      if (current.length && /\p{L}/u.test(separator)) {
        runs.push(current);
        current = [];
      }
      if (value >= VALUE_MIN && value <= VALUE_MAX) {
        current.push(value);
      }
      previousEnd = match.index + match[0].length;
    }
    if (current.length) runs.push(current);
    return runs.reduce((best, run) => run.length > best.length ? run : best, []);
  }

  function countNumbers(numbers) {
    const counts = Array(DIMENSION).fill(0);
    numbers.forEach((number) => { counts[number - VALUE_MIN] += 1; });
    return counts;
  }

  function mean(values) {
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  function standardize(values) {
    const center = mean(values);
    const variance = mean(values.map((value) => (value - center) ** 2));
    const scale = Math.max(Math.sqrt(variance), 1e-12);
    return values.map((value) => (value - center) / scale);
  }

  function dot(left, right) {
    let value = 0;
    for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
    return value;
  }

  function norm(values) {
    const n = Math.max(Math.sqrt(dot(values, values)), 1e-12);
    return values.map((value) => value / n);
  }

  function subtractBasis(values, basis) {
    const output = values.slice();
    for (const vector of basis || []) {
      const projection = dot(output, vector);
      for (let index = 0; index < output.length; index += 1) output[index] -= projection * vector[index];
    }
    return output;
  }

  function hellingerFeature(counts) {
    const total = counts.reduce((sum, value) => sum + value, 0) + ALPHA * DIMENSION;
    return counts.map((value) => Math.sqrt((value + ALPHA) / total));
  }

  function splitIntoFour(values) {
    const base = Math.floor(values.length / 4);
    const remainder = values.length % 4;
    const chunks = [];
    let start = 0;
    for (let index = 0; index < 4; index += 1) {
      const size = base + (index < remainder ? 1 : 0);
      chunks.push(values.slice(start, start + size));
      start += size;
    }
    return chunks;
  }

  function orderedBlockFeature(numbers) {
    const pieces = [];
    for (const chunk of splitIntoFour(numbers)) {
      const bins = Array(16).fill(0.5);
      for (const value of chunk) {
        const index = Math.min(15, Math.floor(((value - 1) / 355) * 16));
        bins[index] += 1;
      }
      const total = bins.reduce((sum, value) => sum + value, 0);
      pieces.push(...bins.map((value) => Math.sqrt(value / total)));
    }
    const lastDigits = Array(10).fill(0.5);
    numbers.forEach((value) => { lastDigits[value % 10] += 1; });
    const lastTotal = lastDigits.reduce((sum, value) => sum + value, 0);
    pieces.push(...lastDigits.map((value) => Math.sqrt(value / lastTotal)));
    return pieces;
  }

  function fraction(length, test) {
    let hits = 0;
    for (let i = 0; i < length; i++) if (test(i)) hits++;
    return hits / length;
  }

  function positionKernel(x) {
    const n = x.length, out = Array(34 * 3).fill(0);
    x.forEach((value, position) => {
      const t = (position + 0.5) * 2 / n - 1;
      const basis = [t, 0.5 * (3 * t * t - 1), 0.5 * (5 * t ** 3 - 3 * t)];
      const features = [
        ...CENTRES.map(centre => Math.exp(-0.5 * ((value - centre) / 20) ** 2)),
        ...Array.from({ length: 10 }, (_, digit) => digit === value % 10 ? 1 : 0)
      ];
      features.forEach((weight, k) => basis.forEach((b, j) => { out[k * 3 + j] += weight * b / n; }));
    });
    return out;
  }

  function centredTransitions(symbols, bins) {
    const joint = Array(bins * bins).fill(0.5), total = symbols.length - 1 + 0.5 * bins * bins;
    for (let i = 1; i < symbols.length; i++) joint[symbols[i - 1] * bins + symbols[i]] += 1;
    for (let i = 0; i < joint.length; i++) joint[i] /= total;
    const rows = Array.from({ length: bins }, (_, a) => joint.slice(a * bins, a * bins + bins).reduce((s, v) => s + v, 0));
    const columns = Array.from({ length: bins }, (_, b) => rows.reduce((s, _, a) => s + joint[a * bins + b], 0));
    return joint.map((value, i) => value - rows[Math.floor(i / bins)] * columns[i % bins]);
  }

  function sequenceFeatures(x) {
    const n = x.length, m = mean(x), sd = Math.max(Math.sqrt(mean(x.map(v => (v - m) ** 2))), 1);
    const s = x.map(v => (v - m) / sd), out = [];
    for (const lag of LAGS) {
      const count = n - lag, d = Array.from({ length: count }, (_, i) => x[i + lag] - x[i]);
      out.push(
        mean(d.map((_, i) => s[i + lag] * s[i])),
        mean(d.map(Math.abs)) / 355,
        fraction(count, i => d[i] > 0),
        fraction(count, i => d[i] === 0),
        fraction(count, i => Math.abs(d[i]) <= 5),
        fraction(count, i => Math.abs(d[i]) <= 20)
      );
    }
    out.push(...centredTransitions(x.map(v => Math.min(7, Math.floor((v - 1) * 8 / 355))), 8));
    out.push(...centredTransitions(x.map(v => v % 10), 10));
    const difference = Array.from({ length: n - 1 }, (_, i) => x[i + 1] - x[i]);
    const zStep = Array.from({ length: n - 1 }, (_, i) => Math.abs(s[i + 1] - s[i]));
    out.push(
      fraction(n - 2, i => Math.sign(difference[i + 1]) === Math.sign(difference[i])),
      fraction(n - 2, i => difference[i + 1] === difference[i]),
      fraction(n - 1, i => x[i] % 10 === x[i + 1] % 10),
      fraction(n - 1, i => zStep[i] > 1),
      fraction(n - 1, i => zStep[i] > 2)
    );
    const buckets = x.map(v => Math.min(15, Math.floor((v - 1) * 16 / 355)));
    for (const width of [4, 8, 16]) {
      let sum = 0;
      for (let i = 0; i + width <= n; i++) sum += new Set(buckets.slice(i, i + width)).size / width;
      out.push(sum / (n - width + 1));
    }
    return out;
  }

  function positionalFeatures(numbers) {
    return [hellingerFeature(countNumbers(numbers)), orderedBlockFeature(numbers), positionKernel(numbers), sequenceFeatures(numbers)];
  }

  function positionalDecision(numbers, head) {
    const parts = positionalFeatures(numbers);
    const x = parts.flatMap((block, j) => {
      const p = head.params[j], scaled = block.map((v, i) => (v - p.mean[i]) / p.scale[i]);
      const length = Math.max(Math.sqrt(scaled.reduce((sum, v) => sum + v * v, 0)), 1e-12);
      return scaled.map((v) => v / length * Math.sqrt(POSITIONAL_WEIGHTS[j]));
    });
    return head.weights.map((row, k) => row.reduce((sum, w, i) => sum + w * x[i], head.bias[k]));
  }

  // 2. 检测器二进制解码器
  function base64ToUint8Array(base64) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function decodeDetector(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const headerLength = view.getUint32(0, true);
    const start = Math.ceil((4 + headerLength) / 4) * 4;
    const count = (data.length - start) / 4;
    const raw = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      for (let b = 0; b < 4; b++) {
        raw[i * 4 + b] = data[start + b * count + i];
      }
    }
    const little = new DataView(raw.buffer);
    const floats = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      floats[i] = little.getFloat32(i * 4, true);
    }
    return JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + headerLength)), (_, value) =>
      value && typeof value === 'object' && '$f32' in value ? Array.from(floats.subarray(value['$f32'], value['$f32'] + value.n)) : value
    );
  }

  // 3. 统计模型排序与校准评分
  const z = (a) => {
    const m = mean(a), s = Math.max(Math.sqrt(mean(a.map(x => (x - m) ** 2))), 1e-12);
    return a.map(x => (x - m) / s);
  };
  const columnMean = (a) => a[0].map((_, i) => mean(a.map(r => r[i])));
  const median = (a) => {
    const v = [...a].sort((x, y) => x - y), i = Math.floor(v.length / 2);
    return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2;
  };
  const blocks = (n) => [hellingerFeature(countNumbers(n)), orderedBlockFeature(n)];
  const transform = (b, p) => b.flatMap((v, j) =>
    norm(v.map((x, i) => (x - p[j].mean[i]) / p[j].scale[i])).map(x => x * Math.sqrt(j === 0 ? 0.75 : 0.25))
  );
  const centered = (v, p) => v.map((x, i) => (x - p.feature_mean[i]) / p.feature_scale[i]);
  const subtract = (v, b) => {
    const coefficients = b.map(row => dot(v, row));
    return v.map((x, i) => x - b.reduce((sum, row, j) => sum + coefficients[j] * row[i], 0));
  };

  const referenceNorms = new WeakMap();
  function nearest(x, references) {
    let norms = referenceNorms.get(references);
    if (!norms) { norms = references.map(r => dot(r, r)); referenceNorms.set(references, norms); }
    const xx = dot(x, x);
    return mean(references.map((r, i) => Math.max(0, xx + norms[i] - 2 * dot(x, r))).sort((a, b) => a - b).slice(0, 7));
  }

  function baseline(b, bank) {
    const h = bank.hellinger, o = bank.ordered_blocks;
    const hUnit = norm(subtract(centered(b[0], h), h.nuisance_basis));
    const marginal = h.centroids.map(row => dot(hUnit, row));
    const oCentered = centered(b[1], o), raw = norm(oCentered), projected = norm(subtract(oCentered, o.nuisance_basis));
    const templates = o.centroids.map((_, i) => Math.max(...o.environment_centroids.map(rows => dot(raw, rows[i]))));
    const nuisance = o.centroids.map(row => dot(projected, row));
    const tz = z(templates), nz = z(nuisance), ordered = z(tz.map((v, i) => 0.5 * v + 0.5 * nz[i])), mz = z(marginal);
    return mz.map((v, i) => 0.5 * v + 0.5 * ordered[i]);
  }

  function rankSharedNumbers(numbers, artifact) {
    const a = artifact.ranker, full = numbers.map(blocks);
    const ax = full.map(b => transform(b, a.full_params));
    const lda = numbers.map(n => {
      const x = transform(blocks(n.slice(0, 128)), a.head_params);
      return z(a.lda_weights.map((row, i) => dot(row, x) + a.lda_bias[i]));
    });
    const l = z(columnMean(lda)), near = z(a.references.map(ref => median(ax.map(x => -nearest(x, ref)))));
    const base = z(columnMean(full.map(b => baseline(b, a.bank))));
    const frequency = z(l.map((x, i) => 0.5 * x + 0.25 * near[i] + 0.25 * base[i]));
    const positional = z(columnMean(numbers.map(n => z(positionalDecision(n, a.positional)))));
    const ranking = frequency.map((x, i) => a.blend.frequency * x + a.blend.positional * positional[i]);
    if (!ranking.every(Number.isFinite)) throw new Error('排名计算产生无效数值');
    return ranking;
  }

  function calibrateRanking(ranking, artifact) {
    const head = artifact.calibration, binding = head?.binding;
    if (!head || !binding || head.schema !== 'shared-confidence-v2' || head.method !== 'ranking-temperature' ||
      !Number.isFinite(head.tau) || head.tau < 0.001 || head.tau > 1000 ||
      binding.base_sha256 !== artifact.base_sha256 || binding.reference_sha256 !== artifact.source_reference_sha256 ||
      binding.model_ids.length !== ranking.length || ranking.length !== artifact.model_ids.length || !ranking.every(Number.isFinite) ||
      !binding.model_ids.every((id, i) => id === artifact.model_ids[i])) return null;
    const logits = ranking.map(score => head.tau * score);
    const maximum = Math.max(...logits), weights = logits.map(value => Math.exp(value - maximum)), sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(value => value / sum);
  }

  function sequenceShape(numbers) {
    const shapes = numbers.map(n => {
      const m = mean(n), variance = mean(n.map(x => (x - m) ** 2)), steps = n.slice(1).map((x, i) => x - n[i]);
      return {
        autocorrelation: variance ? mean(steps.map((_, i) => (n[i + 1] - m) * (n[i] - m))) / variance : 1,
        small_step_share: mean(steps.map(d => Math.abs(d) <= 20 ? 1 : 0))
      };
    });
    const autocorrelation = median(shapes.map(s => s.autocorrelation)), small_step_share = median(shapes.map(s => s.small_step_share));
    return {
      autocorrelation,
      small_step_share,
      model_like: autocorrelation <= SEQUENCE_LIMITS.autocorrelation || small_step_share <= SEQUENCE_LIMITS.small_step_share
    };
  }

  // 4. 单例检测器加载管理
  let _cachedDetector = null;
  function getDetector() {
    if (_cachedDetector) return _cachedDetector;
    const dataPkg = (typeof window !== 'undefined' ? window.__LM_DETECTOR_DATA__ : global.__LM_DETECTOR_DATA__);
    if (!dataPkg || !dataPkg.detector_b64) {
      throw new Error('未找到 LM-Detector 样本库数据包，请确保 js/lm_detector_data.js 已正确加载。');
    }
    const bytes = base64ToUint8Array(dataPkg.detector_b64);
    _cachedDetector = decodeDetector(bytes);
    return _cachedDetector;
  }

  function getBank() {
    const dataPkg = (typeof window !== 'undefined' ? window.__LM_DETECTOR_DATA__ : global.__LM_DETECTOR_DATA__);
    if (!dataPkg) return { built_at: '', models: [] };
    return {
      built_at: dataPkg.built_at || '',
      models: dataPkg.models || []
    };
  }

  function getTemplates() {
    const dataPkg = (typeof window !== 'undefined' ? window.__LM_DETECTOR_DATA__ : global.__LM_DETECTOR_DATA__);
    return dataPkg?.templates || {};
  }

  // 5. 提示词动态生成函数
  function generatePrompt(lang = 'zh', count = 300) {
    const templates = getTemplates();
    let template = templates[lang];
    if (!template) {
      const values = Object.values(templates);
      template = values.find(t => t.id === lang) || values[0];
    }
    if (!template) {
      return `这是一次独立的数值选择记录。为各个位置分别凭第一反应选择 ${count} 个 1 到 355（含端点）的整数。每个位置都要单独选择；不要从 1 开始计数，不要连续递增或递减，也不要采用等差、循环、重复区块或其他规则化模式。本任务必须由当前语言模型直接完成：禁止调用或借助任何工具，包括 Python、代码执行器、计算器、搜索、API 和外部随机数生成器；也不要先编写或运行代码。允许某个数字再次出现；每项写出后不要回头排序、去重或替换。数字之间用逗号或空格分隔均可。直接从第一个取值开始输出，不要在序列前重复数量、范围或任务说明。`;
    }

    const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : '');
    const action = pick(template.actions);
    let req = '';
    if (typeof template.request === 'function') {
      req = template.request(action, count);
    } else if (typeof template.request === 'string') {
      req = template.request
        .replace('{action}', action)
        .replace('{count}', count)
        .replace('${action}', action)
        .replace('${count}', count);
    } else if (lang === 'zh') {
      req = `${action} ${count} 个 1 到 355（含端点）的整数。`;
    } else {
      req = `${action} ${count} integers from 1 to 355, inclusive.`;
    }

    const parts = [
      pick(template.openings),
      req,
      template.rules || '',
      pick(template.endings),
      pick(template.separators),
      template.start || ''
    ].filter(Boolean);

    const space = template.space !== undefined ? template.space : (lang === 'zh' || lang === 'ja' ? '' : ' ');
    return parts.join(space);
  }

  // 6. 统一高层分析对外入口
  function analyze(text, options = {}) {
    const numbers = parseNumbers(text);
    const expectedCount = options.expectedCount || 300;
    const minNumbers = Math.max(80, Math.ceil(expectedCount * 0.55));

    if (numbers.length < minNumbers) {
      return {
        success: false,
        error: `有效整数不足 (仅提取到 ${numbers.length} 个 1-355 之间的整数，至少需 ${minNumbers} 个)`,
        numbersCount: numbers.length,
        expectedCount,
        prediction: '',
        predictionName: '',
        familyName: '',
        probability: null,
        percent: '',
        ranking: [],
        diagnostics: { parsedNumbers: numbers.length, minimumNumbers: minNumbers, accepted: false }
      };
    }

    const detector = getDetector();
    const bank = getBank();
    const outputs = [{ text, expected_count: expectedCount }];

    const rawOutOfRangeCount = Array.from(String(text).matchAll(/-?\d+/g), m => Number(m[0])).filter(n => n < 1 || n > 355).length;
    const seq = sequenceShape([numbers]);

    if (!seq.model_like) {
      return {
        success: false,
        error: '相邻数字的变化方式与参考库中的大语言模型回答不同，常见于随机打乱或程序生成。未生成有效指纹排名。',
        numbersCount: numbers.length,
        expectedCount,
        prediction: '',
        predictionName: '不像语言模型回答',
        familyName: '',
        probability: null,
        percent: '',
        ranking: [],
        diagnostics: { parsedNumbers: numbers.length, minimumNumbers: minNumbers, accepted: true, sequence: seq, rawOutOfRangeCount }
      };
    }

    const rankingScores = rankSharedNumbers([numbers], detector);

    // 计算相对概率 (使用校准 tau 进行 softmax 归一化)
    const tau = (detector.calibration && Number.isFinite(detector.calibration.tau)) ? detector.calibration.tau : 1.0;
    const logits = rankingScores.map(s => tau * s);
    const maxLogit = Math.max(...logits);
    const weights = logits.map(v => Math.exp(v - maxLogit));
    const sumWeight = weights.reduce((a, b) => a + b, 0);
    const probabilities = weights.map(v => v / sumWeight);

    const order = detector.model_ids.map((_, i) => i).sort((i, j) => rankingScores[j] - rankingScores[i]);

    const results = order.map((idx, rankIdx) => {
      const modelId = detector.model_ids[idx];
      const bankModel = bank.models[idx] || {};
      const prob = probabilities[idx];
      return {
        rank: rankIdx + 1,
        model: modelId,
        displayName: bankModel.display_name || modelId,
        family: bankModel.family || '',
        familyName: bankModel.family_name || (bankModel.family ? bankModel.family.toUpperCase() : 'AI'),
        score: rankingScores[idx],
        probability: prob,
        percent: (prob * 100).toFixed(1) + '%'
      };
    });

    const top = results[0];

    return {
      success: true,
      error: null,
      numbersCount: numbers.length,
      expectedCount,
      prediction: top.model,
      predictionName: top.displayName,
      family: top.family,
      familyName: top.familyName,
      probability: top.probability,
      percent: top.percent,
      score: top.score,
      ranking: results,
      diagnostics: {
        parsedNumbers: numbers.length,
        minimumNumbers: minNumbers,
        accepted: true,
        sequence: seq,
        rawOutOfRangeCount
      },
      evidence: `根据 ${numbers.length} 个整数提取特征分布并与参考库 62 种主流模型比对，最可能为 ${top.displayName} (相对置信度 ${top.percent})。`
    };
  }

  // 7. 导出对外接口对象
  const LMDetector = {
    isReady: () => {
      const pkg = typeof window !== 'undefined' ? window.__LM_DETECTOR_DATA__ : global.__LM_DETECTOR_DATA__;
      return !!(pkg && pkg.detector_b64);
    },
    getBank,
    getModels: () => getBank().models,
    getTemplates,
    generatePrompt,
    parseNumbers,
    analyze,
    getDetector
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LMDetector;
  }
  global.LMDetector = LMDetector;

})(typeof window !== 'undefined' ? window : globalThis);
