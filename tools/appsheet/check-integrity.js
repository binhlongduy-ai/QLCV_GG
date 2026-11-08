// Kiểm tra toàn vẹn sổ dữ liệu AppSheet (U1). Không dùng thư viện ngoài.
// Dùng: node tools/appsheet/check-integrity.js [thư_mục_csv]
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'appsheet-synthetic');

// Lược đồ: tab -> cột đúng thứ tự (khớp docs/appsheet/data-dictionary.md)
const SCHEMA = {
  Roles: ['role_id', 'code', 'name', 'description'],
  Permissions: ['permission_id', 'code', 'name', 'description'],
  RolePermissions: ['role_id', 'permission_id', 'created_at'],
  Users: ['user_id', 'email', 'employee_code', 'full_name', 'role_id', 'org_unit', 'status', 'created_at', 'updated_at'],
  Customers: ['customer_id', 'customer_code', 'name', 'type', 'phone', 'status', 'created_at', 'updated_at'],
  Tasks: ['task_id', 'task_code', 'customer_id', 'title', 'description', 'status', 'priority', 'due_at', 'created_by_user_id', 'completed_at', 'created_at', 'updated_at'],
  TaskAssignees: ['assignment_id', 'task_id', 'user_id', 'assignee_email_snapshot', 'assignment_role', 'assigned_at', 'active'],
  TaskUpdates: ['update_id', 'task_id', 'progress_pct', 'narrative', 'submitted_by_user_id', 'submitted_by_email_snapshot', 'submitted_at', 'review_status', 'reviewed_by_user_id', 'reviewed_by_email_snapshot', 'reviewed_at', 'review_comment'],
  Notifications: ['notification_id', 'recipient_user_id', 'event_type', 'source_record_id', 'request_or_event_key', 'message', 'created_at', 'read_at'],
  AuditLogs: ['audit_id', 'actor_user_id', 'actor_email_snapshot', 'action', 'entity_type', 'entity_id', 'request_or_event_key', 'created_at'],
};

// Cột được phép để trống (các cột còn lại bắt buộc)
const NULLABLE = {
  Tasks: ['description', 'completed_at'],
  TaskUpdates: ['reviewed_by_user_id', 'reviewed_by_email_snapshot', 'reviewed_at', 'review_comment'],
  Notifications: ['read_at'],
};

// Giá trị được phép; mã chờ nghiệp vụ duyệt, xem data-dictionary.md
const ENUMS = {
  'Users.status': ['active', 'inactive'],
  'Customers.type': ['personal', 'business'],
  'Customers.status': ['new', 'managed'],
  'Tasks.status': ['not_started', 'in_progress', 'completed'],
  'Tasks.priority': ['high', 'normal', 'low'],
  'TaskAssignees.assignment_role': ['primary', 'collaborator'],
  'TaskAssignees.active': ['TRUE', 'FALSE'],
  'TaskUpdates.review_status': ['pending', 'approved', 'rejected'],
};

// Khóa duy nhất: [tab, cột]
const UNIQUE = [
  ['Roles', 'role_id'], ['Roles', 'code'],
  ['Permissions', 'permission_id'], ['Permissions', 'code'],
  ['Users', 'user_id'], ['Users', 'email'], ['Users', 'employee_code'],
  ['Customers', 'customer_id'], ['Customers', 'customer_code'],
  ['Tasks', 'task_id'], ['Tasks', 'task_code'],
  ['TaskAssignees', 'assignment_id'],
  ['TaskUpdates', 'update_id'],
  ['Notifications', 'notification_id'], ['Notifications', 'request_or_event_key'],
  ['AuditLogs', 'audit_id'], ['AuditLogs', 'request_or_event_key'],
];

// Tham chiếu: [tab con, cột, tab cha, cột khóa của tab cha]
const REFS = [
  ['Users', 'role_id', 'Roles', 'role_id'],
  ['RolePermissions', 'role_id', 'Roles', 'role_id'],
  ['RolePermissions', 'permission_id', 'Permissions', 'permission_id'],
  ['Tasks', 'customer_id', 'Customers', 'customer_id'],
  ['Tasks', 'created_by_user_id', 'Users', 'user_id'],
  ['TaskAssignees', 'task_id', 'Tasks', 'task_id'],
  ['TaskAssignees', 'user_id', 'Users', 'user_id'],
  ['TaskUpdates', 'task_id', 'Tasks', 'task_id'],
  ['TaskUpdates', 'submitted_by_user_id', 'Users', 'user_id'],
  ['TaskUpdates', 'reviewed_by_user_id', 'Users', 'user_id'],
  ['Notifications', 'recipient_user_id', 'Users', 'user_id'],
  ['AuditLogs', 'actor_user_id', 'Users', 'user_id'],
];

