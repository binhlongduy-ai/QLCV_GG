/**
 * QLCV CBTD — Script tạo và nạp sổ dữ liệu AppSheet (U2 chuẩn bị)
 *
 * CÁCH DÙNG:
 *   1. Tạo một Google Sheets mới (tên khuyến nghị: "QLCV_CBTD_Pilot_<YYYY-MM-DD>")
 *   2. Mở Extensions → Apps Script
 *   3. Dán toàn bộ nội dung file này vào editor
 *   4. Chạy hàm: setupWorkbook()
 *   5. Kiểm tra kết quả trong sheet "SetupLog"
 *
 * KẾT QUẢ:
 *   - Tạo đủ 10 tab theo đúng lược đồ trong data-dictionary.md
 *   - Nạp dữ liệu tổng hợp từ SYNTHETIC_DATA (không phải dữ liệu thật)
 *   - Ghi log vào tab SetupLog
 *   - Chạy được nhiều lần (idempotent): xóa và tạo lại tab nếu đã tồn tại
 *
 * QUAN TRỌNG:
 *   - Chỉ dùng dữ liệu tổng hợp (email @example.com) — không nạp dữ liệu thật (R13)
 *   - Sau khi chạy, chủ ứng dụng cần hạn chế quyền chia sẻ sổ theo U2
 *   - Xem docs/appsheet/u2-appsheet-setup-guide.md để cấu hình AppSheet tiếp theo
 */

// ===========================================================================
// LƯỢC ĐỒ — khớp docs/appsheet/data-dictionary.md
// ===========================================================================
const SCHEMA = {
  Roles:           ['role_id', 'code', 'name', 'description'],
  Permissions:     ['permission_id', 'code', 'name', 'description'],
  RolePermissions: ['role_id', 'permission_id', 'created_at'],
  Users:           ['user_id', 'email', 'employee_code', 'full_name', 'role_id', 'org_unit', 'status', 'created_at', 'updated_at'],
  Customers:       ['customer_id', 'customer_code', 'name', 'type', 'phone', 'status', 'created_at', 'updated_at'],
  Tasks:           ['task_id', 'task_code', 'customer_id', 'title', 'description', 'status', 'priority', 'due_at', 'created_by_user_id', 'completed_at', 'created_at', 'updated_at'],
  TaskAssignees:   ['assignment_id', 'task_id', 'user_id', 'assignee_email_snapshot', 'assignment_role', 'assigned_at', 'active'],
  TaskUpdates:     ['update_id', 'task_id', 'progress_pct', 'narrative', 'submitted_by_user_id', 'submitted_by_email_snapshot', 'submitted_at', 'review_status', 'reviewed_by_user_id', 'reviewed_by_email_snapshot', 'reviewed_at', 'review_comment'],
  Notifications:   ['notification_id', 'recipient_user_id', 'event_type', 'source_record_id', 'request_or_event_key', 'message', 'created_at', 'read_at'],
  AuditLogs:       ['audit_id', 'actor_user_id', 'actor_email_snapshot', 'action', 'entity_type', 'entity_id', 'request_or_event_key', 'created_at'],
};

// Thứ tự tạo tab (đặt tab hệ thống cuối để dễ điều hướng)
const TAB_ORDER = ['Roles', 'Permissions', 'RolePermissions', 'Users', 'Customers', 'Tasks', 'TaskAssignees', 'TaskUpdates', 'Notifications', 'AuditLogs'];

// Màu header theo nhóm chức năng
const HEADER_COLORS = {
  Roles: '#E8F5E9', Permissions: '#E8F5E9', RolePermissions: '#E8F5E9',
  Users: '#E3F2FD',
  Customers: '#FFF8E1',
  Tasks: '#FCE4EC', TaskAssignees: '#FCE4EC', TaskUpdates: '#FCE4EC',
  Notifications: '#F3E5F5',
  AuditLogs: '#EFEBE9',
};

