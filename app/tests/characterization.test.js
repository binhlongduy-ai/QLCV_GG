'use strict';
/**
 * Kiểm thử đặc trưng hành vi (characterization): chạy một kịch bản xác định qua mọi action của API,
 * gồm cả nhánh thành công, nhánh lỗi, và thử lại idempotent (cùng requestId). Kết quả (data/error) được so
 * với tests/golden/characterization.json. Dùng để chứng minh tái cấu trúc KHÔNG đổi hành vi.
 *
 * Cập nhật golden (chỉ khi CỐ Ý đổi hành vi, và phải ghi rõ lý do trong commit):
 *   UPDATE_GOLDEN=1 node --test tests/characterization.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fresh, plain } = require('./harness');

const GOLDEN = path.join(__dirname, 'golden', 'characterization.json');

const ADMIN = 'admin@example.com', BGD = 'bgd@example.com', KSV = 'ksv01@example.com';
const C1 = 'cbtd01@example.com', C2 = 'cbtd02@example.com', C3 = 'cbtd03@example.com', INACTIVE = 'cbtd-inactive@example.com';

// [người gọi, action, tham số, requestId tùy chọn]. Giữ đúng thứ tự: kết quả phụ thuộc vào trạng thái trước đó.
const SCENARIO = [
  [null, 'system.health'],
  [null, 'auth.me'],
  [C1, 'auth.me'],
  [ADMIN, 'auth.me'],
  [BGD, 'auth.me'],
  [KSV, 'auth.me'],
  [INACTIVE, 'auth.me'],
  ['ghost@example.com', 'auth.me'],
  [C1, 'nope.nothing'],
  [C1, 'task.list'],
  [C1, 'task.list', { status: 'in_progress', sortBy: 'dueAt', dir: 'desc' }],
  [KSV, 'task.list', { q: 'mau', page: 1, pageSize: 2 }],
  [KSV, 'task.list', { overdue: true, includeArchived: true }],
  [ADMIN, 'task.list', { priority: 'high', sortBy: 'priority' }],
  [C3, 'task.get', { taskId: 'TSK-001' }],
  [C1, 'task.get', { taskId: 'TSK-001' }],
  [C1, 'task.get', { taskId: 'TSK-999' }],
  [KSV, 'task.get', { taskId: 'TSK-004' }],
  [C1, 'task.create', { title: 'Việc mới của CBTD01', customerId: 'CUS-001', primaryUserId: C2, dueAt: '2026-11-30' }],
  [C1, 'task.create', { title: 'Việc mới của CBTD01', customerId: 'CUS-001', dueAt: '2026-11-30', priority: 'high' }, 'rqcreate-0001'],
  [C1, 'task.create', { title: 'Việc mới của CBTD01', customerId: 'CUS-001', dueAt: '2026-11-30', priority: 'high' }, 'rqcreate-0001'],
  [KSV, 'task.create', { title: 'Việc của KSV', customerId: 'CUS-002', primaryUserId: C1, collaboratorUserId: C1, dueAt: '2026-12-01' }],
  [KSV, 'task.create', { title: 'Việc của KSV', customerId: 'CUS-002', primaryUserId: C1, collaboratorUserId: C2, dueAt: '2025-01-01' }],
  [KSV, 'task.create', { title: '', customerId: 'CUS-002', primaryUserId: C1, dueAt: '2026-12-01' }],
  [KSV, 'task.create', { title: 'Việc có người không phải CBTD', customerId: 'CUS-002', primaryUserId: BGD, dueAt: '2026-12-01' }],
  [KSV, 'task.create', { title: 'Việc khách hàng sai', customerId: 'CUS-404', primaryUserId: C1, dueAt: '2026-12-01' }],
  [BGD, 'task.create', { title: 'Việc của BGD', customerId: 'CUS-003', primaryUserId: C3, dueAt: '2026-12-05', description: 'Mô tả mẫu' }],
  [C3, 'task.update', { taskId: 'TSK-004', title: 'Đổi tiêu đề', priority: 'low' }],
  [KSV, 'task.update', { taskId: 'TSK-004', title: 'Báo cáo tiến độ mẫu D (cập nhật)', priority: 'high', dueAt: '2026-11-15' }],
  [KSV, 'task.update', { taskId: 'TSK-004', status: 'completed' }],
  [KSV, 'task.update', { taskId: 'TSK-004' }],
  [C1, 'task.start', { taskId: 'TSK-002' }],
  [C1, 'task.start', { taskId: 'TSK-002' }],
  [C2, 'task.start', { taskId: 'TSK-002' }],
  [KSV, 'task.setCollaborator', { taskId: 'TSK-002', userId: C3 }],
  [KSV, 'task.setCollaborator', { taskId: 'TSK-002', userId: C1 }],
  [KSV, 'task.setCollaborator', { taskId: 'TSK-002' }],
  [KSV, 'task.transfer', { taskId: 'TSK-004', newPrimaryUserId: C1 }],
  [KSV, 'task.transfer', { taskId: 'TSK-004', newPrimaryUserId: C3 }],
  [C1, 'task.transfer', { taskId: 'TSK-004', newPrimaryUserId: C1 }],
  [KSV, 'task.archive', { taskId: 'TSK-004', archived: true }],
  [KSV, 'task.archive', { taskId: 'TSK-004', archived: false }],
  [C1, 'progress.submit', { taskId: 'TSK-001', progressPct: 70, narrative: 'Đã hoàn tất đối chiếu hồ sơ mẫu' }],
  [C1, 'progress.submit', { taskId: 'TSK-001', progressPct: 70, narrative: 'Đã hoàn tất đối chiếu hồ sơ mẫu' }, 'rqsubmit-0001'],
  [C1, 'progress.submit', { taskId: 'TSK-001', progressPct: 70, narrative: 'Đã hoàn tất đối chiếu hồ sơ mẫu' }, 'rqsubmit-0001'],
  [C1, 'progress.submit', { taskId: 'TSK-001', progressPct: '50%', narrative: 'Sai định dạng tiến độ' }],
  [C1, 'progress.submit', { taskId: 'TSK-001', progressPct: 40, narrative: 'ngắn' }],
  [C3, 'progress.submit', { taskId: 'TSK-001', progressPct: 40, narrative: 'Không được giao việc này' }],
  [C1, 'progress.submit', { taskId: 'TSK-003', progressPct: 90, narrative: 'Đã hoàn thành công việc' }],
  [KSV, 'progress.pending', {}],
  [KSV, 'progress.pending', { page: 1, pageSize: 1 }],
  [C1, 'progress.pending', {}],
  [C1, 'progress.review', { updateId: 'UPD-005', decision: 'approve' }],
  [KSV, 'progress.review', { updateId: 'UPD-005', decision: 'approve' }],
  [KSV, 'progress.review', { updateId: 'UPD-005', decision: 'approve' }],
  [KSV, 'progress.review', { updateId: 'UPD-006', decision: 'reject' }],
  [KSV, 'progress.review', { updateId: 'UPD-006', decision: 'reject', comment: 'Thiếu chứng từ mẫu' }],
  [KSV, 'progress.review', { updateId: 'UPD-006', decision: 'approve' }],
  [KSV, 'progress.review', { updateId: 'UPD-404', decision: 'approve' }],
  [KSV, 'progress.review', { updateId: 'UPD-002', decision: 'maybe' }],
  [ADMIN, 'progress.review', { updateId: 'UPD-002', decision: 'approve' }],
  [C1, 'customer.list', { q: 'mau' }],
  [KSV, 'customer.list', { q: 'mau', type: 'business', page: 1, pageSize: 5 }],
  [C2, 'customer.list', {}],
  [C3, 'customer.get', { customerId: 'CUS-003' }],
  [C1, 'customer.get', { customerId: 'CUS-001' }],
  [KSV, 'customer.create', { name: 'Khách hàng mới', type: 'personal', phone: '0901112233', status: 'new' }],
  [KSV, 'customer.create', { name: 'Công ty mới', type: 'business', phone: '0901112244', companyRepresentative: 'Người đại diện', customerCode: 'DN-NEW-01' }, 'rqcustcreate-01'],
  [KSV, 'customer.create', { name: 'Công ty mới', type: 'business', phone: '0901112244', companyRepresentative: 'Người đại diện', customerCode: 'DN-NEW-01' }, 'rqcustcreate-01'],
  [KSV, 'customer.create', { name: 'Cá nhân sai', type: 'personal', phone: '0901112255', companyRepresentative: 'Không được có' }],
  [KSV, 'customer.create', { name: 'Trùng mã', type: 'personal', phone: '0901112266', customerCode: 'DN-NEW-01' }],
  [KSV, 'customer.create', { name: 'SĐT sai', type: 'personal', phone: 'abc' }],
  [C1, 'customer.create', { name: 'CBTD không được tạo', type: 'personal', phone: '0901112277' }],
  [KSV, 'customer.update', { customerId: 'CUS-002', phone: '0909998877', companyRepresentative: 'Người đại diện đổi' }],
  [KSV, 'customer.update', { customerId: 'CUS-001', type: 'business', companyRepresentative: 'Đại diện A' }],
  [KSV, 'customer.update', { customerId: 'CUS-001', type: 'personal' }],
  [KSV, 'customer.update', { customerId: 'CUS-001' }],
  [KSV, 'customer.update', { customerId: 'CUS-404', name: 'Không có' }],
  [C1, 'customer.update', { customerId: 'CUS-001', name: 'CBTD không được sửa' }],
  [ADMIN, 'customer.archive', { customerId: 'CUS-002', archived: true }],
  [ADMIN, 'customer.archive', { customerId: 'CUS-001', archived: true }],
  [KSV, 'customer.archive', { customerId: 'CUS-003', archived: true }],
  [ADMIN, 'customer.archive', { customerId: 'CUS-002', archived: false }],
  [ADMIN, 'customer.archive', { customerId: 'CUS-404' }],
  [C1, 'notification.count', {}],
  [C1, 'notification.list', {}],
  [C1, 'notification.list', { unreadOnly: true, page: 1, pageSize: 2 }],
  [KSV, 'notification.list', {}],
  [C1, 'notification.markRead', { ids: ['NTF-001', 'NTF-404', 'NTF-004'] }],
  [KSV, 'notification.markRead', { ids: ['NTF-001'] }],
  [C1, 'notification.markAllRead', {}],
  [C1, 'notification.count', {}],
  [ADMIN, 'user.options', {}],
  [C1, 'user.options', {}],
  [BGD, 'user.options', {}],
  [KSV, 'user.options', {}],
  [ADMIN, 'user.list', {}],
  [ADMIN, 'user.list', { status: 'inactive' }],
  [ADMIN, 'user.list', { roleCode: 'CBTD', q: 'mau', page: 1, pageSize: 2 }],
  [KSV, 'user.list', {}],
  [ADMIN, 'user.create', { email: 'Moi.Nguoi@Example.com', employeeCode: 'NV-TEST-010', fullName: 'Người mới', orgUnit: 'DV-THU-NGHIEM', roleId: 'ROL-CBTD' }],
  [ADMIN, 'user.create', { email: 'moi.nguoi@example.com', employeeCode: 'NV-TEST-011', fullName: 'Trùng email', orgUnit: 'DV-THU-NGHIEM', roleId: 'ROL-CBTD' }],
  [ADMIN, 'user.create', { email: 'khong-hop-le', employeeCode: 'NV-TEST-012', fullName: 'Email lỗi', orgUnit: 'X', roleId: 'ROL-CBTD' }],
  [ADMIN, 'user.create', { email: 'vai.tro@example.com', employeeCode: 'NV-TEST-013', fullName: 'Vai trò lạ', orgUnit: 'X', roleId: 'ROL-XYZ' }],
  [ADMIN, 'user.create', { email: 'rq@example.com', employeeCode: 'NV-TEST-014', fullName: 'Có requestId', orgUnit: 'X', roleId: 'ROL-KSV' }, 'rquser-create-01'],
  [ADMIN, 'user.create', { email: 'rq@example.com', employeeCode: 'NV-TEST-014', fullName: 'Có requestId', orgUnit: 'X', roleId: 'ROL-KSV' }, 'rquser-create-01'],
  [KSV, 'user.create', { email: 'k@example.com', employeeCode: 'NV-TEST-015', fullName: 'KSV không được tạo', orgUnit: 'X', roleId: 'ROL-CBTD' }],
  [ADMIN, 'user.update', { userId: 'USR-004', fullName: 'CBTD mẫu 01 (đã sửa)', orgUnit: 'DV-MOI' }],
  [ADMIN, 'user.update', { userId: 'USR-001', roleId: 'ROL-KSV' }],
  [ADMIN, 'user.update', { userId: 'USR-001', status: 'inactive' }],
  [ADMIN, 'user.update', { userId: 'USR-002', employeeCode: 'NV-TEST-003' }],
  [ADMIN, 'user.update', { userId: 'USR-002', status: 'bogus' }],
  [ADMIN, 'user.update', { userId: 'USR-404', fullName: 'Không có' }],
  [ADMIN, 'user.update', { userId: 'USR-002' }],
  [KSV, 'user.update', { userId: 'USR-004', fullName: 'Không được sửa' }],
  [ADMIN, 'audit.list', {}],
  [ADMIN, 'audit.list', { action: 'task.create', page: 1, pageSize: 3 }],
  [ADMIN, 'audit.list', { entityId: 'TSK-001', from: '2026-01-01', to: '2026-12-31' }],
  [KSV, 'audit.list', {}],
  [ADMIN, 'admin.integrity', {}],
  [KSV, 'admin.integrity', {}],
  [ADMIN, 'admin.reconcile', {}],
  [ADMIN, 'admin.backup', {}, 'rqbackup-0001'],
  [ADMIN, 'admin.restore', {}, 'rqrestore-001'],
  [KSV, 'admin.restore', {}, 'rqrestore-002'],
  [ADMIN, 'nope.action', {}],
  [KSV, 'dashboard.get', {}],
  [BGD, 'dashboard.get', {}],
  [BGD, 'dashboard.director', {}],
  [KSV, 'dashboard.director', {}],
  [KSV, 'dashboard.overview', {}],
  [BGD, 'dashboard.overview', {}],
  [C1, 'dashboard.overview', {}],
  [C3, 'dashboard.get', {}],
  [ADMIN, 'dashboard.get', {}],
  [ADMIN, 'task.list', { mine: true }],
  [C2, 'task.list', { mine: true }],
  [KSV, 'task.list', { assigneeUserId: C1, customerId: 'CUS-001' }],
  [KSV, 'task.list', { status: 'completed', sortBy: 'createdAt', dir: 'desc' }],
  [KSV, 'task.list', { sortBy: 'updatedAt' }],
];

function run(env) {
  const out = [];
  for (const [who, action, params, rid] of SCENARIO) {
    const res = env.call(who, action, params || {}, rid);
    out.push({ who, action, params: params || {}, requestId: rid || null, ok: res.ok, data: res.data === undefined ? null : res.data, error: res.error || null });
  }
  return out;
}

test('kịch bản đặc trưng hành vi khớp golden (mọi action, cả nhánh lỗi và replay)', () => {
  const env = fresh();
  const actual = plain(run(env));
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n', 'utf8');
    console.log('golden đã ghi: ' + GOLDEN + ' (' + actual.length + ' bước)');
    return;
  }
  assert.ok(fs.existsSync(GOLDEN), 'Thiếu golden. Chạy với UPDATE_GOLDEN=1 trên mã gốc để tạo.');
  const expected = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.equal(actual.length, expected.length, 'số bước khác golden');
  for (let i = 0; i < expected.length; i++) {
    assert.deepEqual(actual[i], expected[i], 'lệch hành vi tại bước ' + i + ': ' + expected[i].who + ' ' + expected[i].action);
  }
});

test('kịch bản đặc trưng hành vi bao phủ đủ action trong bảng ACTIONS của Router', () => {
  const env = fresh();
  const used = new Set(SCENARIO.map((s) => s[1]));
  const all = env.Q.actions();
  const missing = all.filter((a) => !used.has(a));
  assert.equal(missing.length, 0, 'action chưa có trong kịch bản: ' + missing.join(', '));
});