function loadDb(dir) {
  const db = {};
  const errors = [];
  for (const [table, cols] of Object.entries(SCHEMA)) {
    db[table] = [];
    const file = path.join(dir, `${table}.csv`);
    if (!fs.existsSync(file)) {
      errors.push(`Thiếu file ${table}.csv`);
      continue;
    }
    const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
    if ((lines[0] || '').trim() !== cols.join(',')) errors.push(`${table}: tiêu đề cột không khớp lược đồ`);
    lines.slice(1).forEach((line, i) => {
      const values = line.split(',');
      if (values.length !== cols.length) errors.push(`${table} dòng ${i + 2}: có ${values.length} cột, cần ${cols.length}`);
      const row = { __line: i + 2 };
      cols.forEach((col, j) => { row[col] = (values[j] || '').trim(); });
      db[table].push(row);
    });
  }
  return { db, errors };
}

function checkUnique(rows, table, label, keyOf, add) {
  const seen = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue; // ô trống đã được báo ở bước kiểm tra cột bắt buộc
    if (seen.has(key)) add(`${table}.${label}: trùng "${key}" (dòng ${seen.get(key)} và ${row.__line})`);
    else seen.set(key, row.__line);
  }
}

function checkIntegrity(db) {
  const errors = [];
  const add = (msg) => errors.push(msg);

  // 1. Cột bắt buộc không được trống
  for (const [table, cols] of Object.entries(SCHEMA)) {
    for (const row of db[table]) {
      for (const col of cols) {
        if (!row[col] && !(NULLABLE[table] || []).includes(col)) add(`${table} dòng ${row.__line}: thiếu ${col}`);
      }
    }
  }

  // 2. Khóa duy nhất
  for (const [table, col] of UNIQUE) checkUnique(db[table], table, col, r => r[col], add);
  checkUnique(db.RolePermissions, 'RolePermissions', 'role_id+permission_id', r => `${r.role_id}|${r.permission_id}`, add);

  // 3. Tham chiếu (ô trống của cột nullable được bỏ qua)
  for (const [child, col, parent, parentCol] of REFS) {
    const valid = new Set(db[parent].map(r => r[parentCol]));
    for (const row of db[child]) {
      const v = row[col];
      if (v && !valid.has(v)) add(`${child} dòng ${row.__line}: ${col}="${v}" không tồn tại trong ${parent}`);
    }
  }

  // 4. Giá trị enum
  for (const [key, allowed] of Object.entries(ENUMS)) {
    const [table, col] = key.split('.');
    for (const row of db[table]) {
      if (row[col] && !allowed.includes(row[col])) add(`${table} dòng ${row.__line}: ${col}="${row[col]}" không hợp lệ`);
    }
  }

  // 5. Trạng thái duyệt: pending không có người duyệt; approved/rejected phải có đủ thông tin người duyệt
  const reviewFields = ['reviewed_by_user_id', 'reviewed_by_email_snapshot', 'reviewed_at'];
  for (const row of db.TaskUpdates) {
    if (row.review_status === 'pending') {
      if (reviewFields.some(f => row[f])) add(`TaskUpdates dòng ${row.__line}: pending không được có thông tin người duyệt`);
    } else if (row.review_status) {
      const missing = reviewFields.filter(f => !row[f]);
      if (missing.length) add(`TaskUpdates dòng ${row.__line}: ${row.review_status} thiếu ${missing.join(', ')}`);
    }
  }

  // 6. Tiến độ là số nguyên 0-100
  for (const row of db.TaskUpdates) {
    if (!/^\d+$/.test(row.progress_pct) || Number(row.progress_pct) > 100) {
      add(`TaskUpdates dòng ${row.__line}: progress_pct="${row.progress_pct}" phải là số nguyên 0-100`);
    }
  }

  // 7. Đủ bốn vai trò nghiệp vụ
  const roleCodeById = new Map(db.Roles.map(r => [r.role_id, r.code]));
  for (const code of ['Admin', 'BGD', 'KSV', 'CBTD']) {
    if (!db.Roles.some(r => r.code === code)) add(`Thiếu vai trò ${code} trong Roles`);
  }

  // 8. Phân công và quy tắc nghiệp vụ theo từng công việc
  for (const task of db.Tasks) {
    const active = db.TaskAssignees.filter(a => a.task_id === task.task_id && a.active === 'TRUE');
    const primaries = active.filter(a => a.assignment_role === 'primary');
    const collaborators = active.filter(a => a.assignment_role === 'collaborator');
    if (primaries.length !== 1) add(`${task.task_code}: cần đúng 1 CBTD chính đang hoạt động, hiện có ${primaries.length}`);
    if (collaborators.length > 1) add(`${task.task_code}: tối đa 1 CBTD phối hợp đang hoạt động, hiện có ${collaborators.length}`);
    if (primaries.length === 1 && collaborators.length === 1 && primaries[0].user_id === collaborators[0].user_id) {
      add(`${task.task_code}: người phối hợp trùng người chính`);
    }

    // R6: CBTD chỉ tạo công việc khi tự là người phụ trách chính
    const creator = db.Users.find(u => u.user_id === task.created_by_user_id);
    if (creator && roleCodeById.get(creator.role_id) === 'CBTD' && primaries.length === 1 && primaries[0].user_id !== creator.user_id) {
      add(`${task.task_code}: CBTD chỉ được tạo việc khi tự là người phụ trách chính`);
    }

    // R8: hoàn thành khi và chỉ khi có tiến độ 100% được duyệt
    const hasApproved100 = db.TaskUpdates.some(u => u.task_id === task.task_id && u.review_status === 'approved' && u.progress_pct === '100');
    if (task.status === 'completed' && !hasApproved100) add(`${task.task_code}: status completed nhưng không có tiến độ 100% được duyệt`);
    if (task.status !== 'completed' && hasApproved100) add(`${task.task_code}: đã có tiến độ 100% được duyệt nhưng status chưa completed`);
    if ((task.status === 'completed') !== Boolean(task.completed_at)) add(`${task.task_code}: completed_at chỉ có khi status = completed`);
  }

  return errors;
}