// ===========================================================================
// DỮ LIỆU TỔNG HỢP — khớp data/appsheet-synthetic/*.csv
// ===========================================================================
const SYNTHETIC_DATA = {
  Roles: [
    ['ROL-ADMIN', 'Admin', 'Quản trị', 'Quản lý người dùng và toàn bộ phạm vi thí điểm'],
    ['ROL-BGD',   'BGD',   'Ban Giám đốc', 'Xem phạm vi thí điểm; tạo và giao việc; chỉ đọc khách hàng'],
    ['ROL-KSV',   'KSV',   'Kiểm soát viên', 'Quản lý công việc; duyệt tiến độ; duy trì khách hàng'],
    ['ROL-CBTD',  'CBTD',  'Cán bộ tín dụng', 'Xem và xử lý công việc được giao; gửi tiến độ'],
  ],
  Permissions: [
    ['PER-01', 'task.view',              'Xem công việc',                   'Xem công việc trong phạm vi được phép'],
    ['PER-02', 'task.create',            'Tạo công việc',                   'Tạo công việc và giao người thực hiện'],
    ['PER-03', 'task.update',            'Cập nhật công việc',              'Cập nhật phân công và quản trị công việc; lưu trữ thay vì xóa cứng'],
    ['PER-04', 'task.transfer',          'Chuyển giao người thực hiện chính','Đổi CBTD chính của công việc'],
    ['PER-05', 'task.start',             'Bắt đầu công việc',               'Chuyển công việc được giao sang Đang thực hiện'],
    ['PER-06', 'customer.view',          'Xem khách hàng',                  'Xem khách hàng trong phạm vi được phép'],
    ['PER-07', 'customer.maintain',      'Duy trì khách hàng',              'Tạo và cập nhật khách hàng; không xóa'],
    ['PER-08', 'customer.delete',        'Xóa khách hàng',                  'Xóa khách hàng (soft delete)'],
    ['PER-09', 'progress.submit',        'Gửi tiến độ',                     'Gửi cập nhật tiến độ cho công việc được giao'],
    ['PER-10', 'progress.review',        'Duyệt tiến độ',                   'Duyệt hoặc từ chối cập nhật tiến độ'],
    ['PER-11', 'dashboard.view',         'Xem bảng điều khiển',             'Số liệu trong phạm vi được phép'],
    ['PER-12', 'dashboard.view_director','Bảng điều khiển Giám đốc',        'Có điều kiện; chờ xác nhận cho BGD'],
    ['PER-13', 'audit.view',             'Xem nhật ký kiểm toán',           'Xem nhật ký kiểm toán'],
    ['PER-14', 'notification.view',      'Xem thông báo',                   'Xem thông báo của chính mình'],
    ['PER-15', 'user.manage',            'Quản lý người dùng',              'Quản lý người dùng; Backup và Restore'],
  ],
  RolePermissions: [
    // Admin — 15 quyền
    ...['PER-01','PER-02','PER-03','PER-04','PER-05','PER-06','PER-07','PER-08','PER-09','PER-10','PER-11','PER-12','PER-13','PER-14','PER-15'].map(p => ['ROL-ADMIN', p, '2026-10-13T07:50:00Z']),
    // BGD — 8 quyền
    ...['PER-01','PER-02','PER-03','PER-05','PER-06','PER-09','PER-11','PER-14'].map(p => ['ROL-BGD', p, '2026-10-13T07:50:00Z']),
    // KSV — 11 quyền
    ...['PER-01','PER-02','PER-03','PER-04','PER-05','PER-06','PER-07','PER-09','PER-10','PER-11','PER-14'].map(p => ['ROL-KSV', p, '2026-10-13T07:50:00Z']),
    // CBTD — 7 quyền
    ...['PER-01','PER-02','PER-05','PER-06','PER-09','PER-11','PER-14'].map(p => ['ROL-CBTD', p, '2026-10-13T07:50:00Z']),
  ],
  Users: [
    ['USR-001','admin@example.com',       'NV-TEST-001','Quản trị mẫu',           'ROL-ADMIN','DV-THU-NGHIEM','active',  '2026-10-13T07:50:00Z','2026-10-13T07:50:00Z'],
    ['USR-002','bgd@example.com',         'NV-TEST-002','Ban giám đốc mẫu',       'ROL-BGD',  'DV-THU-NGHIEM','active',  '2026-10-13T07:50:00Z','2026-10-13T07:50:00Z'],
    ['USR-003','ksv01@example.com',       'NV-TEST-003','KSV mẫu 01',             'ROL-KSV',  'DV-THU-NGHIEM','active',  '2026-10-13T07:50:00Z','2026-10-13T07:50:00Z'],
    ['USR-004','cbtd01@example.com',      'NV-TEST-004','CBTD mẫu 01',            'ROL-CBTD', 'DV-THU-NGHIEM','active',  '2026-10-13T07:50:00Z','2026-10-13T07:50:00Z'],
    ['USR-005','cbtd02@example.com',      'NV-TEST-005','CBTD mẫu 02',            'ROL-CBTD', 'DV-THU-NGHIEM','active',  '2026-10-13T07:50:00Z','2026-10-13T07:50:00Z'],
    ['USR-006','cbtd03@example.com',      'NV-TEST-006','CBTD mẫu 03',            'ROL-CBTD', 'DV-THU-NGHIEM','active',  '2026-10-13T07:50:00Z','2026-10-13T07:50:00Z'],
    ['USR-007','cbtd-inactive@example.com','NV-TEST-007','CBTD không hoạt động mẫu','ROL-CBTD','DV-THU-NGHIEM','inactive','2026-10-13T07:50:00Z','2026-10-13T07:50:00Z'],
  ],
  Customers: [
    ['CUS-001','KH-TEST-001','Khách hàng mẫu A','personal','0900000001','managed','2026-10-13T07:52:00Z','2026-10-13T07:52:00Z'],
    ['CUS-002','KH-TEST-002','Công ty mẫu B',    'business','0900000002','new',    '2026-10-13T07:52:00Z','2026-10-13T07:52:00Z'],
    ['CUS-003','KH-TEST-003','Khách hàng mẫu C','personal','0900000003','managed','2026-10-13T07:52:00Z','2026-10-13T07:52:00Z'],
  ],
  Tasks: [
    ['TSK-001','CV-TEST-001','CUS-001','Thẩm định hồ sơ mẫu A',       'Thu thập và kiểm tra hồ sơ mẫu',      'in_progress','high',  '2026-10-20','USR-003','',                   '2026-10-13T08:10:00Z','2026-10-13T09:30:00Z'],
    ['TSK-002','CV-TEST-002','CUS-002','Kiểm tra tài sản bảo đảm mẫu B','Kiểm tra tài sản theo danh mục mẫu','not_started','normal','2026-10-25','USR-004','',                   '2026-10-13T08:20:00Z','2026-10-13T08:20:00Z'],
    ['TSK-003','CV-TEST-003','CUS-003','Thu thập hồ sơ tài chính mẫu C','Thu thập báo cáo tài chính mẫu',    'completed', 'high',  '2026-10-10','USR-001','2026-10-12T10:00:00Z','2026-10-09T09:00:00Z','2026-10-12T10:00:00Z'],
    ['TSK-004','CV-TEST-004','CUS-001','Báo cáo tiến độ mẫu D',        'Báo cáo định kỳ mẫu',               'not_started','low',   '2026-10-30','USR-002','',                   '2026-10-13T08:30:00Z','2026-10-13T08:30:00Z'],
  ],
  TaskAssignees: [
    ['ASG-001','TSK-001','USR-004','cbtd01@example.com','primary',     '2026-10-13T08:10:00Z','TRUE'],
    ['ASG-002','TSK-001','USR-005','cbtd02@example.com','collaborator','2026-10-13T08:12:00Z','TRUE'],
    ['ASG-003','TSK-001','USR-006','cbtd03@example.com','collaborator','2026-10-13T08:11:00Z','FALSE'],
    ['ASG-004','TSK-002','USR-004','cbtd01@example.com','primary',     '2026-10-13T08:20:00Z','TRUE'],
    ['ASG-005','TSK-003','USR-004','cbtd01@example.com','primary',     '2026-10-09T09:00:00Z','TRUE'],
    ['ASG-006','TSK-004','USR-006','cbtd03@example.com','primary',     '2026-10-13T08:30:00Z','TRUE'],
  ],
  TaskUpdates: [
    ['UPD-001','TSK-001','30', 'Đã thu thập giấy tờ cơ bản mẫu',  'USR-004','cbtd01@example.com','2026-10-13T09:00:00Z','approved','USR-003','ksv01@example.com','2026-10-13T09:30:00Z','Đạt'],
    ['UPD-002','TSK-001','60', 'Đang đối chiếu hồ sơ mẫu',         'USR-005','cbtd02@example.com','2026-10-13T10:00:00Z','pending', '',       '',                 '',                   ''],
    ['UPD-003','TSK-003','80', 'Còn thiếu một chứng từ mẫu',       'USR-004','cbtd01@example.com','2026-10-11T09:00:00Z','rejected','USR-003','ksv01@example.com','2026-10-11T11:00:00Z','Cần bổ sung chứng từ'],
    ['UPD-004','TSK-003','100','Hoàn thành hồ sơ mẫu',             'USR-004','cbtd01@example.com','2026-10-12T09:00:00Z','approved','USR-003','ksv01@example.com','2026-10-12T10:00:00Z','Đạt'],
  ],
  Notifications: [
    ['NTF-001','USR-004','task_assigned',     'ASG-001','evt-assign-ASG-001', 'Bạn được giao công việc CV-TEST-001',                           '2026-10-13T08:10:00Z','2026-10-13T08:15:00Z'],
    ['NTF-002','USR-003','progress_submitted','UPD-001','evt-submit-UPD-001', 'Có cập nhật tiến độ chờ duyệt CV-TEST-001',                     '2026-10-13T09:00:00Z',''],
    ['NTF-003','USR-004','progress_approved', 'UPD-001','evt-review-UPD-001', 'Cập nhật tiến độ CV-TEST-001 đã được duyệt',                   '2026-10-13T09:30:00Z',''],
    ['NTF-004','USR-004','progress_rejected', 'UPD-003','evt-review-UPD-003', 'Cập nhật tiến độ CV-TEST-003 bị từ chối; xem lý do trong ứng dụng','2026-10-11T11:00:00Z',''],
  ],
  AuditLogs: [
    ['AUD-001','USR-001','admin@example.com', 'user.create',       'User',           'USR-004','evt-aud-001','2026-10-13T07:55:00Z'],
    ['AUD-002','USR-003','ksv01@example.com', 'customer.create',   'Customer',       'CUS-001','evt-aud-002','2026-10-13T08:00:00Z'],
    ['AUD-003','USR-003','ksv01@example.com', 'task.create',       'Task',           'TSK-001','evt-aud-003','2026-10-13T08:10:00Z'],
    ['AUD-004','USR-003','ksv01@example.com', 'task.assign',       'TaskAssignee',   'ASG-001','evt-aud-004','2026-10-13T08:10:00Z'],
    ['AUD-005','USR-004','cbtd01@example.com','progress.submit',   'TaskUpdate',     'UPD-001','evt-aud-005','2026-10-13T09:00:00Z'],
    ['AUD-006','USR-003','ksv01@example.com', 'progress.approve',  'TaskUpdate',     'UPD-001','evt-aud-006','2026-10-13T09:30:00Z'],
    ['AUD-007','USR-003','ksv01@example.com', 'progress.reject',   'TaskUpdate',     'UPD-003','evt-aud-007','2026-10-11T11:00:00Z'],
    ['AUD-008','USR-003','ksv01@example.com', 'task.auto_complete','Task',           'TSK-003','evt-aud-008','2026-10-12T10:00:00Z'],
  ],
};

