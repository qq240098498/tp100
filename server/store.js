const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const TEMP_FILE = path.join(DATA_DIR, 'db.json.tmp');

const LEVELS = ['提示', '警告', '错误'];
const STATUSES = ['启用', '停用'];
const FILE_TYPES = ['全部', 'js', 'sh', 'md', 'yml'];
const DISMISSAL_STATUSES = ['忽略', '已处理'];
const MAX_CODE_LENGTH = 20;
const MAX_RULE_NAME_LENGTH = 40;
const MAX_PATTERN_LENGTH = 60;
const MAX_NOTE_LENGTH = 200;
const MAX_PATH_LENGTH = 120;
const MAX_CONTENT_LENGTH = 4000;

// 检查规则的初始数据。十二条规则里有两条是停用的，
// 有一条启用的规则在现有文件里一条命中都没有，用来观察从未命中的规则
function seedRules() {
  const at = '2026-09-02T02:00:00.000Z';
  return [
    { id: 'rule-1001', code: 'CODE-001', name: '禁止提交调试输出', level: '警告', status: '启用', fileType: 'js', pattern: 'console.log', note: '上线前要换成统一日志', createdAt: at, updatedAt: at },
    { id: 'rule-1002', code: 'CODE-002', name: '变量声明统一用 let 或 const', level: '错误', status: '启用', fileType: 'js', pattern: 'var ', note: '老代码里还有不少', createdAt: at, updatedAt: at },
    { id: 'rule-1003', code: 'CODE-003', name: '待办事项需要收口', level: '提示', status: '启用', fileType: '全部', pattern: 'TODO', note: '带人名与期限的可以留', createdAt: at, updatedAt: at },
    { id: 'rule-1004', code: 'CODE-004', name: '禁止动态执行代码', level: '错误', status: '启用', fileType: '全部', pattern: 'eval(', note: '', createdAt: at, updatedAt: at },
    { id: 'rule-1005', code: 'CODE-005', name: '禁止把口令写进代码', level: '错误', status: '启用', fileType: '全部', pattern: 'password =', note: '口令一律走统一配置', createdAt: at, updatedAt: at },
    { id: 'rule-1006', code: 'CODE-006', name: '空捕获块要写清原因', level: '警告', status: '启用', fileType: 'js', pattern: 'catch (e) {}', note: '', createdAt: at, updatedAt: at },
    { id: 'rule-1007', code: 'CODE-007', name: '调试开关上线前要关掉', level: '警告', status: '停用', fileType: 'js', pattern: 'DEBUG = true', note: '等联调结束再打开', createdAt: at, updatedAt: at },
    { id: 'rule-1008', code: 'CODE-008', name: '数据库地址不许写死在代码里', level: '错误', status: '启用', fileType: '全部', pattern: 'postgres://', note: '', createdAt: at, updatedAt: at },
    { id: 'rule-1009', code: 'CODE-009', name: '取配置项要走统一封装', level: '提示', status: '启用', fileType: 'js', pattern: 'process.env[', note: '直接按名字取容易拼错', createdAt: at, updatedAt: at },
    { id: 'rule-1010', code: 'CODE-010', name: '遗留注释要清理', level: '提示', status: '停用', fileType: '全部', pattern: 'FIXME', note: '', createdAt: at, updatedAt: at },
    { id: 'rule-1011', code: 'CODE-011', name: '脚本里禁止直接用强制删除', level: '警告', status: '启用', fileType: 'sh', pattern: 'rm -rf', note: '脚本里改用受控的清理命令', createdAt: at, updatedAt: at },
    { id: 'rule-1012', code: 'CODE-012', name: '文档里的临时占位要删掉', level: '提示', status: '启用', fileType: 'md', pattern: '待补', note: '', createdAt: at, updatedAt: at },
  ];
}

