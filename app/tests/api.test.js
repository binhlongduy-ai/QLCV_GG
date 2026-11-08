'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fresh, plain } = require('./harness');

const { Q, call, reset } = fresh();
const ADMIN = 'admin@example.com', BGD = 'bgd@example.com', KSV = 'ksv01@example.com';
const C1 = 'cbtd01@example.com', C2 = 'cbtd02@example.com', C3 = 'cbtd03@example.com', INACTIVE = 'cbtd-inactive@example.com';

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; };
const err = (r, code) => { assert.equal(r.ok, false, 'phải thất bại'); assert.equal(r.error.code, code, r.error.message); return r.error; };
const integrity = () => ok(call(ADMIN, 'admin.integrity'));
const dueIn = (days) => new Date(Date.parse('2026-10-13T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);

test.beforeEach(() => reset());

/* ---------- Hạ tầng & xác thực (R1) ---------- */
test('system.health công khai; action lạ, thiếu requestId, body sai bị từ chối', () => {
  assert.equal(ok(call(null, 'system.health')).status, 'ok');
  err(call(C1, 'nope.nothing'), 'NOT_FOUND');
  err(Q.handle({ action: 'task.create', idToken: 'demo:' + C1, params: {} }), 'VALIDATION');   // ghi mà không có requestId
  err(Q.handle(null), 'VALIDATION');
  err(Q.handle({ action: 'task.list', idToken: 'demo:' + C1, params: [] }), 'VALIDATION');
});

test('chưa đăng nhập / tài khoản lạ / tài khoản inactive / token demo bị từ chối khi tắt demo', () => {
  err(call(null, 'auth.me'), 'UNAUTHENTICATED');
  err(call('ghost@example.com', 'auth.me'), 'FORBIDDEN');
  err(call(INACTIVE, 'auth.me'), 'FORBIDDEN');
  Q.Env.allowDemoTokens = false;
  try { err(Q.handle({ action: 'auth.me', idToken: 'demo:' + ADMIN }), 'UNAUTHENTICATED'); } finally { Q.Env.allowDemoTokens = true; }
});

test('auth.me trả quyền theo dữ liệu RolePermissions và màn hình đầu theo vai trò (R14)', () => {
  const rp = fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'appsheet-synthetic', 'RolePermissions.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(','));
  const perm = fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'appsheet-synthetic', 'Permissions.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(','));
  const code = Object.fromEntries(perm.map((p) => [p[0], p[1]]));
  const map = { Admin: 'ROL-ADMIN', BGD: 'ROL-BGD', KSV: 'ROL-KSV', CBTD: 'ROL-CBTD' };
  const who = { Admin: ADMIN, BGD, KSV, CBTD: C1 };
  const start = { Admin: 'admin', BGD: 'dashboard', KSV: 'reviews', CBTD: 'tasks' };
  for (const role of Object.keys(map)) {
    const expected = rp.filter((r) => r[0] === map[role]).map((r) => code[r[1]]).sort();
    const me = ok(call(who[role], 'auth.me'));
    assert.deepEqual(me.permissions, expected, role);
    assert.equal(me.startView, start[role]);
  }
});

/* ---------- Phạm vi dữ liệu (R3) ---------- */
test('CBTD chỉ thấy công việc/khách hàng được giao; ngoài phạm vi trả NOT_FOUND', () => {
  const ids = (r) => ok(r).items.map((t) => t.taskId).sort();
  assert.deepEqual(ids(call(C1, 'task.list')), ['TSK-001', 'TSK-002', 'TSK-003']);
  assert.deepEqual(ids(call(C2, 'task.list')), ['TSK-001']);           // người phối hợp đang hoạt động
  assert.deepEqual(ids(call(C3, 'task.list')), ['TSK-004']);           // phân công cũ ở TSK-001 đã inactive
  assert.deepEqual(ids(call(KSV, 'task.list')), ['TSK-001', 'TSK-002', 'TSK-003', 'TSK-004']);
  err(call(C3, 'task.get', { taskId: 'TSK-001' }), 'NOT_FOUND');
  err(call(C3, 'customer.get', { customerId: 'CUS-003' }), 'NOT_FOUND');
  assert.deepEqual(ok(call(C3, 'customer.list')).items.map((c) => c.customerId), ['CUS-001']);
  assert.equal(ok(call(C1, 'customer.list')).total, 3);
  err(call(C1, 'audit.list'), 'FORBIDDEN');
});

/* ---------- Công việc (R5, R6) ---------- */
test('R6: CBTD chỉ tạo việc khi tự là người chính; KSV giao được cho CBTD và có thông báo', () => {
  err(call(C1, 'task.create', { customerId: 'CUS-001', title: 'X', dueAt: dueIn(3), primaryUserId: 'USR-005' }), 'FORBIDDEN');
  const mine = ok(call(C1, 'task.create', { customerId: 'CUS-001', title: 'Việc tự tạo', dueAt: dueIn(3) }));
  assert.equal(mine.task.primary.userId, 'USR-004');
  assert.equal(mine.task.status, 'not_started');
  const t = ok(call(KSV, 'task.create', { customerId: 'CUS-002', title: 'Giao việc', dueAt: dueIn(5), priority: 'high', primaryUserId: 'USR-005', collaboratorUserId: 'USR-006' })).task;
  assert.match(t.taskCode, /^CV-\d{4}$/);
  assert.equal(t.collaborator.userId, 'USR-006');
  const n = ok(call(C2, 'notification.list')).items;
  assert.ok(n.some((x) => x.eventType === 'task_assigned' && x.message.includes(t.taskCode)));
  assert.equal(integrity().ok, true);
});

test('Tạo việc: kiểm tra đầu vào (hạn quá khứ, người nhận không hợp lệ, KH lưu trữ, quyền BGD vẫn tạo được)', () => {
  const base = { customerId: 'CUS-001', title: 'T', dueAt: dueIn(2), primaryUserId: 'USR-004' };
  err(call(KSV, 'task.create', { ...base, dueAt: dueIn(-1) }), 'VALIDATION');
  err(call(KSV, 'task.create', { ...base, dueAt: '2026-02-30' }), 'VALIDATION');
  err(call(KSV, 'task.create', { ...base, title: '   ' }), 'VALIDATION');
  err(call(KSV, 'task.create', { ...base, priority: 'urgent' }), 'VALIDATION');
  err(call(KSV, 'task.create', { ...base, primaryUserId: 'USR-003' }), 'VALIDATION');     // KSV không phải CBTD
  err(call(KSV, 'task.create', { ...base, primaryUserId: 'USR-007' }), 'VALIDATION');     // inactive
  err(call(KSV, 'task.create', { ...base, collaboratorUserId: 'USR-004' }), 'VALIDATION'); // trùng người chính
  err(call(KSV, 'task.create', { ...base, customerId: 'CUS-999' }), 'VALIDATION');
  ok(call(BGD, 'task.create', base));
});

test('Cập nhật: không đặt completed thủ công; CBTD không sửa; chỉ bắt đầu việc của mình', () => {
  err(call(KSV, 'task.update', { taskId: 'TSK-002', status: 'completed' }), 'VALIDATION');
  err(call(C1, 'task.update', { taskId: 'TSK-002', title: 'Đổi' }), 'FORBIDDEN');
  assert.equal(ok(call(KSV, 'task.update', { taskId: 'TSK-002', title: 'Đã đổi', priority: 'high' })).task.title, 'Đã đổi');
  err(call(C3, 'task.start', { taskId: 'TSK-002' }), 'NOT_FOUND');
  assert.equal(ok(call(C1, 'task.start', { taskId: 'TSK-002' })).task.status, 'in_progress');
  err(call(C1, 'task.start', { taskId: 'TSK-002' }), 'CONFLICT');
});

test('Chuyển giao người chính (R17): chỉ KSV/Admin/Giám đốc; người nhận việc đang phối hợp thì thôi phối hợp', () => {
  err(call(C1, 'task.transfer', { taskId: 'TSK-001', newPrimaryUserId: 'USR-006' }), 'FORBIDDEN');
  err(call(BGD, 'task.transfer', { taskId: 'TSK-001', newPrimaryUserId: 'USR-006' }), 'FORBIDDEN');   // BGD thường
  Q.Env.setProp('DIRECTOR_EMAILS', BGD);
  ok(call(BGD, 'task.transfer', { taskId: 'TSK-001', newPrimaryUserId: 'USR-006' }));               // Giám đốc
  Q.Env.setProp('DIRECTOR_EMAILS', null);
  err(call(KSV, 'task.transfer', { taskId: 'TSK-001', newPrimaryUserId: 'USR-006' }), 'VALIDATION'); // đã là người chính
  const r = ok(call(KSV, 'task.transfer', { taskId: 'TSK-001', newPrimaryUserId: 'USR-005' }));      // USR-005 đang là phối hợp
  assert.equal(r.task.primary.userId, 'USR-005');
  assert.equal(r.task.collaborator, null);
  assert.deepEqual(ok(call(C1, 'task.list')).items.map((t) => t.taskId).sort(), ['TSK-002', 'TSK-003']);  // C1 mất quyền thấy TSK-001
  assert.equal(integrity().ok, true);
});

test('Lưu trữ thay vì xóa; việc lưu trữ ẩn khỏi danh sách mặc định', () => {
  ok(call(KSV, 'task.archive', { taskId: 'TSK-004' }));
  assert.equal(ok(call(KSV, 'task.list')).items.some((t) => t.taskId === 'TSK-004'), false);
  assert.equal(ok(call(KSV, 'task.list', { includeArchived: true })).items.some((t) => t.taskId === 'TSK-004'), true);
  err(call(C3, 'progress.submit', { taskId: 'TSK-004', progressPct: 10, narrative: 'đang làm' }), 'CONFLICT');
  err(call(C1, 'task.archive', { taskId: 'TSK-002' }), 'FORBIDDEN');
});

test('Tìm kiếm không dấu, lọc, phân trang', () => {
  assert.equal(ok(call(KSV, 'task.list', { q: 'tham dinh' })).items[0].taskId, 'TSK-001');
  assert.equal(ok(call(KSV, 'task.list', { priority: 'low' })).total, 1);
  const p = ok(call(KSV, 'task.list', { page: 2, pageSize: 3 }));
  assert.equal(p.items.length, 1); assert.equal(p.total, 4);
});

/* ---------- Tiến độ & duyệt (R7, R8) ---------- */
test('R7: chỉ chấp nhận số nguyên 0–100 (U1-T9a/b/c)', () => {
  for (const bad of [150, '50%', -1, 50.5, 'abc', null, '', [], {}, true]) {
    err(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: bad, narrative: 'nội dung hợp lệ' }), 'VALIDATION');
  }
  err(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 50, narrative: '' }), 'VALIDATION');
  assert.equal(ok(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: '50', narrative: 'đã xong một nửa' })).update.progressPct, 50);
  ok(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 0, narrative: 'bắt đầu' }));
});

