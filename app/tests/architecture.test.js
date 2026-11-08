'use strict';
/**
 * Kiểm thử ràng buộc kiến trúc: giữ ranh giới giữa các lớp (xem docs/ARCHITECTURE.md mục 2).
 * Đọc mã nguồn tĩnh, không chạy nghiệp vụ. Mục đích: refactor sau này không làm vỡ ranh giới mà không ai biết.
 *
 * Luật:
 *  A1  Miền (20_Domain) thuần: không dùng Q.Env, Q.Store, Q.Repo, Q.Policy, Q.Auth, Q.Presenters, Q.Audit, Q.Notify.
 *  A2  Trình bày (23_Presenters) chỉ đọc: không ghi (insert/update), không dùng Q.Store/Q.Env.
 *  A3  Use case (40–48) không chạm Q.Store: chỉ qua Q.Repo.
 *  A4  Q.Store chỉ được dùng ở lớp hạ tầng và adapter dữ liệu.
 *  A5  Repository (22) là nơi duy nhất gọi S() (bộ bọc Q.Store).
 *  A6  Miền không gọi lớp trên (Policy, Presenters, use case).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'backend', 'src');
const DEV = path.join(__dirname, '..', 'backend', 'dev');

/** Mã nguồn đã bỏ chú thích (// và /* *\/) để không báo nhầm trong phần mô tả. */
function code(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}
function files(dir, re) { return fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f)); }
function hits(file, pattern) {
  const lines = code(file).split('\n');
  const out = [];
  lines.forEach((l, i) => { if (pattern.test(l)) out.push(path.basename(file) + ':' + (i + 1) + ': ' + l.trim()); });
  return out;
}
function byName(prefix) { return files(SRC, new RegExp('^' + prefix + '_.*\\.js$')); }
function assertNone(found, rule) {
  assert.deepEqual(found, [], rule + '\n' + found.join('\n'));
}

test('A1 miền (20_Domain) không phụ thuộc hạ tầng hay lớp trên', () => {
  const found = byName('20').flatMap((f) => hits(f, /\bQ\.(Env|Store|Repo|Policy|Auth|Presenters|Audit|Notify|Assignments|Pipeline)\b/));
  assertNone(found, 'Miền không được gọi hạ tầng hoặc lớp trên');
});

test('A2 trình bày (23_Presenters) chỉ đọc', () => {
  const found = byName('23').flatMap((f) => hits(f, /\.(insert|insertMany|update)\(|\bQ\.(Store|Env)\b/));
  assertNone(found, 'Presenters không được ghi dữ liệu hay dùng Store/Env');
});

test('A3 use case (40–48) không chạm Q.Store', () => {
  const found = [...byName('40'), ...byName('41'), ...byName('42'), ...byName('43'), ...byName('44'),
    ...byName('45'), ...byName('46'), ...byName('47'), ...byName('48')]
    .flatMap((f) => hits(f, /\bQ\.Store\b/));
  assertNone(found, 'Use case phải đi qua Q.Repo');
});

test('A4 Q.Store chỉ dùng ở hạ tầng và adapter dữ liệu', () => {
  const allowed = new Set(['02_Store.js', '11_Driver_Sheet.js', '22_Repositories.js', '95_Setup.js', '97_Bench.js']);
  const found = files(SRC, /\.js$/).filter((f) => !allowed.has(path.basename(f)))
    .flatMap((f) => hits(f, /\bQ\.Store\b/));
  assertNone(found, 'Q.Store đang được dùng ngoài các lớp được phép');
});

test('A5 Repository là nơi duy nhất gọi S() (bộ bọc Q.Store)', () => {
  const found = files(SRC, /\.js$/).filter((f) => path.basename(f) !== '22_Repositories.js')
    .flatMap((f) => hits(f, /\bS\(\)/));
  assertNone(found, 'S() chỉ được dùng trong 22_Repositories.js');
});

test('A6 miền không gọi lớp trên (đã gộp với A1; kiểm tra thêm Presenters không gọi Policy)', () => {
  const found = byName('23').flatMap((f) => hits(f, /\bQ\.Policy\b/));
  assertNone(found, 'Presenters không được kiểm tra quyền; quyền thuộc lớp ứng dụng');
});

test('bộ phát hiện vi phạm thực sự bắt được lỗi (tự kiểm)', () => {
  const sample = 'function bad() {\n  return Q.Store.all("Tasks"); // ok trong chú thích: Q.Store\n}\n/* Q.Store ok */';
  const tmp = path.join(require('os').tmpdir(), 'arch-selftest-' + process.pid + '.js');
  fs.writeFileSync(tmp, sample, 'utf8');
  try {
    const found = hits(tmp, /\bQ\.Store\b/);
    assert.equal(found.length, 1, 'phải bắt đúng 1 vi phạm (bỏ qua chú thích)');
  } finally { fs.unlinkSync(tmp); }
});

test('mọi tệp backend/src có tiền tố số hai chữ số (thứ tự nạp xác định)', () => {
  const bad = fs.readdirSync(SRC).filter((f) => f.endsWith('.js') && !/^\d{2}_/.test(f));
  assert.deepEqual(bad, [], 'tệp thiếu tiền tố số: ' + bad.join(', '));
  assert.ok(fs.existsSync(path.join(DEV, 'Env_Memory.js')), 'thiếu backend/dev/Env_Memory.js');
});