// 纳入检查的文件。里面有干净的、有踩了好几处的，也有踩到停用规则里那个写法的
function seedFiles() {
  const at = '2026-09-02T03:00:00.000Z';
  return [
    {
      id: 'file-2001',
      path: 'src/server/api.js',
      type: 'js',
      content: [
        'const express = require("express");',
        'const router = express.Router();',
        '',
        'router.get("/users", (req, res) => {',
        '  console.log("查询用户列表");',
        '  var limit = Number(req.query.limit || 20);',
        '  // TODO 分页参数还要补校验',
        '  const parsed = eval("(" + req.query.filter + ")");',
        '  res.json({ limit, parsed });',
        '});',
        '',
        'module.exports = router;',
      ].join('\n'),
      note: '用户相关接口',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2002',
      path: 'src/server/store.js',
      type: 'js',
      content: [
        'const fs = require("fs");',
        '',
        'function dataFile() {',
        '  const dir = process.env["DATA_DIR"] || "./data";',
        '  console.log("数据目录", dir);',
        '  return dir + "/db.json";',
        '}',
        '',
        'function load() {',
        '  return JSON.parse(fs.readFileSync(dataFile(), "utf8"));',
        '}',
        '',
        'module.exports = { load };',
      ].join('\n'),
      note: '',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2003',
      path: 'src/server/user.js',
      type: 'js',
      content: [
        'const db = require("./db");',
        '',
        'const conn = "postgres://app:app@127.0.0.1:5432/member";',
        'const password = "app-2026";',
        '',
        'function findUser(id) {',
        '  try {',
        '    return db.query("select * from users where id = $1", [id]);',
        '  } catch (e) {}',
        '}',
        '',
        'module.exports = { findUser, conn, password };',
      ].join('\n'),
      note: '账号查询',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2004',
      path: 'src/server/report.js',
      type: 'js',
      content: [
        'function summarize(rows) {',
        '  var total = 0;',
        '  rows.forEach((row) => {',
        '    total += row.amount;',
        '  });',
        '  // TODO 还要区分已退款的部分',
        '  return { total, count: rows.length };',
        '}',
        '',
        'module.exports = { summarize };',
      ].join('\n'),
      note: '',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2005',
      path: 'src/web/app.js',
      type: 'js',
      content: [
        'const state = { list: [] };',
        '',
        'async function load() {',
        '  console.log("开始加载");',
        '  const res = await fetch("/api/users");',
        '  state.list = await res.json();',
        '  render();',
        '}',
        '',
        'function render() {',
        '  var box = document.getElementById("list");',
        '  box.textContent = state.list.length + " 条";',
        '}',
      ].join('\n'),
      note: '页面入口',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2006',
      path: 'src/web/format.js',
      type: 'js',
      content: [
        'const PAD = (num) => String(num).padStart(2, "0");',
        '',
        'function formatTime(value) {',
        '  const date = new Date(value);',
        '  return date.getFullYear() + "-" + PAD(date.getMonth() + 1) + "-" + PAD(date.getDate());',
        '}',
        '',
        'function formatAmount(cents) {',
        '  return (cents / 100).toFixed(2);',
        '}',
        '',
        'module.exports = { formatTime, formatAmount };',
      ].join('\n'),
      note: '格式化工具，比较干净',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2007',
      path: 'src/web/legacy/old-util.js',
      type: 'js',
      content: [
        '// FIXME 这个文件准备整体删掉，暂时先用着',
        'function pick(source, keys) {',
        '  var out = {};',
        '  keys.forEach(function (key) {',
        '    out[key] = source[key];',
        '  });',
        '  console.log("pick", keys.length);',
        '  return out;',
        '}',
        '',
        'function run(expr) {',
        '  return eval(expr);',
        '}',
        '',
        'module.exports = { pick, run };',
      ].join('\n'),
      note: '历史遗留工具',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2008',
      path: 'src/config/default.js',
      type: 'js',
      content: [
        'const DEBUG = true;',
        '',
        'const config = {',
        '  port: Number(process.env["PORT"] || 4000),',
        '  password = "member-2026",',
        '  redis: "redis://127.0.0.1:6379/0",',
        '};',
        '',
        'module.exports = config;',
      ].join('\n'),
      note: '默认配置，里面有调试开关',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2009',
      path: 'scripts/deploy.sh',
      type: 'sh',
      content: [
        '#!/usr/bin/env bash',
        'set -e',
        '',
        'APP_DIR=/opt/member',
        '',
        '# TODO 换机器之后要改掉这个路径',
        'cd "$APP_DIR"',
        'git pull --ff-only',
        'npm ci --omit=dev',
        'npm start &',
        '',
        'echo "发布完成"',
      ].join('\n'),
      note: '发布脚本',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2010',
      path: 'scripts/migrate.sh',
      type: 'sh',
      content: [
        '#!/usr/bin/env bash',
        'set -e',
        '',
        'DB_URL="postgres://app:app@127.0.0.1:5432/member"',
        '',
        'psql "$DB_URL" -f sql/2026-09-01-member.sql',
        'echo "迁移完成"',
      ].join('\n'),
      note: '迁移脚本',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2011',
      path: 'docs/readme.md',
      type: 'md',
      content: [
        '# 会员中心',
        '',
        '## 启动',
        '',
        '先装依赖再启动，端口默认 4000。',
        '',
        '## 部署',
        '',
        '待补',
        '',
        '<!-- TODO 补上回滚步骤 -->',
      ].join('\n'),
      note: '',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: 'file-2012',
      path: 'config/deploy.yml',
      type: 'yml',
      content: [
        'service: member',
        'replicas: 2',
        'database: postgres://app:app@127.0.0.1:5432/member',
        'healthcheck: /health',
        'resources:',
        '  cpu: 500m',
        '  memory: 512Mi',
      ].join('\n'),
      note: '部署描述',
      createdAt: at,
      updatedAt: at,
    },
  ];
}