test('Gửi tiến độ: người phối hợp được; CBTD ngoài phân công không; thông báo tới KSV/Admin, không tới chính mình', () => {
  ok(call(C2, 'progress.submit', { taskId: 'TSK-001', progressPct: 70, narrative: 'phối hợp cập nhật' }));
  err(call(C3, 'progress.submit', { taskId: 'TSK-001', progressPct: 70, narrative: 'không được giao' }), 'NOT_FOUND');
  const k = ok(call(KSV, 'notification.list', { unreadOnly: true })).items;
  assert.ok(k.some((n) => n.eventType === 'progress_submitted' && n.message.includes('70%')));
  assert.equal(ok(call(C2, 'notification.list')).items.some((n) => n.eventType === 'progress_submitted'), false);
});

test('R8: duyệt 100% tự động hoàn thành; hệ quả đủ và không trùng khi gửi lại', () => {
  const u = ok(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 100, narrative: 'hoàn tất toàn bộ' })).update;
  err(call(C1, 'progress.review', { updateId: u.updateId, decision: 'approve' }), 'FORBIDDEN');
  const r = ok(call(KSV, 'progress.review', { updateId: u.updateId, decision: 'approve', comment: 'Đạt' }));
  assert.equal(r.task.status, 'completed');
  assert.ok(r.task.completedAt);
  const again = ok(call(KSV, 'progress.review', { updateId: u.updateId, decision: 'approve' }));
  assert.equal(again.replayed, true);
  err(call(KSV, 'progress.review', { updateId: u.updateId, decision: 'reject', comment: 'đổi ý' }), 'CONFLICT');
  err(call(ADMIN, 'progress.review', { updateId: u.updateId, decision: 'approve' }), 'CONFLICT');   // người khác, đã xử lý

  const audit = ok(call(ADMIN, 'audit.list', { pageSize: 100 })).items;
  assert.equal(audit.filter((a) => a.action === 'task.auto_complete' && a.entityId === 'TSK-002').length, 1);
  assert.equal(audit.filter((a) => a.action === 'progress.approve' && a.entityId === u.updateId).length, 1);
  const n = ok(call(C1, 'notification.list')).items.map((x) => x.eventType);
  assert.ok(n.includes('progress_approved') && n.includes('task_completed'));
  assert.equal(n.filter((x) => x === 'task_completed').length, 1);

  // Việc đã hoàn thành là trạng thái cuối
  err(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 100, narrative: 'gửi thêm' }), 'CONFLICT');
  err(call(KSV, 'task.update', { taskId: 'TSK-002', title: 'sửa' }), 'CONFLICT');
  err(call(KSV, 'task.transfer', { taskId: 'TSK-002', newPrimaryUserId: 'USR-005' }), 'CONFLICT');
  assert.equal(integrity().ok, true);
});

