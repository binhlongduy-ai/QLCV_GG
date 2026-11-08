'use strict';
/** Kiểm thử cho các thay đổi tái cấu trúc: số lần đọc driver trong một request và số đếm người dùng trên toàn bảng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh } = require('./harness');

const { Q, call } = fresh();
const ADMIN = 'admin@example.com', CBTD = 'cbtd01@example.com';
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; };

test('user.list trả số đếm trên toàn bảng, không bị giới hạn bởi trang đang xem', () => {
  const page = ok(call(ADMIN, 'user.list', { pageSize: 1 }));
  assert.equal(page.items.length, 1);
  assert.equal(page.counts.active, 6);
  assert.equal(page.counts.byRole.CBTD, 3);
  assert.equal(page.counts.byRole.Admin, 1);
});

test('một yêu cầu đọc chỉ đọc mỗi bảng tối đa một lần từ driver (không đọc lại Users)', () => {
  const original = Q.MemoryDriver.read;
  const counts = {};
  Q.MemoryDriver.read = (t) => { counts[t] = (counts[t] || 0) + 1; return original(t); };
  try {
    const cases = [[ADMIN, 'task.list', { pageSize: 20 }], [CBTD, 'task.list', { pageSize: 20 }], [ADMIN, 'dashboard.get', {}]];
    for (const [who, action, params] of cases) {
      Object.keys(counts).forEach((k) => { delete counts[k]; });
      ok(call(who, action, params));
      assert.ok(Object.keys(counts).includes('Users'), action + ': phải đọc Users để xác thực');
      Object.entries(counts).forEach(([t, n]) => assert.equal(n, 1, action + ': bảng ' + t + ' được đọc ' + n + ' lần'));
    }
  } finally {
    Q.MemoryDriver.read = original;
  }
});

test('dashboard.overview gộp dashboard.get và dashboard.director trong một request', () => {
  const dash = ok(call(ADMIN, 'dashboard.get'));
  const dir = ok(call(ADMIN, 'dashboard.director'));
  const ov = ok(call(ADMIN, 'dashboard.overview'));
  assert.deepEqual(JSON.parse(JSON.stringify(ov.dashboard)), JSON.parse(JSON.stringify(dash)));
  assert.deepEqual(JSON.parse(JSON.stringify(ov.director)), JSON.parse(JSON.stringify(dir)));
  assert.equal(ok(call(CBTD, 'dashboard.overview')).director, null, 'CBTD không có phần Giám đốc');
});

test('vai trò/quyền được cache: request sau không đọc lại Roles, Permissions, RolePermissions', () => {
  ok(call(CBTD, 'auth.me'));   // làm nóng cache
  const original = Q.MemoryDriver.read, seen = {};
  Q.MemoryDriver.read = (t) => { seen[t] = (seen[t] || 0) + 1; return original(t); };
  try {
    const me = ok(call(CBTD, 'auth.me'));
    assert.ok(me.permissions.includes('task.view'));
    ['Roles', 'Permissions', 'RolePermissions'].forEach((t) => assert.equal(seen[t], undefined, t + ' không được đọc lại'));
  } finally { Q.MemoryDriver.read = original; }
});

test('Policy.clearReference làm cache vai trò/quyền đọc lại từ dữ liệu', () => {
  ok(call(CBTD, 'auth.me'));
  Q.Dev.dump(); // dữ liệu không đổi
  Q.Policy.clearReference();
  const original = Q.MemoryDriver.read, seen = {};
  Q.MemoryDriver.read = (t) => { seen[t] = (seen[t] || 0) + 1; return original(t); };
  try { ok(call(CBTD, 'auth.me')); assert.equal(seen.Roles, 1); } finally { Q.MemoryDriver.read = original; }
});
