'use strict';
/**
 * Kiểm thử đường chạy Apps Script thật (Env_Gas + Driver Sheets + Setup + xác minh Google ID token)
 * bằng bộ giả lập SpreadsheetApp/PropertiesService/UrlFetchApp... Không cần mạng hay tài khoản Google.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'backend', 'src');

function fakeGoogle(opts = {}) {
  const props = { GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com', ADMIN_EMAIL: 'Boss@Bank.vn', ...opts.props };
  const sheets = {};
  let fetchCount = 0;
  const tokens = {};
  const cacheStore = {};

  function Sheet(name) {
    const rows = [];
    const sh = {
      name, rows, formats: 0, frozen: 0,
      getLastRow: () => { let l = 0; rows.forEach((r, i) => { if (r.some((v) => v !== '' && v !== undefined)) l = i + 1; }); return l; },
      getMaxRows: () => Math.max(rows.length, 1) + 500,
      setFrozenRows: (n) => { sh.frozen = n; },
      appendRow: (arr) => { rows[sh.getLastRow()] = arr.slice(); },
      getRange: (r, c, nr = 1, nc = 1) => {
        const rg = {
          getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
          setValues: (vals) => { vals.forEach((v, i) => { const row = (rows[r - 1 + i] = rows[r - 1 + i] || []); v.forEach((x, j) => { row[c - 1 + j] = x; }); }); return rg; },
          setFontWeight: () => rg, setBackground: () => rg,
          setNumberFormat: () => { sh.formats++; return rg; }
        };
        return rg;
      }
    };
    return sh;
  }
  const book = {
    getId: () => 'book-1',
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = Sheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: (s) => { delete sheets[s.name]; }
  };
  const g = {
    console: { log() {}, error() {} },
    SpreadsheetApp: { openById: () => book, getActiveSpreadsheet: () => book, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() { if (opts.lockBusy) throw new Error('timeout'); }, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_a, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID()
    },
    UrlFetchApp: {
      fetch: (url) => {
        fetchCount++;
        const t = decodeURIComponent(url.split('id_token=')[1]);
        const body = tokens[t];
        return { getResponseCode: () => (body ? 200 : 400), getContentText: () => JSON.stringify(body || { error: 'invalid_token' }) };
      }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }) }
  };
  return { g, props, sheets, tokens, fetches: () => fetchCount };
}

function boot(opts) {
  const f = fakeGoogle(opts);
  const ctx = vm.createContext(f.g);
  fs.readdirSync(SRC).filter((x) => x.endsWith('.js')).sort()
    .forEach((x) => vm.runInContext(fs.readFileSync(path.join(SRC, x), 'utf8'), ctx, { filename: x }));
  const Q = vm.runInContext('QLCV', ctx);
  const post = (body) => JSON.parse(Q.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const goodToken = (name, email, extra = {}) => {
    f.tokens[name] = { aud: f.props.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com', email, email_verified: 'true',
      exp: String(Math.floor(Date.now() / 1000) + 3600), ...extra };
    return name;
  };
  return { Q, ctx, f, post, goodToken, run: (code) => vm.runInContext(code, ctx) };
}

test('Môi trường Apps Script được nhận diện; lõi bộ nhớ không chen vào', () => {
  const b = boot();
  assert.equal(b.Q.Env.runtime, 'gas');
  assert.equal(b.Q.Env.allowDemoTokens, false);
  assert.equal(b.Q.Dev, undefined);
  assert.equal(JSON.parse(b.Q.doGet().text).data.status, 'ok');
});

test('bootstrapDatabase tạo 10 tab đúng tiêu đề, định dạng văn bản, nạp tham chiếu và Admin đầu tiên', () => {
  const b = boot();
  b.run('bootstrapDatabase()');
  assert.deepEqual(Object.keys(b.f.sheets).sort(), Array.from(b.Q.Schema.names).sort());
  for (const t of b.Q.Schema.names) {
    assert.deepEqual(JSON.parse(JSON.stringify(b.f.sheets[t].rows[0])), JSON.parse(JSON.stringify(b.Q.Schema.cols(t))), t);
    assert.ok(b.f.sheets[t].formats > 0 && b.f.sheets[t].frozen === 1, t);
  }
  assert.equal(b.f.sheets.Roles.rows.length - 1, 4);
  assert.equal(b.f.sheets.Permissions.rows.length - 1, 15);
  assert.equal(b.f.sheets.Users.rows[1][1], 'boss@bank.vn');
  b.run('bootstrapDatabase()');                                    // chạy lại không nhân đôi dữ liệu
  assert.equal(b.f.sheets.Roles.rows.length - 1, 4);
  assert.equal(b.f.sheets.Users.rows.length - 1, 1);
});

test('Sai tiêu đề tab bị phát hiện thay vì ghi nhầm cột', () => {
  const b = boot();
  b.run('bootstrapDatabase()');
  b.f.sheets.Tasks.rows[0][3] = 'tieu_de';
  const r = b.post({ action: 'task.list', idToken: b.goodToken('t1', 'boss@bank.vn') });
  assert.equal(r.ok, false); assert.equal(r.error.code, 'INTERNAL');
  assert.doesNotMatch(JSON.stringify(r), /at \w+.*\.js/, 'không lộ stack trace');
});

test('Xác minh Google ID token: aud, iss, email_verified, exp, hd; cache; tài khoản chưa cấp quyền', () => {
  const b = boot({ props: { ALLOWED_DOMAIN: 'bank.vn' } });
  b.run('bootstrapDatabase()');
  const me = (tok) => b.post({ action: 'auth.me', idToken: tok });

  const ok = me(b.goodToken('ok1', 'boss@bank.vn', { hd: 'bank.vn' }));
  assert.equal(ok.ok, true); assert.equal(ok.data.role.code, 'Admin');
  const n = b.f.fetches();
  assert.equal(me('ok1').ok, true); assert.equal(b.f.fetches(), n, 'lần 2 dùng cache, không gọi Google');

  assert.equal(me('khong-ton-tai').error.code, 'UNAUTHENTICATED');
  assert.equal(me(b.goodToken('aud', 'boss@bank.vn', { hd: 'bank.vn', aud: 'app-khac' })).error.code, 'UNAUTHENTICATED');
  assert.equal(me(b.goodToken('iss', 'boss@bank.vn', { hd: 'bank.vn', iss: 'https://evil.example' })).error.code, 'UNAUTHENTICATED');
  assert.equal(me(b.goodToken('unv', 'boss@bank.vn', { hd: 'bank.vn', email_verified: 'false' })).error.code, 'UNAUTHENTICATED');
  assert.equal(me(b.goodToken('exp', 'boss@bank.vn', { hd: 'bank.vn', exp: String(Math.floor(Date.now() / 1000) - 5) })).error.code, 'UNAUTHENTICATED');
  assert.equal(me(b.goodToken('hd', 'boss@bank.vn', { hd: 'gmail.com' })).error.code, 'FORBIDDEN');
  assert.equal(me(b.goodToken('nouser', 'ai-do@bank.vn', { hd: 'bank.vn' })).error.code, 'FORBIDDEN');
  assert.equal(me('demo:boss@bank.vn').error.code, 'UNAUTHENTICATED', 'token demo không được chấp nhận trên Apps Script');
  assert.equal(me(undefined).error.code, 'UNAUTHENTICATED');
});

test('Luồng nghiệp vụ end-to-end trên Sheets giả lập: ghi đúng dòng, chỉ-ghi-thêm, cập nhật tại chỗ', () => {
  const b = boot();
  b.run('bootstrapDatabase()');
  const admin = b.goodToken('adm', 'boss@bank.vn'); let n = 0;
  const call = (tok, action, params) => b.post({ action, idToken: tok, params, requestId: 'req-e2e-' + String(++n).padStart(4, '0') });

  const rolesById = {}; b.f.sheets.Roles.rows.slice(1).forEach((r) => { rolesById[r[1]] = r[0]; });
  const mk = (email, code, role) => call(admin, 'user.create', { email, employeeCode: code, fullName: code, orgUnit: 'DV1', roleId: rolesById[role] });
  assert.equal(mk('ksv@bank.vn', 'KSV1', 'KSV').ok, true);
  const cb = mk('cb@bank.vn', 'CB1', 'CBTD'); assert.equal(cb.ok, true);
  const ksv = b.goodToken('ksv', 'ksv@bank.vn'), cbt = b.goodToken('cb', 'cb@bank.vn');

  const cust = call(ksv, 'customer.create', { name: 'Công ty Thử nghiệm', type: 'business', phone: '0900000000', companyRepresentative: 'Đại diện' });
  assert.equal(cust.ok, true, JSON.stringify(cust.error));
  const due = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const task = call(ksv, 'task.create', { customerId: cust.data.customer.customerId, title: 'Việc thật', dueAt: due, primaryUserId: cb.data.user.userId });
  assert.equal(task.ok, true, JSON.stringify(task.error));
  const taskId = task.data.task.taskId;

  const sub = call(cbt, 'progress.submit', { taskId, progressPct: 100, narrative: 'hoàn tất công việc' });
  assert.equal(sub.ok, true, JSON.stringify(sub.error));
  const rev = call(ksv, 'progress.review', { updateId: sub.data.update.updateId, decision: 'approve' });
  assert.equal(rev.ok, true, JSON.stringify(rev.error));
  assert.equal(rev.data.task.status, 'completed');

  // Trạng thái trên "sổ": hoàn thành, một dòng TaskUpdates được cập nhật tại chỗ (không nhân đôi)
  const t = b.f.sheets.Tasks.rows; assert.equal(t.length, 2); assert.equal(t[1][5], 'completed'); assert.ok(t[1][9]);
  assert.equal(b.f.sheets.TaskUpdates.rows.length, 2);
  assert.equal(b.f.sheets.TaskUpdates.rows[1][7], 'approved');
  assert.equal(b.f.sheets.TaskAssignees.rows[1][6], 'TRUE');          // bool lưu dạng TRUE/FALSE
  assert.equal(b.f.sheets.TaskUpdates.rows[1][2], 100);                // số nguyên
  const audit = b.f.sheets.AuditLogs.rows.slice(1).map((r) => r[3]);
  for (const a of ['user.create', 'customer.create', 'task.create', 'task.assign', 'progress.submit', 'progress.approve', 'task.auto_complete']) assert.ok(audit.includes(a), a);

  assert.equal(b.run('checkIntegrity().ok'), true);
  assert.equal(call(admin, 'admin.restore').error.code, 'NOT_ENABLED');
});

test('Khóa bận trả BUSY; lỗi không lường trước trả INTERNAL kèm mã tham chiếu, không lộ stack', () => {
  const b = boot({ lockBusy: true });
  b.run('bootstrapDatabase()');
  const adm = b.goodToken('adm', 'boss@bank.vn');
  const r = b.post({ action: 'user.create', idToken: adm, params: {}, requestId: 'req-busy-0001' });
  assert.equal(r.error.code, 'BUSY');

  const b2 = boot();
  const raw = JSON.parse(b2.Q.doPost({ postData: { contents: '{không phải json' } }).text);
  assert.equal(raw.error.code, 'VALIDATION');
  assert.equal(JSON.parse(b2.Q.doPost({ postData: { contents: 'x'.repeat(70000) } }).text).error.code, 'VALIDATION');
});

test('seedDemoData bị chặn khi thiếu ALLOW_SEED hoặc đã có dữ liệu', () => {
  const b = boot();
  assert.throws(() => b.run('seedDemoData()'), /ALLOW_SEED/);
  const c = boot({ props: { ALLOW_SEED: 'true' } });
  c.run('seedDemoData()');
  assert.equal(c.f.sheets.Tasks.rows.length - 1, 4);
  assert.equal(c.f.sheets.Users.rows[1][1], 'boss@bank.vn');       // Admin mẫu đổi sang email người cài đặt
  assert.throws(() => c.run('seedDemoData()'), /đã có dữ liệu/);
  assert.equal(c.run('checkIntegrity().ok'), true);
});