test('Từ chối bắt buộc lý do, giữ lịch sử, công việc vẫn mở; duyệt <100% không hoàn thành', () => {
  const u = ok(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 40, narrative: 'tạm thời 40' })).update;
  err(call(KSV, 'progress.review', { updateId: u.updateId, decision: 'reject' }), 'VALIDATION');
  err(call(KSV, 'progress.review', { updateId: u.updateId, decision: 'maybe' }), 'VALIDATION');
  ok(call(KSV, 'progress.review', { updateId: u.updateId, decision: 'reject', comment: 'Thiếu chứng từ' }));
  const g = ok(call(C1, 'task.get', { taskId: 'TSK-002' }));
  assert.equal(g.updates[0].reviewStatus, 'rejected');
  assert.equal(g.updates[0].reviewComment, 'Thiếu chứng từ');
  assert.notEqual(g.task.status, 'completed');
  const n = ok(call(C1, 'notification.list')).items.find((x) => x.eventType === 'progress_rejected');
  assert.ok(n && !n.message.includes('Thiếu chứng từ'), 'thông báo không lộ nội dung lý do');

  const u2 = ok(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 99, narrative: 'gần xong' })).update;
  assert.notEqual(ok(call(KSV, 'progress.review', { updateId: u2.updateId, decision: 'approve' })).task.status, 'completed');
});