// 命中条目上的忽略标记。一条已过期还没复核的、一条还没到复核期限的、
// 一条已经处理完的，用来观察巡检里复核期限已过这一档
function seedDismissals() {
  return [
    {
      id: 'dismiss-3001',
      ruleId: 'rule-1001',
      fileId: 'file-2001',
      lineNo: 5,
      reviewBy: '2026-09-10',
      note: '等统一日志方案定下来再一起改',
      status: '忽略',
      createdAt: '2026-09-05T02:00:00.000Z',
      updatedAt: '2026-09-05T02:00:00.000Z',
      handledAt: '',
    },
    {
      id: 'dismiss-3002',
      ruleId: 'rule-1003',
      fileId: 'file-2009',
      lineNo: 6,
      reviewBy: '2026-09-30',
      note: '换机器的排期在月底，到期再复核',
      status: '忽略',
      createdAt: '2026-09-06T02:00:00.000Z',
      updatedAt: '2026-09-06T02:00:00.000Z',
      handledAt: '',
    },
    {
      id: 'dismiss-3003',
      ruleId: 'rule-1008',
      fileId: 'file-2010',
      lineNo: 4,
      reviewBy: '2026-09-08',
      note: '迁移脚本专用地址，已确认保留',
      status: '已处理',
      createdAt: '2026-09-04T02:00:00.000Z',
      updatedAt: '2026-09-07T02:00:00.000Z',
      handledAt: '2026-09-07T02:00:00.000Z',
    },
  ];
}

// 把单条规则整理成固定结构，级别与状态不认识的一律回到默认值
function normalizeRule(item, fallbackIndex) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString();
  const level = LEVELS.includes(source.level) ? source.level : LEVELS[0];
  const status = STATUSES.includes(source.status) ? source.status : STATUSES[0];
  const fileType = FILE_TYPES.includes(source.fileType) ? source.fileType : FILE_TYPES[0];
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `rule-restored-${fallbackIndex + 1}`,
    code: typeof source.code === 'string' ? source.code.trim() : '',
    name: typeof source.name === 'string' ? source.name.trim() : '',
    level,
    status,
    fileType,
    pattern: typeof source.pattern === 'string' ? source.pattern : '',
    note: typeof source.note === 'string' ? source.note : '',
    createdAt,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt,
  };
}

// 把单个文件整理成固定结构，类型不在清单里的一律从路径后缀推断
function normalizeFile(item, fallbackIndex) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString();
  const filePath = typeof source.path === 'string' ? source.path.trim() : '';
  const ext = filePath.includes('.') ? filePath.split('.').pop().toLowerCase() : '';
  const type = FILE_TYPES.includes(source.type) && source.type !== '全部' ? source.type : (FILE_TYPES.includes(ext) ? ext : 'js');
  const content = typeof source.content === 'string' ? source.content : '';
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `file-restored-${fallbackIndex + 1}`,
    path: filePath,
    type,
    content,
    note: typeof source.note === 'string' ? source.note : '',
    createdAt,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt,
  };
}

