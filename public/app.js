// 页面交互：规则、文件与扫描三块都从服务端拉取，任何一步失败都把说明显示在顶部并标到对应输入项上

const state = {
  rules: [],
  files: [],
  levels: [],
  statuses: [],
  fileTypes: [],
  ruleLevels: [],
  ruleStatuses: [],
  ruleFileTypes: [],
  editingRuleId: '',
  editingFileId: '',
  lastScan: null,
  dismissTarget: null,
  lastInspection: null,
};

const el = (id) => document.getElementById(id);

// 统一的请求入口：出错时把服务端给的错误码、说明与出错位置一起抛出去
async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (err) {
    payload = null;
  }
  if (!res.ok) {
    const error = (payload && payload.error) || {};
    const failure = new Error(error.message || `请求失败（状态码 ${res.status}）`);
    failure.code = error.code || '';
    failure.field = error.field || '';
    throw failure;
  }
  return payload;
}

function notify(message, kind) {
  const box = el('notice');
  box.textContent = message;
  box.className = `notice ${kind === 'ok' ? 'ok' : 'error'}`;
}

function clearNotice() {
  const box = el('notice');
  box.className = 'notice hidden';
  box.textContent = '';
}

function clearFieldMarks() {
  document.querySelectorAll('.invalid').forEach((node) => node.classList.remove('invalid'));
}

// 把出错位置标到具体输入项上：规则区与文件区共用一套标记
function markField(field) {
  if (!field) return;
  const target = document.querySelector(`[data-field="${field}"]`);
  if (!target) return;
  target.classList.add('invalid');
  const input = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'
    ? target
    : target.querySelector('input, select, textarea');
  if (input) input.focus();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function levelClass(level) {
  if (level === '错误') return 'lv-error';
  if (level === '警告') return 'lv-warn';
  return 'lv-hint';
}

const OPERATOR_KEY = 'check-hits-operator';

function currentOperator() {
  return el('operator').value.trim();
}

function restoreOperator() {
  el('operator').value = window.localStorage.getItem(OPERATOR_KEY) || '';
}

async function loadHealth() {
  try {
    await request('/api/health');
    el('health').textContent = '服务正常';
    el('health').className = 'health ok';
  } catch (err) {
    el('health').textContent = '服务连不上';
    el('health').className = 'health bad';
  }
}

async function loadRules() {
  const params = new URLSearchParams();
  const level = el('rule-filter-level').value;
  const status = el('rule-filter-status').value;
  const fileType = el('rule-filter-type').value;
  const keyword = el('rule-filter-keyword').value.trim();
  if (level) params.set('level', level);
  if (status) params.set('status', status);
  if (fileType) params.set('fileType', fileType);
  if (keyword) params.set('keyword', keyword);
  const query = params.toString();
  const payload = await request(`/api/rules${query ? `?${query}` : ''}`);
  state.rules = payload.rules || [];
  state.levels = payload.levels || [];
  state.statuses = payload.statuses || [];
  state.fileTypes = payload.fileTypes || [];
  renderRuleFilters();
  renderRules();
  renderScanRuleOptions();
}

async function loadFiles() {
  const params = new URLSearchParams();
  const type = el('file-filter-type').value;
  const keyword = el('file-filter-keyword').value.trim();
  if (type) params.set('type', type);
  if (keyword) params.set('keyword', keyword);
  const query = params.toString();
  const payload = await request(`/api/files${query ? `?${query}` : ''}`);
  state.files = payload.files || [];
  state.ruleFileTypes = payload.fileTypes || [];
  renderFileFilters();
  renderFiles();
  renderScanFileOptions();
}

function renderRuleFilters() {
  const levelSelect = el('rule-filter-level');
  const levelCurrent = levelSelect.value;
  levelSelect.innerHTML = '<option value="">全部级别</option>'
    + state.levels.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.levels.includes(levelCurrent)) levelSelect.value = levelCurrent;

  const statusSelect = el('rule-filter-status');
  const statusCurrent = statusSelect.value;
  statusSelect.innerHTML = '<option value="">全部状态</option>'
    + state.statuses.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.statuses.includes(statusCurrent)) statusSelect.value = statusCurrent;

  const typeSelect = el('rule-filter-type');
  const typeCurrent = typeSelect.value;
  typeSelect.innerHTML = '<option value="">全部适用文件类型</option>'
    + state.fileTypes.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.fileTypes.includes(typeCurrent)) typeSelect.value = typeCurrent;

  const formLevel = el('rule-level');
  const formLevelCurrent = formLevel.value;
  formLevel.innerHTML = state.levels.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.levels.includes(formLevelCurrent)) formLevel.value = formLevelCurrent;

  const formStatus = el('rule-status');
  const formStatusCurrent = formStatus.value;
  formStatus.innerHTML = state.statuses.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.statuses.includes(formStatusCurrent)) formStatus.value = formStatusCurrent;

  const formType = el('rule-file-type');
  const formTypeCurrent = formType.value;
  formType.innerHTML = state.fileTypes.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.fileTypes.includes(formTypeCurrent)) formType.value = formTypeCurrent;

  const scanLevel = el('scan-level');
  const scanLevelCurrent = scanLevel.value;
  scanLevel.innerHTML = '<option value="">全部级别</option>'
    + state.levels.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.levels.includes(scanLevelCurrent)) scanLevel.value = scanLevelCurrent;
}