test('Tách người lập – người duyệt: không tự duyệt báo cáo của mình', () => {
  const u = ok(call(KSV, 'progress.submit', { taskId: 'TSK-002', progressPct: 20, narrative: 'KSV tự báo cáo' })).update;
  const e = err(call(KSV, 'progress.review', { updateId: u.updateId, decision: 'approve' }), 'FORBIDDEN');
  assert.equal(e.details.reason, 'SELF_REVIEW');
  ok(call(ADMIN, 'progress.review', { updateId: u.updateId, decision: 'approve' }));
});

test('Hàng đợi duyệt: chỉ người có quyền duyệt; seed có UPD-002 đang chờ', () => {
  err(call(C1, 'progress.pending'), 'FORBIDDEN');
  assert.deepEqual(ok(call(KSV, 'progress.pending')).items.map((i) => i.updateId), ['UPD-002']);
});

test('Idempotency: cùng requestId không tạo trùng', () => {
  const rid = 'req-idem-0001';
  const a = ok(call(KSV, 'task.create', { customerId: 'CUS-001', title: 'Một lần', dueAt: dueIn(4), primaryUserId: 'USR-004' }, rid));
  const b = ok(call(KSV, 'task.create', { customerId: 'CUS-001', title: 'Một lần', dueAt: dueIn(4), primaryUserId: 'USR-004' }, rid));
  assert.equal(a.task.taskId, b.task.taskId); assert.equal(b.replayed, true);
  assert.equal(ok(call(KSV, 'task.list', { q: 'Một lần' })).total, 1);
  const s1 = ok(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 10, narrative: 'lần đầu' }, 'req-idem-0002'));
  const s2 = ok(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 10, narrative: 'lần đầu' }, 'req-idem-0002'));
  assert.equal(s1.update.updateId, s2.update.updateId); assert.equal(s2.replayed, true);
});