// 把单条忽略记录整理成固定结构，状态不认识的一律回到忽略
function normalizeDismissal(item, fallbackIndex) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString();
  const lineNo = Number.isInteger(source.lineNo) && source.lineNo > 0 ? source.lineNo : 0;
  const status = DISMISSAL_STATUSES.includes(source.status) ? source.status : DISMISSAL_STATUSES[0];
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `dismiss-restored-${fallbackIndex + 1}`,
    ruleId: typeof source.ruleId === 'string' ? source.ruleId : '',
    fileId: typeof source.fileId === 'string' ? source.fileId : '',
    lineNo,
    reviewBy: typeof source.reviewBy === 'string' ? source.reviewBy : '',
    note: typeof source.note === 'string' ? source.note : '',
    status,
    createdAt,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt,
    handledAt: typeof source.handledAt === 'string' ? source.handledAt : '',
  };
}

// 整份数据保证规则与文件结构一致，缺编号、缺名称、缺路径的条目一律丢掉
function normalize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seed = { rules: seedRules(), files: seedFiles(), dismissals: seedDismissals() };

  const rawRules = Array.isArray(source.rules) ? source.rules : seed.rules;
  const seenRuleIds = new Set();
  const seenCodes = new Set();
  const rules = [];
  rawRules.forEach((item, index) => {
    const rule = normalizeRule(item, index);
    if (!rule.id || !rule.code || !rule.name || !rule.pattern) return;
    const lower = rule.code.toLowerCase();
    if (seenRuleIds.has(rule.id) || seenCodes.has(lower)) return;
    seenRuleIds.add(rule.id);
    seenCodes.add(lower);
    rules.push(rule);
  });

  const rawFiles = Array.isArray(source.files) ? source.files : seed.files;
  const seenFileIds = new Set();
  const seenPaths = new Set();
  const files = [];
  rawFiles.forEach((item, index) => {
    const file = normalizeFile(item, index);
    if (!file.id || !file.path) return;
    const lower = file.path.toLowerCase();
    if (seenFileIds.has(file.id) || seenPaths.has(lower)) return;
    seenFileIds.add(file.id);
    seenPaths.add(lower);
    files.push(file);
  });

  const rawDismissals = Array.isArray(source.dismissals) ? source.dismissals : seed.dismissals;
  const seenDismissalIds = new Set();
  const dismissals = [];
  rawDismissals.forEach((item, index) => {
    const dismissal = normalizeDismissal(item, index);
    if (!dismissal.id || !dismissal.ruleId || !dismissal.fileId || !dismissal.lineNo || !dismissal.reviewBy) return;
    if (seenDismissalIds.has(dismissal.id)) return;
    seenDismissalIds.add(dismissal.id);
    dismissals.push(dismissal);
  });

  return { rules, files, dismissals };
}

// 读取数据文件：文件缺失或内容损坏时回落到初始数据并立刻补写
function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return normalize(JSON.parse(raw));
  } catch (err) {
    const data = { rules: seedRules(), files: seedFiles(), dismissals: seedDismissals() };
    save(data);
    return data;
  }
}

// 先写临时文件再改名，写入中途被打断也不会把正式数据文件写坏
function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const text = `${JSON.stringify(normalize(data), null, 2)}\n`;
  fs.writeFileSync(TEMP_FILE, text, 'utf8');
  fs.renameSync(TEMP_FILE, DATA_FILE);
}

module.exports = {
  load,
  save,
  seedRules,
  seedFiles,
  seedDismissals,
  normalize,
  normalizeRule,
  normalizeFile,
  normalizeDismissal,
  LEVELS,
  STATUSES,
  FILE_TYPES,
  DISMISSAL_STATUSES,
  MAX_CODE_LENGTH,
  MAX_RULE_NAME_LENGTH,
  MAX_PATTERN_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PATH_LENGTH,
  MAX_CONTENT_LENGTH,
  DATA_FILE,
};