// Ca lỗi cố ý: mỗi ca phải bị bộ kiểm tra phát hiện đúng
function selfTest(db) {
  const cases = [
    { name: 'trùng customer_code', mutate: d => { d.Customers[1].customer_code = d.Customers[0].customer_code; }, expect: 'customer_code' },
    { name: 'hai CBTD chính đang hoạt động', mutate: d => { d.TaskAssignees.push({ ...d.TaskAssignees[0], assignment_id: 'ASG-099', user_id: 'USR-005', assignee_email_snapshot: 'cbtd02@example.com' }); }, expect: 'cần đúng 1 CBTD chính' },
    { name: 'CBTD tạo việc cho người khác', mutate: d => { d.Tasks[1].created_by_user_id = 'USR-005'; }, expect: 'CBTD chỉ được tạo việc' },
    { name: 'completed không có duyệt 100%', mutate: d => { Object.assign(d.TaskUpdates[3], { review_status: 'pending', reviewed_by_user_id: '', reviewed_by_email_snapshot: '', reviewed_at: '' }); }, expect: 'không có tiến độ 100% được duyệt' },
    { name: 'tham chiếu mồ côi', mutate: d => { d.TaskUpdates[0].task_id = 'TSK-999'; }, expect: 'không tồn tại trong Tasks' },
    { name: 'thiếu snapshot email tác nhân', mutate: d => { d.AuditLogs[0].actor_email_snapshot = ''; }, expect: 'thiếu actor_email_snapshot' },
    // U1-T9: tiến độ ngoài 0–100 hoặc không phải số nguyên
    { name: 'tiến độ ngoài phạm vi (> 100)', mutate: d => { d.TaskUpdates[0].progress_pct = '150'; }, expect: 'progress_pct' },
    { name: 'tiến độ không phải số (chuỗi tự do)', mutate: d => { d.TaskUpdates[0].progress_pct = '50%'; }, expect: 'progress_pct' },
    { name: 'tiến độ số âm', mutate: d => { d.TaskUpdates[0].progress_pct = '-1'; }, expect: 'progress_pct' },
  ];
  let passed = 0;
  for (const c of cases) {
    const copy = JSON.parse(JSON.stringify(db));
    c.mutate(copy);
    const ok = checkIntegrity(copy).some(e => e.includes(c.expect));
    if (ok) passed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${c.name}`);
  }
  return { passed, total: cases.length };
}

function main() {
  const dir = process.argv[2] || DEFAULT_DIR;
  const { db, errors: loadErrors } = loadDb(dir);
  const errors = [...loadErrors, ...checkIntegrity(db)];

  console.log(`Sổ dữ liệu: ${dir}\n`);
  for (const table of Object.keys(SCHEMA)) console.log(`  ${table}: ${db[table].length} dòng`);

  console.log('\nKiểm tra toàn vẹn:');
  if (errors.length) {
    errors.forEach(e => console.log(`  - ${e}`));
    console.log(`  KHÔNG ĐẠT: ${errors.length} lỗi`);
  } else {
    console.log('  ĐẠT: không có khóa trùng, tham chiếu mồ côi hoặc vi phạm quy tắc');
  }

  console.log('\nKiểm thử bộ kiểm tra (ca lỗi cố ý phải bị phát hiện):');
  const { passed, total } = selfTest(db);
  console.log(`  ${passed}/${total} ca được phát hiện đúng`);

  process.exitCode = errors.length === 0 && passed === total ? 0 : 1;
}

main();
