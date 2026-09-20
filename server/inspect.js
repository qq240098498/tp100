const { load, LEVELS, STATUSES, FILE_TYPES, DISMISSAL_STATUSES } = require('./store');
const { scan } = require('./scan');
const { ApiError, pickText } = require('./errors');

// 巡检参数的默认与上限：条数上限管每一类清单，多久没改动算很久按天算
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;
const DEFAULT_STALE_DAYS = 90;
const MAX_STALE_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

// 页面传过来的都是文本，只接受正整数，超出范围当场指到对应的输入项上
function readInteger(value, fallback, min, max, code, message, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = typeof value === 'number' ? String(value) : pickText(value);
  if (!/^\d+$/.test(text)) throw new ApiError(400, code, message, field);
  const num = Number(text);
  if (num < min || num > max) throw new ApiError(400, code, message, field);
  return num;
}

// 占比统一按规则总条数做分母、四舍五入到整数百分比，三个维度都用这一个口径
function percentOf(count, total) {
  return total > 0 ? Math.round((count * 100) / total) : 0;
}

function daysSince(isoText, nowMs) {
  const time = new Date(isoText).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((nowMs - time) / DAY_MS));
}

function breakdown(rules, key, values) {
  return values.map((value) => {
    const count = rules.filter((rule) => rule[key] === value).length;
    return { value, count, percent: percentOf(count, rules.length) };
  });
}

// 每一类清单都按同一形状返回：total 是完整条数，items 按条数上限截断，取不满就按实际条数给
function cap(list, limit) {
  return { total: list.length, items: list.slice(0, limit) };
}

function pickRuleBrief(rule) {
  return {
    id: rule.id,
    code: rule.code,
    name: rule.name,
    level: rule.level,
    status: rule.status,
    fileType: rule.fileType,
  };
}

// 巡检一次：先按级别、状态、适用文件类型看整体分布，再列出五类需要盯住的条目
function inspect(options) {
  const input = options && typeof options === 'object' ? options : {};
  const limit = readInteger(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, 'LIMIT_INVALID', `条数上限要写成 1 到 ${MAX_LIMIT} 之间的整数`, 'inspectLimit');
  const staleDays = readInteger(input.staleDays, DEFAULT_STALE_DAYS, 1, MAX_STALE_DAYS, 'STALE_DAYS_INVALID', `多久没改动算很久要写成 1 到 ${MAX_STALE_DAYS} 之间的整数`, 'inspectStaleDays');

  const data = load();
  const rules = data.rules;
  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);

  const overview = {
    byLevel: breakdown(rules, 'level', LEVELS),
    byStatus: breakdown(rules, 'status', STATUSES),
    byFileType: breakdown(rules, 'fileType', FILE_TYPES),
  };

  // 建好之后一直是停用的：当前是停用，而且建好之后一次都没再改过
  const disabledSinceCreation = rules
    .filter((rule) => rule.status === STATUSES[1] && rule.createdAt === rule.updatedAt)
    .map((rule) => ({
      ...pickRuleBrief(rule),
      createdAt: rule.createdAt,
      disabledDays: daysSince(rule.createdAt, nowMs),
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : (a.code < b.code ? -1 : 1)));

  // 启用着但从来没有产生过命中的：按当前收录的文件全量扫一遍，一条命中都没有的启用规则
  const hitRuleIds = new Set(scan({}).hits.map((hit) => hit.ruleId));
  const enabledWithoutHits = rules
    .filter((rule) => rule.status === STATUSES[0] && !hitRuleIds.has(rule.id))
    .map((rule) => ({
      ...pickRuleBrief(rule),
      pattern: rule.pattern,
      hitCount: 0,
    }))
    .sort((a, b) => (a.code < b.code ? -1 : 1));

  // 匹配写法与另一条启用规则完全一样的：逐条核对，存在另一条启用规则写着一模一样的匹配写法
  const enabledByPattern = new Map();
  rules.filter((rule) => rule.status === STATUSES[0]).forEach((rule) => {
    if (!enabledByPattern.has(rule.pattern)) enabledByPattern.set(rule.pattern, []);
    enabledByPattern.get(rule.pattern).push(rule);
  });
  const duplicatePattern = rules
    .map((rule) => ({
      rule,
      others: (enabledByPattern.get(rule.pattern) || []).filter((other) => other.id !== rule.id),
    }))
    .filter((entry) => entry.others.length > 0)
    .map((entry) => ({
      ...pickRuleBrief(entry.rule),
      pattern: entry.rule.pattern,
      enabledSameCount: entry.others.length,
      enabledSameCodes: entry.others.map((other) => other.code).sort(),
    }))
    .sort((a, b) => (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : (a.code < b.code ? -1 : 1)));

  // 改动时间在很久以前的：距离上次改动达到指定天数的规则，不限状态
  const staleRules = rules
    .map((rule) => ({ rule, days: daysSince(rule.updatedAt, nowMs) }))
    .filter((entry) => entry.days >= staleDays)
    .map((entry) => ({
      ...pickRuleBrief(entry.rule),
      updatedAt: entry.rule.updatedAt,
      daysSinceUpdated: entry.days,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : (a.code < b.code ? -1 : 1)));

  // 标记了忽略但复核期限已经过去还没处理的：还是忽略状态、复核期限早于今天的条目
  const overdueDismissals = data.dismissals
    .filter((item) => item.status === DISMISSAL_STATUSES[0] && item.reviewBy < today)
    .map((item) => {
      const rule = rules.find((entry) => entry.id === item.ruleId);
      const file = data.files.find((entry) => entry.id === item.fileId);
      return {
        id: item.id,
        ruleId: item.ruleId,
        code: rule ? rule.code : '',
        ruleName: rule ? rule.name : '',
        fileId: item.fileId,
        path: file ? file.path : '',
        lineNo: item.lineNo,
        reviewBy: item.reviewBy,
        overdueDays: daysSince(`${item.reviewBy}T00:00:00.000Z`, nowMs),
        note: item.note,
      };
    })
    .sort((a, b) => (a.reviewBy < b.reviewBy ? -1 : a.reviewBy > b.reviewBy ? 1 : (a.id < b.id ? -1 : 1)));

  return {
    generatedAt: new Date(nowMs).toISOString(),
    limit,
    staleDays,
    rulesTotal: rules.length,
    overview,
    watchlists: {
      disabledSinceCreation: cap(disabledSinceCreation, limit),
      enabledWithoutHits: cap(enabledWithoutHits, limit),
      duplicatePattern: cap(duplicatePattern, limit),
      staleRules: cap(staleRules, limit),
      overdueDismissals: cap(overdueDismissals, limit),
    },
  };
}

module.exports = { inspect, percentOf };