/* ---------- Khách hàng (R9, R17) ---------- */
test('R17: người đại diện chỉ cho doanh nghiệp; chỉ KSV/Admin duy trì; BGD/CBTD chỉ đọc', () => {
  const b = ok(call(KSV, 'customer.create', { name: 'Công ty Mẫu E', type: 'business', phone: '0900000005', companyRepresentative: 'Nguyễn Văn E' })).customer;
  assert.equal(b.companyRepresentative, 'Nguyễn Văn E');
  assert.match(b.customerCode, /^KH-\d{4}$/);
  err(call(KSV, 'customer.create', { name: 'Cá nhân', type: 'personal', phone: '0900000006', companyRepresentative: 'Ai đó' }), 'VALIDATION');
  err(call(KSV, 'customer.create', { name: 'Cá nhân', type: 'personal', phone: 'abc' }), 'VALIDATION');
  err(call(KSV, 'customer.create', { name: 'Trùng mã', type: 'personal', phone: '0900000007', customerCode: 'KH-TEST-001' }), 'VALIDATION');
  err(call(BGD, 'customer.create', { name: 'X', type: 'personal', phone: '0900000008' }), 'FORBIDDEN');
  err(call(C1, 'customer.update', { customerId: 'CUS-001', name: 'Sửa' }), 'FORBIDDEN');
  const up = ok(call(KSV, 'customer.update', { customerId: b.customerId, type: 'personal' })).customer;
  assert.equal(up.companyRepresentative, '');
});

test('Xóa mềm khách hàng chỉ Admin và khi không còn việc mở', () => {
  err(call(KSV, 'customer.archive', { customerId: 'CUS-003' }), 'FORBIDDEN');
  ok(call(ADMIN, 'customer.archive', { customerId: 'CUS-003' }));                 // chỉ có việc đã hoàn thành
  err(call(ADMIN, 'customer.archive', { customerId: 'CUS-001' }), 'CONFLICT');    // còn việc mở
  assert.equal(ok(call(KSV, 'customer.list')).items.some((c) => c.customerId === 'CUS-003'), false);
});