// ===========================================================================
// HÀM CHÍNH
// ===========================================================================

/**
 * Tạo toàn bộ sổ dữ liệu AppSheet. Chạy từ Apps Script editor.
 * Idempotent: gọi lại sẽ xóa và tạo lại tab (không nhân đôi dữ liệu).
 */
function setupWorkbook() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];
  const startTime = new Date();

  log.push(`Bắt đầu: ${startTime.toISOString()}`);
  log.push(`Sổ: ${ss.getName()} (${ss.getId()})`);
  log.push('---');

  // Tạo/reset từng tab theo thứ tự
  TAB_ORDER.forEach(tabName => {
    try {
      _setupTab(ss, tabName, SCHEMA[tabName], SYNTHETIC_DATA[tabName]);
      log.push(`✅ ${tabName}: ${SYNTHETIC_DATA[tabName].length} dòng dữ liệu`);
    } catch (e) {
      log.push(`❌ ${tabName}: ${e.message}`);
    }
  });

  // Ghi log
  log.push('---');
  log.push(`Kết thúc: ${new Date().toISOString()}`);
  _writeLog(ss, log);

  // Thông báo kết quả
  SpreadsheetApp.getUi().alert(
    'Setup hoàn tất',
    `Đã tạo ${TAB_ORDER.length} tab.\nXem tab "SetupLog" để kiểm tra chi tiết.\n\nBước tiếp theo: xem docs/appsheet/u2-appsheet-setup-guide.md`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Chỉ kiểm tra cấu trúc tiêu đề — không ghi dữ liệu.
 * Dùng để xác minh sổ hiện tại khớp lược đồ.
 */
function verifySchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errors = [];

  TAB_ORDER.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) { errors.push(`${tabName}: tab không tồn tại`); return; }
    const header = sheet.getRange(1, 1, 1, SCHEMA[tabName].length).getValues()[0];
    const expected = SCHEMA[tabName];
    expected.forEach((col, i) => {
      if (header[i] !== col) errors.push(`${tabName} cột ${i+1}: mong đợi "${col}", thực tế "${header[i]}"`);
    });
  });

  if (errors.length === 0) {
    SpreadsheetApp.getUi().alert('Xác minh lược đồ', '✅ Tất cả tab và tiêu đề cột đều khớp lược đồ.', SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    SpreadsheetApp.getUi().alert('Xác minh lược đồ', `❌ Phát hiện ${errors.length} lỗi:\n\n${errors.join('\n')}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ===========================================================================
// HÀM HỖ TRỢ NỘI BỘ
// ===========================================================================

function _setupTab(ss, tabName, columns, rows) {
  // Xóa tab cũ nếu tồn tại (để không nhân đôi dữ liệu)
  let sheet = ss.getSheetByName(tabName);
  if (sheet) {
    ss.deleteSheet(sheet);
    SpreadsheetApp.flush();
  }

  // Tạo tab mới ở cuối
  sheet = ss.insertSheet(tabName);

  // Ghi header
  const headerRange = sheet.getRange(1, 1, 1, columns.length);
  headerRange.setValues([columns]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground(HEADER_COLORS[tabName] || '#F5F5F5');
  headerRange.setFontFamily('Courier New'); // monospace giúp dễ đọc ID

  // Đóng băng hàng tiêu đề
  sheet.setFrozenRows(1);

  // Ghi dữ liệu (nếu có)
  if (rows && rows.length > 0) {
    sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);
  }

  // Điều chỉnh độ rộng cột tự động
  for (let i = 1; i <= columns.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // Thêm bộ lọc để dễ tra cứu
  sheet.getRange(1, 1, Math.max(2, rows.length + 1), columns.length).createFilter();
}

function _writeLog(ss, logLines) {
  let logSheet = ss.getSheetByName('SetupLog');
  if (logSheet) ss.deleteSheet(logSheet);
  logSheet = ss.insertSheet('SetupLog');
  logSheet.getRange(1, 1, logLines.length, 1).setValues(logLines.map(l => [l]));
  logSheet.setColumnWidth(1, 600);
  logSheet.getRange(1, 1).setFontWeight('bold').setValue('QLCV CBTD — Setup Log');
  // Di chuyển tab SetupLog về cuối
  ss.moveActiveSheet(ss.getNumSheets());
}

// ===========================================================================
// MENU TÙY CHỈNH (tự động xuất hiện khi mở sổ)
// ===========================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗂️ QLCV Setup')
    .addItem('1. Tạo/reset toàn bộ sổ (synthetic data)', 'setupWorkbook')
    .addSeparator()
    .addItem('2. Kiểm tra lược đồ (không ghi dữ liệu)', 'verifySchema')
    .addToUi();
}

