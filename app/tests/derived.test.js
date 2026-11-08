'use strict';
/**
 * Kiểm thử tối ưu đọc (docs/REVIEW_TEAM.md):
 *  P1 Tasks.approved_progress / pending_updates, P2 Users.unread_notifications (26_Derived.js),
 *  P3 bộ nhớ đệm người dùng theo email (Q.UserCache, ghi xuyên).
 * Hành vi API giữ nguyên đã được tests/characterization.test.js chứng minh; ở đây kiểm tính nhất quán,
 * khả năng tự sửa lệch, hiệu lực tức thì của thay đổi người dùng, và số bảng thực sự được đọc.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh } = require('./harness');

const { Q, call, reset } = fresh();
const ADMIN = 'admin@example.com', KSV = 'ksv01@example.com', C1 = 'cbtd01@example.com', C2 = 'cbtd02@example.com';
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; };
const err = (r, code) => { assert.equal(r.ok, false, 'phải thất bại'); assert.equal(r.error.code, code, r.error.message); };

test.beforeEach(() => reset());

/** Các bảng driver đọc trong một lời gọi (đếm theo tên bảng). */
function tablesRead(fn) {
  const original = Q.MemoryDriver.read, seen = {};
  Q.MemoryDriver.read = (t) => { seen[t] = (seen[t] || 0) + 1; return original(t); };
  try { fn(); } finally { Q.MemoryDriver.read = original; }
  return seen;
}

test('P1 tiến độ: gửi tăng pending, duyệt giảm pending và nâng approved; DTO khớp nguồn', () => {
  const before = ok(call(C1, 'task.get', { taskId: 'TSK-001' })).task;
  const sub = ok(call(C1, 'progress.submit', { taskId: 'TSK-001', progressPct: 80, narrative: 'Tiến độ kiểm thử P1' })).update;
  assert.equal(ok(call(C1, 'task.get', { taskId: 'TSK-001' })).task.pendingUpdates, before.pendingUpdates + 1);
  const rv = ok(call(KSV, 'progress.review', { updateId: sub.updateId, decision: 'approve' }));
  assert.equal(rv.task.pendingUpdates, before.pendingUpdates);
  assert.equal(rv.task.approvedProgress, Math.max(before.approvedProgress, 80));
  // Thử lại cùng quyết định: không được trừ pending lần hai
  const again = ok(call(KSV, 'progress.review', { updateId: sub.updateId, decision: 'approve' }));
  assert.equal(again.replayed, true);
  assert.equal(again.task.pendingUpdates, before.pendingUpdates);
  assert.equal(ok(call(ADMIN, 'admin.integrity')).ok, true);
});

test('P1/P2 lệch dữ liệu bị admin.integrity phát hiện và admin.reconcile sửa', () => {
  Q.Store.update('Tasks', 'TSK-001', { approved_progress: 99, pending_updates: 7 });
  Q.Store.update('Users', 'USR-004', { unread_notifications: 42 });
  Q.UserCache.clear('cbtd01@example.com');
  const bad = ok(call(ADMIN, 'admin.integrity'));
  assert.equal(bad.ok, false);
  const msgs = bad.issues.map((i) => i.message).join('\n');
  assert.match(msgs, /approved_progress lệch/);
  assert.match(msgs, /pending_updates lệch/);
  assert.match(msgs, /unread_notifications lệch/);
  ok(call(ADMIN, 'admin.reconcile'));
  assert.equal(ok(call(ADMIN, 'admin.integrity')).ok, true);
});

test('P2 chưa đọc: tạo và đánh dấu đã đọc giữ số đếm khớp số thông báo chưa đọc thực tế', () => {
  const actual = () => Q.Store.findBy('Notifications', 'recipient_user_id', 'USR-004').filter((n) => !n.read_at).length;
  ok(call(KSV, 'task.create', { title: 'Giao việc để có thông báo', customerId: 'CUS-001', primaryUserId: 'USR-004', dueAt: '2026-12-01' }));
  const c1 = ok(call(C1, 'notification.count')).unread;
  assert.equal(c1, actual());
  const first = ok(call(C1, 'notification.list')).items.find((n) => !n.readAt);
  const mr = ok(call(C1, 'notification.markRead', { ids: [first.notificationId] }));
  assert.equal(mr.unread, c1 - 1);
  assert.equal(ok(call(C1, 'auth.me')).unreadNotifications, c1 - 1);
  ok(call(C1, 'notification.markAllRead'));
  assert.equal(ok(call(C1, 'notification.count')).unread, 0);
  assert.equal(actual(), 0);
});

test('P3 cache người dùng: vô hiệu hóa qua API có hiệu lực ngay ở request kế tiếp', () => {
  ok(call(C2, 'auth.me'));                       // nạp cache cho C2
  ok(call(ADMIN, 'user.update', { userId: 'USR-005', status: 'inactive' }));
  err(call(C2, 'auth.me'), 'FORBIDDEN');
  ok(call(ADMIN, 'user.update', { userId: 'USR-005', status: 'active' }));
  ok(call(C2, 'auth.me'));
});