/* ---------- Dashboard (R10, R15) ---------- */
test('Dashboard theo phạm vi; hạn = hôm nay chưa tính quá hạn (AE8)', () => {
  const k = ok(call(C3, 'dashboard.get')).kpis;
  assert.equal(k.total, 1); assert.equal(k.pendingReviews, undefined);
  const all = ok(call(KSV, 'dashboard.get'));
  assert.equal(all.kpis.total, 4); assert.equal(all.kpis.pendingReviews, 1); assert.ok(all.byAssignee.length >= 2);

  ok(call(KSV, 'task.create', { customerId: 'CUS-001', title: 'Hạn hôm nay', dueAt: dueIn(0), primaryUserId: 'USR-004' }));
  assert.equal(ok(call(KSV, 'dashboard.get')).kpis.overdue, 0);
  assert.equal(ok(call(KSV, 'dashboard.get')).kpis.dueToday, 1);
  Q.Env.setNow('2026-10-14T12:00:00Z');                                           // sang ngày hôm sau
  assert.equal(ok(call(KSV, 'dashboard.get')).kpis.overdue, 1);
  assert.equal(ok(call(KSV, 'task.list', { overdue: true })).items[0].title, 'Hạn hôm nay');
});

test('R15: dashboard Giám đốc chỉ Admin hoặc BGD là Giám đốc; lọc đúng ưu tiên/quá hạn, loại việc hoàn thành', () => {
  err(call(KSV, 'dashboard.director'), 'FORBIDDEN');
  err(call(C1, 'dashboard.director'), 'FORBIDDEN');
  err(call(BGD, 'dashboard.director'), 'FORBIDDEN');
  Q.Env.setProp('DIRECTOR_EMAILS', 'Bgd@Example.com');                            // không phân biệt hoa thường
  const d = ok(call(BGD, 'dashboard.director'));
  assert.deepEqual(d.items.map((i) => i.taskId), ['TSK-001']);                    // TSK-003 high nhưng đã hoàn thành
  assert.equal(ok(call(ADMIN, 'dashboard.director')).total, 1);
  Q.Env.setNow('2026-10-26T12:00:00Z');                                           // TSK-001, TSK-002 quá hạn
  const late = ok(call(ADMIN, 'dashboard.director'));
  assert.deepEqual(late.items.map((i) => i.taskId).sort(), ['TSK-001', 'TSK-002']);
});

/* ---------- Thông báo (R11) ---------- */
test('Thông báo chỉ của chính mình; không đánh dấu đọc hộ người khác', () => {
  const mine = ok(call(C1, 'notification.list'));
  assert.ok(mine.items.every((n) => ['NTF-001', 'NTF-003', 'NTF-004'].includes(n.notificationId)));
  const r = ok(call(C1, 'notification.markRead', { ids: ['NTF-002', 'NTF-003'] }));       // NTF-002 của KSV
  assert.equal(r.updated, 1);
  assert.equal(ok(call(KSV, 'notification.count')).unread, 1);
  assert.equal(ok(call(C1, 'notification.markAllRead')).unread, 0);
});

/* ---------- Quản trị, audit, toàn vẹn (R12, R16) ---------- */
test('Nhật ký kiểm toán: chỉ Admin xem; Store chặn sửa/xóa; không chứa token/mật khẩu', () => {
  ok(call(C1, 'task.start', { taskId: 'TSK-002' }));
  const a = ok(call(ADMIN, 'audit.list', { action: 'task.start' }));
  assert.equal(a.total, 1); assert.equal(a.items[0].actorEmail, C1);
  assert.throws(() => Q.Store.update('AuditLogs', 'AUD-001', { action: 'x' }), /ghi thêm/);
  assert.throws(() => Q.Store.update('Tasks', 'TSK-001', { task_code: 'CV-HACK' }), /bất biến/);
  assert.throws(() => Q.Store.update('TaskUpdates', 'UPD-001', { progress_pct: 5 }), /bất biến/);
  assert.throws(() => Q.Store.update('TaskUpdates', 'UPD-001', { narrative: 'sửa lịch sử' }), /bất biến/);
  const cols = plain(Q.Schema.names).flatMap((t) => plain(Q.Schema.cols(t)));
  assert.equal(cols.some((c) => /password|token|secret|loan|debt/i.test(c)), false);
});