function renderFileFilters() {
  const typeSelect = el('file-filter-type');
  const current = typeSelect.value;
  typeSelect.innerHTML = '<option value="">全部类型</option>'
    + state.ruleFileTypes.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.ruleFileTypes.includes(current)) typeSelect.value = current;
}

function renderScanRuleOptions() {
  const select = el('scan-rule');
  const current = select.value;
  select.innerHTML = '<option value="">全部规则</option>'
    + state.rules.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} ${escapeHtml(item.name)}</option>`).join('');
  if (state.rules.some((item) => item.id === current)) select.value = current;
}

function renderScanFileOptions() {
  const select = el('scan-file');
  const current = select.value;
  select.innerHTML = '<option value="">全部文件</option>'
    + state.files.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.path)}</option>`).join('');
  if (state.files.some((item) => item.id === current)) select.value = current;
}

function renderRules() {
  const body = el('rule-body');
  body.innerHTML = state.rules.map((item) => `<tr>
      <td class="mono">${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td><span class="tag ${levelClass(item.level)}">${escapeHtml(item.level)}</span></td>
      <td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.fileType)}</td>
      <td class="mono">${escapeHtml(item.pattern)}</td>
      <td class="note-cell">${escapeHtml(item.note)}</td>
      <td class="mono">${escapeHtml(formatTime(item.updatedAt))}</td>
      <td class="actions">
        <button type="button" class="link" data-rule-edit="${escapeHtml(item.id)}">编辑</button>
        <button type="button" class="link danger" data-rule-delete="${escapeHtml(item.id)}">删除</button>
      </td>
    </tr>`).join('');
  el('rule-empty').classList.toggle('hidden', state.rules.length > 0);
}

function renderFiles() {
  const body = el('file-body');
  body.innerHTML = state.files.map((item) => `<tr>
      <td class="mono">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${item.lineCount} 行</td>
      <td class="note-cell">${escapeHtml(item.note)}</td>
      <td class="mono">${escapeHtml(formatTime(item.updatedAt))}</td>
      <td class="actions">
        <button type="button" class="link" data-file-view="${escapeHtml(item.id)}">看内容</button>
        <button type="button" class="link" data-file-edit="${escapeHtml(item.id)}">编辑</button>
        <button type="button" class="link danger" data-file-delete="${escapeHtml(item.id)}">删除</button>
      </td>
    </tr>`).join('');
  el('file-empty').classList.toggle('hidden', state.files.length > 0);
}

function openRuleForm(rule) {
  state.editingRuleId = rule ? rule.id : '';
  el('rule-form-title').textContent = rule ? `编辑规则：${rule.code}` : '新建规则';
  el('rule-code').value = rule ? rule.code : '';
  el('rule-name').value = rule ? rule.name : '';
  el('rule-level').value = rule ? rule.level : (state.levels[0] || '提示');
  el('rule-status').value = rule ? rule.status : (state.statuses[0] || '启用');
  el('rule-file-type').value = rule ? rule.fileType : (state.fileTypes[0] || '全部');
  el('rule-pattern').value = rule ? rule.pattern : '';
  el('rule-note').value = rule ? rule.note : '';
  el('rule-form').classList.remove('hidden');
  el('rule-code').focus();
}