test('P3 đánh đổi đã biết: sửa trực tiếp dữ liệu (ngoài API) chỉ có hiệu lực khi cache hết hạn hoặc bị xóa', () => {
  ok(call(C2, 'auth.me'));
  Q.Store.update('Users', 'USR-005', { status: 'inactive' });   // mô phỏng sửa tay trên Sheets
  ok(call(C2, 'auth.me'));                                      // còn trong USER_CACHE_SEC: vẫn qua
  Q.UserCache.clear('cbtd02@example.com');                      // tương đương hết hạn
  err(call(C2, 'auth.me'), 'FORBIDDEN');
});

test('Tối ưu đọc: auth.me trúng cache không đọc Users/Notifications; danh sách và dashboard không đọc TaskUpdates', () => {
  ok(call(C1, 'auth.me'));   // làm nóng cache người dùng và vai trò
  const me = tablesRead(() => ok(call(C1, 'auth.me')));
  assert.equal(me.Users, undefined, 'auth.me không được đọc Users khi trúng cache');
  assert.equal(me.Notifications, undefined, 'auth.me không được đọc Notifications');
  for (const [who, action] of [[ADMIN, 'task.list'], [KSV, 'dashboard.get'], [ADMIN, 'dashboard.overview'], [C1, 'notification.count']]) {
    const seen = tablesRead(() => ok(call(who, action)));
    assert.equal(seen.TaskUpdates, undefined, action + ' không được đọc TaskUpdates');
    if (action === 'notification.count') assert.equal(seen.Notifications, undefined, 'notification.count không được đọc Notifications');
  }
});

test('Di trú sheet cũ trên Apps Script: thêm cột dẫn xuất vào cuối tab, giữ dữ liệu, tính lại giá trị', () => {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const { fakeGoogle } = require('./fake-gas');
  const f = fakeGoogle({ props: { ADMIN_EMAIL: 'boss@bank.vn' } });
  const ctx = vm.createContext(f.g);
  const SRC = path.join(__dirname, '..', 'backend', 'src');
  fs.readdirSync(SRC).filter((x) => x.endsWith('.js')).sort()
    .forEach((x) => vm.runInContext(fs.readFileSync(path.join(SRC, x), 'utf8'), ctx, { filename: x }));
  const G = vm.runInContext('QLCV', ctx);
  G.Setup.bootstrapDatabase();
  // Đưa tab Tasks và Users về tiêu đề cũ (trước khi có cột dẫn xuất), có sẵn một công việc và một báo cáo chờ duyệt.
  const oldTasks = plainCols(G, 'Tasks').filter((c) => c !== 'approved_progress' && c !== 'pending_updates');
  const oldUsers = plainCols(G, 'Users').filter((c) => c !== 'unread_notifications');
  f.sheets.Tasks.rows.length = 0; f.sheets.Tasks.rows.push(oldTasks.slice());
  f.sheets.Tasks.rows.push(oldTasks.map((c) => ({ task_id: 'TSK-001', task_code: 'CV-0001', customer_id: 'CUS-001', title: 'Cũ', status: 'in_progress', priority: 'normal', due_at: '2026-12-01', created_by_user_id: 'USR-001', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })[c] || ''));
  const users = f.sheets.Users.rows.map((r) => r.slice(0, oldUsers.length));
  f.sheets.Users.rows.length = 0; users.forEach((r) => f.sheets.Users.rows.push(r));
  f.sheets.TaskUpdates.rows.push(plainCols(G, 'TaskUpdates').map((c) => ({ update_id: 'UPD-001', task_id: 'TSK-001', progress_pct: 40, narrative: 'Báo cáo cũ', submitted_by_user_id: 'USR-001', submitted_by_email_snapshot: 'boss@bank.vn', submitted_at: '2026-10-02T00:00:00Z', review_status: 'pending' })[c] ?? ''));

  const report = G.Setup.bootstrapDatabase();
  assert.ok(report.some((l) => /Thêm cột vào tab Tasks: approved_progress, pending_updates/.test(l)), report.join('\n'));
  assert.ok(report.some((l) => /Thêm cột vào tab Users: unread_notifications/.test(l)), report.join('\n'));
  assert.deepEqual(f.sheets.Tasks.rows[0].slice(), plainCols(G, 'Tasks'));
  assert.equal(f.sheets.Tasks.rows[1][0], 'TSK-001', 'dữ liệu cũ giữ nguyên');
  G.Store.reset();
  const t = G.Store.find('Tasks', 'TSK-001');
  assert.equal(t.pending_updates, 1);
  assert.equal(t.approved_progress, 0);
  assert.equal(G.Store.find('Users', 'USR-001').unread_notifications, 0);
});

function plainCols(G, t) { return JSON.parse(JSON.stringify(G.Schema.cols(t))); }