test('Quản trị người dùng: chỉ Admin; email/mã trùng bị chặn; không tự khóa mình / bỏ Admin cuối', () => {
  err(call(KSV, 'user.list'), 'FORBIDDEN');
  assert.equal(ok(call(ADMIN, 'user.list')).total, 7);
  const base = { email: 'Moi@Example.com', employeeCode: 'NV-NEW-1', fullName: 'Người mới', orgUnit: 'DV-THU-NGHIEM', roleId: 'ROL-CBTD' };
  const u = ok(call(ADMIN, 'user.create', base)).user;
  assert.equal(u.email, 'moi@example.com');
  err(call(ADMIN, 'user.create', { ...base, employeeCode: 'NV-NEW-2' }), 'VALIDATION');          // email trùng
  err(call(ADMIN, 'user.create', { ...base, email: 'khac@example.com' }), 'VALIDATION');          // mã trùng
  err(call(ADMIN, 'user.update', { userId: 'USR-001', status: 'inactive' }), 'CONFLICT');
  err(call(ADMIN, 'user.update', { userId: 'USR-001', roleId: 'ROL-KSV' }), 'CONFLICT');
  ok(call(ADMIN, 'user.update', { userId: 'USR-005', status: 'inactive' }));
  err(call('cbtd02@example.com', 'auth.me'), 'FORBIDDEN');                                      // hiệu lực ngay
  assert.deepEqual(ok(call(C1, 'user.options')).items.map((i) => i.userId), ['USR-004']);        // CBTD chỉ thấy chính mình
  assert.ok(ok(call(KSV, 'user.options')).items.length >= 2);
  err(call(ADMIN, 'admin.restore'), 'NOT_ENABLED');
  assert.equal(ok(call(ADMIN, 'admin.backup')).enabled, false);
});

test('Toàn vẹn: dữ liệu mẫu sạch; phát hiện và vá hệ quả duyệt bị đứt giữa chừng', () => {
  assert.equal(integrity().ok, true);
  // Mô phỏng sự cố: đã duyệt 100% nhưng chưa kịp hoàn thành công việc
  const u = ok(call(C1, 'progress.submit', { taskId: 'TSK-002', progressPct: 100, narrative: 'xong hết' })).update;
  Q.Store.update('TaskUpdates', u.updateId, { review_status: 'approved', reviewed_by_user_id: 'USR-003', reviewed_by_email_snapshot: KSV, reviewed_at: '2026-10-13T12:05:00Z', review_comment: '' });
  const bad = integrity();
  assert.equal(bad.ok, false); assert.match(bad.issues[0].message, /chưa hoàn thành/);
  assert.deepEqual(ok(call(ADMIN, 'admin.reconcile')).fixed, [u.updateId]);
  assert.equal(integrity().ok, true);
  assert.equal(ok(call(C1, 'task.get', { taskId: 'TSK-002' })).task.status, 'completed');
});

test('Lược đồ khớp dữ liệu mẫu (CSV ↔ Q.Schema) và seed không có dữ liệu tín dụng', () => {
  const D = plain(Q.SeedData);
  for (const t of Object.keys(D.reference)) assert.deepEqual(Object.keys(D.reference[t][0]), plain(Q.Schema.cols(t)), t);
  for (const t of Object.keys(D.demo)) {
    const have = Object.keys(D.demo[t][0]);
    plain(Q.Schema.cols(t)).forEach((c) => assert.ok(have.includes(c), t + '.' + c));
  }
  assert.equal(JSON.stringify(D).match(/loan|NhomNo|dư nợ/i), null);
});