function closeRuleForm() {
  state.editingRuleId = '';
  el('rule-form').classList.add('hidden');
  clearFieldMarks();
}

function openFileForm(file) {
  state.editingFileId = file ? file.id : '';
  el('file-form-title').textContent = file ? `编辑文件：${file.path}` : '收录新文件';
  el('file-path').value = file ? file.path : '';
  el('file-content').value = file ? file.content : '';
  el('file-note').value = file ? file.note : '';
  el('file-form').classList.remove('hidden');
  el('file-path').focus();
}

function closeFileForm() {
  state.editingFileId = '';
  el('file-form').classList.add('hidden');
  clearFieldMarks();
}

async function showFileContent(id) {
  clearNotice();
  try {
    const file = await request(`/api/files/${encodeURIComponent(id)}`);
    const preview = el('file-preview');
    preview.textContent = `${file.path}（${file.lineCount} 行）\n${'─'.repeat(40)}\n${file.content}`;
    preview.classList.remove('hidden');
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function submitRule(event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  const payload = {
    code: el('rule-code').value,
    name: el('rule-name').value,
    level: el('rule-level').value,
    status: el('rule-status').value,
    fileType: el('rule-file-type').value,
    pattern: el('rule-pattern').value,
    note: el('rule-note').value,
  };
  const editing = state.editingRuleId;
  try {
    if (editing) {
      await request(`/api/rules/${encodeURIComponent(editing)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      notify('规则已保存', 'ok');
    } else {
      await request('/api/rules', { method: 'POST', body: JSON.stringify(payload) });
      notify('规则已新增', 'ok');
    }
    closeRuleForm();
    await loadRules();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

async function submitFile(event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  const payload = {
    path: el('file-path').value,
    content: el('file-content').value,
    note: el('file-note').value,
  };
  const editing = state.editingFileId;
  try {
    if (editing) {
      await request(`/api/files/${encodeURIComponent(editing)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      notify('文件已保存', 'ok');
    } else {
      await request('/api/files', { method: 'POST', body: JSON.stringify(payload) });
      notify('文件已收录', 'ok');
    }
    closeFileForm();
    await loadFiles();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

// 扫一遍，把概要与命中清单都画出来
async function runScan() {
  clearNotice();
  const body = {
    ruleId: el('scan-rule').value,
    fileId: el('scan-file').value,
    level: el('scan-level').value,
  };
  try {
    const result = await request('/api/scan', { method: 'POST', body: JSON.stringify(body) });
    state.lastScan = result;
    renderScan(result);
  } catch (err) {
    notify(err.message, 'error');
  }
}

function renderScan(result) {
  el('scan-meta').textContent = `扫描时刻 ${formatTime(result.scannedAt)}　参与比对的规则 ${result.rulesUsed} 条（启用共 ${result.enabledRules} 条）　范围里的文件 ${result.filesInScope} 个（清单共 ${result.filesTotal} 个）`;

  const warningBox = el('scan-warning');
  if (result.warning) {
    warningBox.textContent = result.warning;
    warningBox.classList.remove('hidden');
  } else {
    warningBox.classList.add('hidden');
    warningBox.textContent = '';
  }

  const summaryBox = el('scan-summary');
  const levelText = Object.keys(result.summary.byLevel)
    .map((key) => `${key} ${result.summary.byLevel[key]} 条`)
    .join('　');
  const ruleText = result.summary.byRule
    .map((item) => `${item.code} ${item.count} 条`)
    .join('　') || '没有规则命中';
  const fileText = result.summary.byFile
    .map((item) => `${item.path} ${item.count} 条`)
    .join('　') || '没有文件命中';
  summaryBox.innerHTML = `
    <div class="summary-line"><strong>一共命中 ${result.summary.total} 条</strong>　${escapeHtml(levelText)}</div>
    <div class="summary-line">按规则：${escapeHtml(ruleText)}</div>
    <div class="summary-line">按文件：${escapeHtml(fileText)}</div>`;
  summaryBox.classList.remove('hidden');

  const body = el('hit-body');
  body.innerHTML = result.hits.map((hit, index) => `<tr>
      <td class="mono">${escapeHtml(hit.code)}</td>
      <td><span class="tag ${levelClass(hit.level)}">${escapeHtml(hit.level)}</span></td>
      <td>${escapeHtml(hit.ruleName)}</td>
      <td class="mono">${escapeHtml(hit.path)}</td>
      <td class="mono">${hit.lineNo}</td>
      <td class="mono line-cell">${escapeHtml(hit.lineText)}</td>
      <td class="actions">${hit.dismissal
        ? `<span class="tag lv-hint" title="${escapeHtml(hit.dismissal.note)}">已忽略 · 期限 ${escapeHtml(hit.dismissal.reviewBy)}</span>`
        : `<button type="button" class="link" data-hit-dismiss="${index}">标为忽略</button>`}</td>
    </tr>`).join('');
  el('hit-empty').classList.toggle('hidden', result.hits.length > 0);
}

// 标为忽略：记下当前点的是哪一条命中，复核期限与备注由表单收集
function openDismissForm(hit) {
  state.dismissTarget = { ruleId: hit.ruleId, fileId: hit.fileId, lineNo: hit.lineNo };
  el('dismiss-form-title').textContent = `标为忽略：${hit.code} · ${hit.path} · 第 ${hit.lineNo} 行`;
  el('dismiss-review-by').value = '';
  el('dismiss-note').value = '';
  el('dismiss-form').classList.remove('hidden');
  el('dismiss-review-by').focus();
}

function closeDismissForm() {
  state.dismissTarget = null;
  el('dismiss-form').classList.add('hidden');
  clearFieldMarks();
}

async function submitDismiss(event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  if (!state.dismissTarget) return;
  const payload = {
    ...state.dismissTarget,
    reviewBy: el('dismiss-review-by').value,
    note: el('dismiss-note').value,
  };
  try {
    await request('/api/dismissals', { method: 'POST', body: JSON.stringify(payload) });
    closeDismissForm();
    await runScan();
    notify('这条命中已标为忽略', 'ok');
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

// 巡检的五类清单：每一类有自己的表头与行画法，条目里都带上所属规则与具体数字
const INSPECT_GROUPS = [
  {
    key: 'disabledSinceCreation',
    title: '建好之后一直是停用的',
    heads: ['编码', '名称', '级别', '适用文件类型', '建好时间', '已停用'],
    row: (item) => `
      <td class="mono">${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td><span class="tag ${levelClass(item.level)}">${escapeHtml(item.level)}</span></td>
      <td>${escapeHtml(item.fileType)}</td>
      <td class="mono">${escapeHtml(formatTime(item.createdAt))}</td>
      <td>${item.disabledDays} 天</td>`,
  },
  {
    key: 'enabledWithoutHits',
    title: '启用着但从来没有产生过命中的',
    heads: ['编码', '名称', '级别', '适用文件类型', '匹配写法', '命中条数'],
    row: (item) => `
      <td class="mono">${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td><span class="tag ${levelClass(item.level)}">${escapeHtml(item.level)}</span></td>
      <td>${escapeHtml(item.fileType)}</td>
      <td class="mono">${escapeHtml(item.pattern)}</td>
      <td>${item.hitCount} 条</td>`,
  },
  {
    key: 'duplicatePattern',
    title: '匹配写法与另一条启用规则完全一样的',
    heads: ['编码', '名称', '状态', '匹配写法', '写法相同的启用规则', '条数'],
    row: (item) => `
      <td class="mono">${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td class="mono">${escapeHtml(item.pattern)}</td>
      <td class="mono">${escapeHtml(item.enabledSameCodes.join('、'))}</td>
      <td>${item.enabledSameCount} 条</td>`,
  },
  {
    key: 'staleRules',
    title: '改动时间在很久以前的',
    heads: ['编码', '名称', '级别', '状态', '上次改动', '没改动'],
    row: (item) => `
      <td class="mono">${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td><span class="tag ${levelClass(item.level)}">${escapeHtml(item.level)}</span></td>
      <td>${escapeHtml(item.status)}</td>
      <td class="mono">${escapeHtml(formatTime(item.updatedAt))}</td>
      <td>${item.daysSinceUpdated} 天</td>`,
  },
  {
    key: 'overdueDismissals',
    title: '标记了忽略但复核期限已经过去还没处理的',
    heads: ['规则编码', '规则名称', '文件', '行号', '复核期限', '已逾期', '备注', '操作'],
    row: (item) => `
      <td class="mono">${escapeHtml(item.code || '（规则已删除）')}</td>
      <td>${escapeHtml(item.ruleName || '—')}</td>
      <td class="mono">${escapeHtml(item.path || '（文件已移出）')}</td>
      <td class="mono">${item.lineNo}</td>
      <td class="mono">${escapeHtml(item.reviewBy)}</td>
      <td>${item.overdueDays} 天</td>
      <td class="note-cell">${escapeHtml(item.note)}</td>
      <td class="actions"><button type="button" class="link" data-dismiss-handle="${escapeHtml(item.id)}">标为已处理</button></td>`,
  },
];

// 巡检一次：整体分布与五类清单一起画出来
async function runInspection() {
  clearNotice();
  clearFieldMarks();
  const params = new URLSearchParams();
  const limit = el('inspect-limit').value.trim();
  const staleDays = el('inspect-stale-days').value.trim();
  if (limit) params.set('limit', limit);
  if (staleDays) params.set('staleDays', staleDays);
  const query = params.toString();
  try {
    const result = await request(`/api/inspection${query ? `?${query}` : ''}`);
    state.lastInspection = result;
    renderInspection(result);
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

function renderInspection(result) {
  el('inspect-meta').textContent = `巡检时刻 ${formatTime(result.generatedAt)}　规则总条数 ${result.rulesTotal} 条　每类最多显示 ${result.limit} 条　超过 ${result.staleDays} 天没改动算很久`;

  const overviewLine = (label, items) => `${label}：`
    + items.map((item) => `${item.value} ${item.count} 条（占 ${item.percent}%）`).join('　');
  const overviewBox = el('inspect-overview');
  overviewBox.innerHTML = `
    <div class="summary-line"><strong>占比按规则总条数 ${result.rulesTotal} 条计算</strong></div>
    <div class="summary-line">${escapeHtml(overviewLine('按级别', result.overview.byLevel))}</div>
    <div class="summary-line">${escapeHtml(overviewLine('按状态', result.overview.byStatus))}</div>
    <div class="summary-line">${escapeHtml(overviewLine('按适用文件类型', result.overview.byFileType))}</div>`;
  overviewBox.classList.remove('hidden');

  el('inspect-lists').innerHTML = INSPECT_GROUPS.map((group) => {
    const data = result.watchlists[group.key];
    const head = `<h3>${escapeHtml(group.title)}<span class="inspect-count">共 ${data.total} 条</span></h3>`;
    if (!data.items.length) {
      return `<div class="inspect-group">${head}<p class="empty-tip">这一类没有要盯的</p></div>`;
    }
    const table = `<div class="table-wrap"><table class="grid">
        <thead><tr>${group.heads.map((head2) => `<th>${escapeHtml(head2)}</th>`).join('')}</tr></thead>
        <tbody>${data.items.map((item) => `<tr>${group.row(item)}</tr>`).join('')}</tbody>
      </table></div>`;
    const more = data.total > data.items.length
      ? `<p class="inspect-more">一共 ${data.total} 条，这里只显示前 ${data.items.length} 条，把条数上限调大能看全</p>`
      : '';
    return `<div class="inspect-group">${head}${table}${more}</div>`;
  }).join('');
}

// 复核处理：标成已处理之后刷新巡检，命中清单里那条忽略标注也一并更新
async function handleDismissal(id) {
  clearNotice();
  try {
    await request(`/api/dismissals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: '已处理' }) });
    await runInspection();
    if (state.lastScan) await runScan();
    notify('这条忽略记录已标为已处理', 'ok');
  } catch (err) {
    notify(err.message, 'error');
  }
}

// 列表上的操作用事件委托统一处理，列表重绘之后不需要重新绑定
document.addEventListener('click', async (event) => {
  const node = event.target.closest('button');
  if (!node) return;

  if (node.dataset.ruleEdit) {
    clearNotice();
    const found = state.rules.find((item) => item.id === node.dataset.ruleEdit);
    if (found) openRuleForm(found);
    return;
  }

  if (node.dataset.ruleDelete) {
    clearNotice();
    const found = state.rules.find((item) => item.id === node.dataset.ruleDelete);
    if (!window.confirm(`确定删除规则 ${found ? found.code : ''} 吗？`)) return;
    try {
      await request(`/api/rules/${encodeURIComponent(node.dataset.ruleDelete)}`, { method: 'DELETE' });
      if (state.editingRuleId === node.dataset.ruleDelete) closeRuleForm();
      notify('规则已删除', 'ok');
      await loadRules();
    } catch (err) {
      notify(err.message, 'error');
    }
    return;
  }

  if (node.dataset.fileView) {
    await showFileContent(node.dataset.fileView);
    return;
  }

  if (node.dataset.fileEdit) {
    clearNotice();
    try {
      const file = await request(`/api/files/${encodeURIComponent(node.dataset.fileEdit)}`);
      openFileForm(file);
    } catch (err) {
      notify(err.message, 'error');
    }
    return;
  }

  if (node.dataset.fileDelete) {
    clearNotice();
    const found = state.files.find((item) => item.id === node.dataset.fileDelete);
    if (!window.confirm(`确定把 ${found ? found.path : ''} 移出清单吗？`)) return;
    try {
      await request(`/api/files/${encodeURIComponent(node.dataset.fileDelete)}`, { method: 'DELETE' });
      if (state.editingFileId === node.dataset.fileDelete) closeFileForm();
      el('file-preview').classList.add('hidden');
      notify('文件已移出清单', 'ok');
      await loadFiles();
    } catch (err) {
      notify(err.message, 'error');
    }
    return;
  }

  if (node.dataset.hitDismiss !== undefined && node.dataset.hitDismiss !== '') {
    clearNotice();
    const hit = state.lastScan && state.lastScan.hits[Number(node.dataset.hitDismiss)];
    if (hit) openDismissForm(hit);
    return;
  }

  if (node.dataset.dismissHandle) {
    await handleDismissal(node.dataset.dismissHandle);
  }
});

el('rule-form').addEventListener('submit', submitRule);
el('file-form').addEventListener('submit', submitFile);
el('rule-new').addEventListener('click', () => {
  clearNotice();
  openRuleForm(null);
});
el('rule-cancel').addEventListener('click', closeRuleForm);
el('file-new').addEventListener('click', () => {
  clearNotice();
  openFileForm(null);
});
el('file-cancel').addEventListener('click', closeFileForm);
el('rule-filter-apply').addEventListener('click', () => {
  clearNotice();
  loadRules().catch((err) => notify(err.message, 'error'));
});
el('rule-filter-reset').addEventListener('click', () => {
  el('rule-filter-level').value = '';
  el('rule-filter-status').value = '';
  el('rule-filter-type').value = '';
  el('rule-filter-keyword').value = '';
  loadRules().catch((err) => notify(err.message, 'error'));
});
el('rule-refresh').addEventListener('click', () => {
  clearNotice();
  loadRules()
    .then(loadFiles)
    .catch((err) => notify(err.message, 'error'));
});
el('file-filter-apply').addEventListener('click', () => {
  clearNotice();
  loadFiles().catch((err) => notify(err.message, 'error'));
});
el('file-filter-reset').addEventListener('click', () => {
  el('file-filter-type').value = '';
  el('file-filter-keyword').value = '';
  loadFiles().catch((err) => notify(err.message, 'error'));
});
el('scan-run').addEventListener('click', runScan);
el('dismiss-form').addEventListener('submit', submitDismiss);
el('dismiss-cancel').addEventListener('click', closeDismissForm);
el('inspect-run').addEventListener('click', runInspection);
el('rule-filter-level').addEventListener('change', () => {
  loadRules().catch((err) => notify(err.message, 'error'));
});
el('rule-filter-status').addEventListener('change', () => {
  loadRules().catch((err) => notify(err.message, 'error'));
});
el('operator').addEventListener('change', () => {
  window.localStorage.setItem(OPERATOR_KEY, currentOperator());
});

// 页面打开时先把规则与文件都拉一遍，扫描的范围下拉依赖这两份清单
restoreOperator();
loadHealth();
loadRules()
  .then(loadFiles)
  .catch((err) => notify(err.message, 'error'));
