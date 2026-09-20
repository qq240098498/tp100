const { load, LEVELS, STATUSES, FILE_TYPES } = require('./store');
const { ApiError, pickText } = require('./errors');
const { ruleAppliesToFile } = require('./scan');

// 每类清单的条数上限：页面可以指定，缺省 20，最大 100
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
// 多久没改动算「很久以前」
const STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// 条数上限只认 1 到 100 的整数；取不满的时候按实际条数返回，不算错
function parseLimit(value) {
  const text = pickText(value);
  if (!text) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > MAX_LIMIT) {
    throw new ApiError(400, 'LIMIT_INVALID', `条数上限要是 1 到 ${MAX_LIMIT} 之间的整数`, 'inspectLimit');
  }
  return Number(text);
}

// 占比的唯一口径：分母永远是规则总条数，保留一位小数，三个维度都走这里
function shareOf(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function daysSince(iso, now) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
}

// 启用的规则在当前文件清单上各命中多少条，比对口径与扫一遍完全一致
function countHitsByRule(rules, files) {
  const counts = new Map();
  let total = 0;
  rules.filter((rule) => rule.status === STATUSES[0]).forEach((rule) => {
    let count = 0;
    files.filter((file) => ruleAppliesToFile(rule, file)).forEach((file) => {
      file.content.split('\n').forEach((line) => {
        if (line.includes(rule.pattern)) count += 1;
      });
    });
    counts.set(rule.id, count);
    total += count;
  });
  return { counts, total };
}

// 每一类清单都给出实际总条数，条目按上限截取，取不满就按实际条数
function cap(list, limit) {
  return { count: list.length, items: list.slice(0, limit) };
}

function byCode(a, b) {
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

// 建好之后一直是停用的：状态是停用，而且建完就再没动过
function listDisabledSinceCreation(rules, now) {
  return rules
    .filter((rule) => rule.status === STATUSES[1] && rule.createdAt === rule.updatedAt)
    .map((rule) => ({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      level: rule.level,
      fileType: rule.fileType,
      pattern: rule.pattern,
      createdAt: rule.createdAt,
      daysSinceCreation: daysSince(rule.createdAt, now),
    }))
    .sort((a, b) => b.daysSinceCreation - a.daysSinceCreation || byCode(a, b));
}

// 启用着但从来没有产生过命中的
function listEnabledNoHits(rules, hitCounts, now) {
  return rules
    .filter((rule) => rule.status === STATUSES[0] && hitCounts.get(rule.id) === 0)
    .map((rule) => ({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      level: rule.level,
      fileType: rule.fileType,
      pattern: rule.pattern,
      hitCount: 0,
      createdAt: rule.createdAt,
      daysSinceCreation: daysSince(rule.createdAt, now),
    }))
    .sort(byCode);
}

// 匹配写法与另一条启用规则完全一样的：按写法分组，组里超过一条的整组列出
function listDuplicatePatterns(rules, hitCounts) {
  const groups = new Map();
  rules.filter((rule) => rule.status === STATUSES[0]).forEach((rule) => {
    if (!groups.has(rule.pattern)) groups.set(rule.pattern, []);
    groups.get(rule.pattern).push(rule);
  });
  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group) => ({
      pattern: group[0].pattern,
      ruleCount: group.length,
      rules: group.slice().sort(byCode).map((rule) => ({
        id: rule.id,
        code: rule.code,
        name: rule.name,
        level: rule.level,
        fileType: rule.fileType,
        hitCount: hitCounts.get(rule.id) || 0,
      })),
    }))
    .sort((a, b) => (a.pattern < b.pattern ? -1 : 1));
}

// 改动时间在很久以前的
function listStale(rules, now) {
  return rules
    .map((rule) => ({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      level: rule.level,
      status: rule.status,
      fileType: rule.fileType,
      updatedAt: rule.updatedAt,
      daysSinceUpdate: daysSince(rule.updatedAt, now),
    }))
    .filter((rule) => rule.daysSinceUpdate >= STALE_DAYS)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate || byCode(a, b));
}

// 标记了忽略、复核期限已经过去还没处理的；顺带看一眼那一行现在还命中不命中
function listIgnoredOverdue(ignores, rules, files, now) {
  return ignores
    .filter((ignore) => {
      if (ignore.handled) return false;
      const reviewAt = Date.parse(ignore.reviewBy);
      return !Number.isNaN(reviewAt) && reviewAt < now.getTime();
    })
    .map((ignore) => {
      const rule = rules.find((item) => item.id === ignore.ruleId);
      const file = files.find((item) => item.id === ignore.fileId);
      const line = file ? file.content.split('\n')[ignore.lineNo - 1] : undefined;
      return {
        id: ignore.id,
        ruleId: ignore.ruleId,
        code: rule ? rule.code : '',
        ruleName: rule ? rule.name : '',
        fileId: ignore.fileId,
        path: file ? file.path : '',
        lineNo: ignore.lineNo,
        note: ignore.note,
        reviewBy: ignore.reviewBy,
        daysOverdue: daysSince(ignore.reviewBy, now),
        stillHits: Boolean(rule && file && typeof line === 'string' && line.includes(rule.pattern)),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || (a.code < b.code ? -1 : 1));
}

// 看全局的巡检：总览按级别、状态、适用文件类型给条数与占比，再列出几类要盯住的清单
function inspect(options) {
  const input = options && typeof options === 'object' ? options : {};
  const limit = parseLimit(input.limit);
  const data = load();
  const now = new Date();

  const rulesTotal = data.rules.length;
  const overviewOf = (names, countOf) => names.map((name) => {
    const count = data.rules.filter(countOf(name)).length;
    return { name, count, share: shareOf(count, rulesTotal) };
  });

  const { counts: hitCounts, total: hitsTotal } = countHitsByRule(data.rules, data.files);

  return {
    generatedAt: now.toISOString(),
    limit,
    staleDays: STALE_DAYS,
    rulesTotal,
    filesTotal: data.files.length,
    enabledRules: data.rules.filter((rule) => rule.status === STATUSES[0]).length,
    hitsTotal,
    overview: {
      byLevel: overviewOf(LEVELS, (name) => (rule) => rule.level === name),
      byStatus: overviewOf(STATUSES, (name) => (rule) => rule.status === name),
      byFileType: overviewOf(FILE_TYPES, (name) => (rule) => rule.fileType === name),
    },
    watch: {
      disabledSinceCreation: cap(listDisabledSinceCreation(data.rules, now), limit),
      enabledNoHits: cap(listEnabledNoHits(data.rules, hitCounts, now), limit),
      duplicatePattern: cap(listDuplicatePatterns(data.rules, hitCounts), limit),
      stale: cap(listStale(data.rules, now), limit),
      ignoredOverdue: cap(listIgnoredOverdue(data.ignores, data.rules, data.files, now), limit),
    },
  };
}

module.exports = { inspect, parseLimit, shareOf, DEFAULT_LIMIT, MAX_LIMIT, STALE_DAYS };
