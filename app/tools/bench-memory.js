/**
 * Đo hiệu năng trên bộ dữ liệu tổng hợp lớn (trình giả lập bộ nhớ). Dùng để so sánh trước/sau khi thay đổi mã.
 * Hai chỉ số: thời gian (ms, trung vị) và số dòng đọc từ driver mỗi request (proxy cho số lần đọc Sheets).
 * Lưu ý: thời gian bị chi phối bởi sao chép JSON của driver bộ nhớ; đọc cột 'dòng đọc' để so sánh chi phí thật.
 * Chạy: node tools/bench-memory.js [file_kết_quả.json]
 */
'use strict';
const path = require('path');
const { fresh } = require(path.join(__dirname, '..', 'tests', 'harness.js'));
const env = fresh(); const { Q, call } = env;
const ITER = 7;
// --- dữ liệu lớn: sinh từ dữ liệu mẫu hiện có ---
const snap = Q.Dev.dump();
const pad = (n, w = 4) => String(n).padStart(w, '0');
const roleCBTD = snap.Roles.find((r) => r.code === 'CBTD').role_id;
const N_USERS = 2000, N_CUST = 3000, N_TASK = 5000, N_UPD = 10000, N_NTF = 20000, N_AUD = 20000;
for (let i = 1; i <= N_USERS; i++) snap.Users.push({ user_id: 'USR-' + pad(100 + i), email: `cb${i}@bench.local`, employee_code: 'BN-' + i, full_name: 'CBTD ' + i, role_id: roleCBTD, org_unit: 'DV-' + (i % 20), status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
for (let i = 1; i <= N_CUST; i++) snap.Customers.push({ customer_id: 'CUS-' + pad(100 + i), customer_code: 'KH-B' + pad(i), name: 'Khách ' + i, type: i % 3 ? 'personal' : 'business', phone: '090' + pad(i, 7), status: 'managed', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', company_representative: '', archived_at: '' });
const users = snap.Users.filter((u) => u.role_id === roleCBTD);
const due = (i) => new Date(Date.parse('2026-10-13T00:00:00Z') + ((i * 7) % 90 - 30) * 86400000).toISOString().slice(0, 10);
const st = ['not_started', 'in_progress', 'completed'];
for (let i = 1; i <= N_TASK; i++) {
  const id = 'TSK-' + pad(100 + i), status = st[i % 3];
  snap.Tasks.push({ task_id: id, task_code: 'CV-' + pad(100 + i), customer_id: snap.Customers[i % snap.Customers.length].customer_id, title: 'Công việc số ' + i + ' hồ sơ tín dụng', description: '', status, priority: ['high', 'normal', 'low'][i % 3], due_at: due(i), created_by_user_id: 'USR-001', completed_at: status === 'completed' ? '2026-10-10T00:00:00Z' : '', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', archived_at: '' });
  snap.TaskAssignees.push({ assignment_id: 'ASG-' + pad(100 + i), task_id: id, user_id: users[i % users.length].user_id, assignee_email_snapshot: users[i % users.length].email, assignment_role: 'primary', assigned_at: '2026-10-01T00:00:00Z', active: 'TRUE' });
  if (i % 3 === 0) snap.TaskAssignees.push({ assignment_id: 'ASGC-' + pad(100 + i), task_id: id, user_id: users[(i + 1) % users.length].user_id, assignee_email_snapshot: users[(i + 1) % users.length].email, assignment_role: 'collaborator', assigned_at: '2026-10-01T00:00:00Z', active: 'TRUE' });
}
for (let i = 1; i <= N_UPD; i++) {
  const t = snap.Tasks[i % N_TASK], s = ['pending', 'approved', 'rejected'][i % 3];
  snap.TaskUpdates.push({ update_id: 'UPD-' + pad(100 + i), task_id: t.task_id, progress_pct: i % 101, narrative: 'Diễn giải tiến độ số ' + i, submitted_by_user_id: users[i % users.length].user_id, submitted_by_email_snapshot: users[i % users.length].email, submitted_at: '2026-10-05T00:00:00Z', review_status: s, reviewed_by_user_id: s === 'pending' ? '' : 'USR-003', reviewed_by_email_snapshot: s === 'pending' ? '' : 'ksv01@example.com', reviewed_at: s === 'pending' ? '' : '2026-10-06T00:00:00Z', review_comment: s === 'rejected' ? 'Thiếu chứng từ' : '' });
}
for (let i = 1; i <= N_NTF; i++) snap.Notifications.push({ notification_id: 'NTF-' + pad(100 + i), recipient_user_id: users[i % users.length].user_id, event_type: 'task_assigned', source_record_id: 'ASG-' + pad(100 + i), request_or_event_key: 'bench-ntf-' + i, message: 'Thông báo ' + i, created_at: '2026-10-05T00:00:00Z', read_at: i % 2 ? '' : '2026-10-06T00:00:00Z' });
for (let i = 1; i <= N_AUD; i++) snap.AuditLogs.push({ audit_id: 'AUD-' + pad(100 + i), actor_user_id: 'USR-001', actor_email_snapshot: 'admin@example.com', action: 'task.update', entity_type: 'Task', entity_id: snap.Tasks[i % N_TASK].task_id, request_or_event_key: 'bench-aud-' + i, created_at: '2026-10-05T00:00:00Z' });
Q.Dev.load(snap);

// --- đếm dòng đọc từ driver mỗi request (proxy cho số lần đọc Sheets) ---
let rowsRead = 0; const origRead = Q.MemoryDriver.read;
Q.MemoryDriver.read = (t) => { const r = origRead(t); rowsRead += r.length; return r; };

const ADMIN = 'admin@example.com', KSV = 'ksv01@example.com', C1 = 'cb1@bench.local';
const cases = [
  ['auth.me', ADMIN, 'auth.me', {}],
  ['task.list (ADMIN, trang 1)', ADMIN, 'task.list', {}],
  ['task.list (ADMIN, q + sort)', ADMIN, 'task.list', { q: 'hồ sơ', sortBy: 'priority' }],
  ['task.list (CBTD, trang 1)', C1, 'task.list', {}],
  ['task.get (ADMIN)', ADMIN, 'task.get', { taskId: 'TSK-0101' }],
  ['dashboard.overview (ADMIN)', ADMIN, 'dashboard.overview', {}],
  ['dashboard.get (KSV)', KSV, 'dashboard.get', {}],
  ['progress.pending (KSV)', KSV, 'progress.pending', {}],
  ['customer.list (ADMIN, trang 1)', ADMIN, 'customer.list', {}],
  ['customer.list (CBTD)', C1, 'customer.list', {}],
  ['notification.list (CBTD)', C1, 'notification.list', {}],
  ['user.list (ADMIN)', ADMIN, 'user.list', {}],
  ['audit.list (ADMIN, trang 1)', ADMIN, 'audit.list', {}],
  ['admin.integrity (ADMIN)', ADMIN, 'admin.integrity', {}],
];
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {};
for (const [label, who, action, params] of cases) {
  call(who, action, params); // làm nóng cache vai trò/quyền và token
  const times = []; let rows = 0;
  for (let i = 0; i < ITER; i++) {
    rowsRead = 0; const t0 = process.hrtime.bigint();
    const r = call(who, action, params);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6); rows = rowsRead;
    if (!r.ok) { console.log('LỖI', label, r.error.code); break; }
  }
  out[label] = { ms: +median(times).toFixed(1), rowsRead: rows };
  console.log(label.padEnd(34), String(out[label].ms).padStart(9), 'ms', String(rows).padStart(8), 'dòng đọc/request');
}
if (process.argv[2]) require('fs').writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
