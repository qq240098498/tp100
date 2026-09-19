const crypto = require('crypto');
const { load, save, FILE_TYPES, MAX_PATH_LENGTH, MAX_CONTENT_LENGTH, MAX_NOTE_LENGTH } = require('./store');
const { ApiError, pickText } = require('./errors');

// 路径只允许字母数字、点、下划线、短横线与斜线，后缀必须是认得的几种
const PATH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const KNOWN_EXTENSIONS = ['js', 'sh', 'md', 'yml'];

function extensionOf(filePath) {
  if (!filePath.includes('.')) return '';
  return filePath.split('.').pop().toLowerCase();
}

function validatePath(value, data, selfId) {
  const filePath = pickText(value);
  if (!filePath) throw new ApiError(400, 'PATH_REQUIRED', '请填写文件路径', 'filePath');
  if (filePath.length > MAX_PATH_LENGTH) {
    throw new ApiError(400, 'PATH_TOO_LONG', `文件路径不能超过 ${MAX_PATH_LENGTH} 个字符`, 'filePath');
  }
  if (!PATH_PATTERN.test(filePath) || filePath.startsWith('/') || filePath.includes('..')) {
    throw new ApiError(400, 'PATH_INVALID', '文件路径只能用字母数字、点、下划线、短横线与斜线，且不能用相对上级的写法', 'filePath');
  }
  const ext = extensionOf(filePath);
  if (!KNOWN_EXTENSIONS.includes(ext)) {
    throw new ApiError(400, 'PATH_EXTENSION_INVALID', `只收录 ${KNOWN_EXTENSIONS.join('、')} 这几种文件`, 'filePath');
  }
  const hit = data.files.find((item) => item.id !== selfId && item.path.toLowerCase() === filePath.toLowerCase());
  if (hit) throw new ApiError(409, 'PATH_DUPLICATED', `路径 ${hit.path} 已经收录过了`, 'filePath');
  return filePath;
}

function validateContent(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'CONTENT_INVALID', '文件内容需要是文本', 'content');
  if (!value.trim()) throw new ApiError(400, 'CONTENT_REQUIRED', '文件内容不能为空', 'content');
  if (value.length > MAX_CONTENT_LENGTH) {
    throw new ApiError(400, 'CONTENT_TOO_LONG', `文件内容不能超过 ${MAX_CONTENT_LENGTH} 个字符`, 'content');
  }
  return value;
}

function validateNote(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ApiError(400, 'NOTE_INVALID', '备注需要是文本', 'note');
  if (value.length > MAX_NOTE_LENGTH) {
    throw new ApiError(400, 'NOTE_TOO_LONG', `备注不能超过 ${MAX_NOTE_LENGTH} 个字符`, 'note');
  }
  return value.trim();
}

function lineCountOf(content) {
  if (!content) return 0;
  return content.split('\n').length;
}

function withMeta(file) {
  return { ...file, lineCount: lineCountOf(file.content) };
}

function sortFiles(list) {
  return list.slice().sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

// 文件清单：按类型筛选，再按路径或备注搜索
function listFiles(options) {
  const input = options && typeof options === 'object' ? options : {};
  const type = pickText(input.type);
  const keyword = pickText(input.keyword).toLowerCase();
  const data = load();

  let list = data.files;
  if (type) list = list.filter((item) => item.type === type);
  if (keyword) {
    list = list.filter((item) => item.path.toLowerCase().includes(keyword)
      || item.note.toLowerCase().includes(keyword));
  }

  return {
    files: sortFiles(list).map(withMeta),
    fileTypes: FILE_TYPES.filter((item) => item !== '全部'),
  };
}

function getFile(id) {
  const data = load();
  const found = data.files.find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'FILE_NOT_FOUND', '这个文件不存在或已被移出清单', '');
  return withMeta(found);
}

function createFile(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = load();
  const filePath = validatePath(input.path, data, '');
  const content = validateContent(input.content);
  const now = new Date().toISOString();
  const created = {
    id: crypto.randomUUID(),
    path: filePath,
    type: extensionOf(filePath),
    content,
    note: validateNote(input.note),
    createdAt: now,
    updatedAt: now,
  };
  data.files.push(created);
  save(data);
  return withMeta(created);
}

function updateFile(id, payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = load();
  const found = data.files.find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'FILE_NOT_FOUND', '这个文件不存在或已被移出清单', '');

  found.path = input.path === undefined ? found.path : validatePath(input.path, data, found.id);
  found.type = extensionOf(found.path);
  found.content = input.content === undefined ? found.content : validateContent(input.content);
  found.note = input.note === undefined ? found.note : validateNote(input.note);
  found.updatedAt = new Date().toISOString();
  save(data);
  return withMeta(found);
}

function deleteFile(id) {
  const data = load();
  const index = data.files.findIndex((item) => item.id === id);
  if (index === -1) throw new ApiError(404, 'FILE_NOT_FOUND', '这个文件不存在或已被移出清单', '');
  const [removed] = data.files.splice(index, 1);
  save(data);
  return { id: removed.id, path: removed.path };
}

module.exports = {
  listFiles,
  getFile,
  createFile,
  updateFile,
  deleteFile,
  lineCountOf,
};
