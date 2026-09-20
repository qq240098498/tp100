const crypto = require('crypto');
const { load, save, DISMISSAL_STATUSES, MAX_NOTE_LENGTH } = require('./store');
const { lineCountOf } = require('./files');
const { ApiError, pickText } = require('./errors');

// 复核期限固定写成 年-月-日，页面上是日期选择框，到这里再严格验一遍
const REVIEW_BY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateReviewBy(value) {
  const text = pickText(value);
  if (!text) throw new ApiError(400, 'REVIEW_BY_REQUIRED', '请选一下复核期限', 'dismissReviewBy');
  if (!REVIEW_BY_PATTERN.test(text)) {
    throw new ApiError(400, 'REVIEW_BY_INVALID', '复核期限要写成 年-月-日，例如 2026-10-01', 'dismissReviewBy');
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!valid) throw new ApiError(400, 'REVIEW_BY_INVALID', '复核期限要写成 年-月-日，例如 2026-10-01', 'dismissReviewBy');
  return text;
}

function validateLineNo(value, file) {
  const num = typeof value === 'number' ? value : NaN;
  if (!Number.isInteger(num) || num < 1) {
    throw new ApiError(400, 'LINE_NO_INVALID', '行号要是大于 0 的整数', 'dismissLineNo');
  }
  const max = lineCountOf(file.content);
  if (num > max) {
    throw new ApiError(400, 'LINE_NO_INVALID', `这个文件一共 ${max} 行，行号超了`, 'dismissLineNo');
  }
  return num;
}

function validateNote(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ApiError(400, 'NOTE_INVALID', '备注需要是文本', 'dismissNote');
  if (value.length > MAX_NOTE_LENGTH) {
    throw new ApiError(400, 'NOTE_TOO_LONG', `备注不能超过 ${MAX_NOTE_LENGTH} 个字符`, 'dismissNote');
  }
  return value.trim();
}

// 把一条命中标为忽略：规则、文件、行号要对得上，同一条命中不能重复标
function createDismissal(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = load();

  const ruleId = pickText(input.ruleId);
  const rule = data.rules.find((item) => item.id === ruleId);
  if (!rule) throw new ApiError(404, 'RULE_NOT_FOUND', '这条规则不存在或已被删除', '');

  const fileId = pickText(input.fileId);
  const file = data.files.find((item) => item.id === fileId);
  if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', '这个文件不存在或已被移出清单', '');

  const lineNo = validateLineNo(input.lineNo, file);
  const reviewBy = validateReviewBy(input.reviewBy);
  const note = validateNote(input.note);

  const duplicated = data.dismissals.find((item) => item.status === DISMISSAL_STATUSES[0]
    && item.ruleId === ruleId && item.fileId === fileId && item.lineNo === lineNo);
  if (duplicated) {
    throw new ApiError(409, 'DISMISSAL_DUPLICATED', `这条命中已经标过忽略了，复核期限是 ${duplicated.reviewBy}`, '');
  }

  const now = new Date().toISOString();
  const created = {
    id: crypto.randomUUID(),
    ruleId,
    fileId,
    lineNo,
    reviewBy,
    note,
    status: DISMISSAL_STATUSES[0],
    createdAt: now,
    updatedAt: now,
    handledAt: '',
  };
  data.dismissals.push(created);
  save(data);
  return created;
}

// 复核处理：只支持把忽略标成已处理，处理过的不允许重复处理
function handleDismissal(id, payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = load();
  const found = data.dismissals.find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'DISMISSAL_NOT_FOUND', '这条忽略记录不存在或已被删掉', '');

  const status = pickText(input.status);
  if (status !== DISMISSAL_STATUSES[1]) {
    throw new ApiError(400, 'STATUS_INVALID', `状态只能改成 ${DISMISSAL_STATUSES[1]}`, 'dismissStatus');
  }
  if (found.status === DISMISSAL_STATUSES[1]) {
    throw new ApiError(409, 'DISMISSAL_HANDLED', '这条忽略记录已经处理过了', '');
  }

  found.status = DISMISSAL_STATUSES[1];
  found.handledAt = new Date().toISOString();
  found.updatedAt = found.handledAt;
  save(data);
  return found;
}

module.exports = {
  createDismissal,
  handleDismissal,
};
