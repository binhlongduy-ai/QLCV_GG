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
