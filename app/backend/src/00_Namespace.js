/**
 * QLCV_CBTD – Lõi backend.
 * Chạy nguyên bản trên: Google Apps Script (V8), trình duyệt (chế độ demo) và Node (kiểm thử).
 * Các tệp được nạp theo thứ tự số; mọi module gắn vào không gian tên QLCV.
 * Lược đồ khớp docs/appsheet/data-dictionary.md (10 tab) + 3 cột mở rộng ghi ở Q.Schema.extensions.
 */
var QLCV = (typeof QLCV !== 'undefined' && QLCV) ? QLCV : {};

(function (Q) {
  'use strict';

  Q.Config = {
    APP: 'QLCV_CBTD',
    VERSION: '1.0.0',
    TZ_OFFSET_MIN: 420,            // Asia/Ho_Chi_Minh = UTC+7, không có DST
    PAGE_SIZE: 20,
    PAGE_SIZE_MAX: 100,
    MAX_BODY_BYTES: 64 * 1024,
    RATE_LIMIT_PER_MIN: 240,
    TOKEN_CACHE_SEC: 300,
    USER_CACHE_SEC: 60,            // hồ sơ người dùng theo email; cập nhật qua API được ghi xuyên ngay, sửa trực tiếp trên Sheets có hiệu lực sau tối đa chừng này giây
    REF_CACHE_SEC: 60,             // bảng tham chiếu (vai trò/quyền) được giữ trong CacheService; sửa trực tiếp trên Sheets có hiệu lực sau tối đa chừng này giây
    BACKUP_RETENTION_DAYS: 30,
    LIMITS: { title: 200, description: 2000, narrative: 2000, comment: 1000, name: 200, phone: 20, org: 100 }
  };

  Q.Enums = {
    taskStatus: ['not_started', 'in_progress', 'completed'],
    manualTaskStatus: ['not_started', 'in_progress'],   // 'completed' chỉ đặt tự động theo R8
    priority: ['high', 'normal', 'low'],
    customerType: ['personal', 'business'],
    customerStatus: ['new', 'managed'],
    reviewStatus: ['pending', 'approved', 'rejected'],
    assignmentRole: ['primary', 'collaborator'],
    userStatus: ['active', 'inactive'],
    roleCodes: ['Admin', 'BGD', 'KSV', 'CBTD']
  };

  var REVIEW_FIELDS = ['review_status', 'reviewed_by_user_id', 'reviewed_by_email_snapshot', 'reviewed_at', 'review_comment'];

  var tables = {
    Roles: { cols: ['role_id', 'code', 'name', 'description'], pk: 'role_id', reference: true },
    Permissions: { cols: ['permission_id', 'code', 'name', 'description'], pk: 'permission_id', reference: true },
    RolePermissions: { cols: ['role_id', 'permission_id', 'created_at'], pk: null, reference: true },
    Users: {
      cols: ['user_id', 'email', 'employee_code', 'full_name', 'role_id', 'org_unit', 'status', 'created_at', 'updated_at',
        'unread_notifications'],
      pk: 'user_id', prefix: 'USR', immutable: ['user_id', 'email', 'created_at'],
      derived: ['unread_notifications']   // tính từ Notifications (26_Derived.js), không có trong CSV/từ điển dữ liệu
    },
    Customers: {
      cols: ['customer_id', 'customer_code', 'name', 'type', 'phone', 'status', 'created_at', 'updated_at',
        'company_representative', 'archived_at'],
      pk: 'customer_id', prefix: 'CUS', immutable: ['customer_id', 'created_at']
    },
    Tasks: {
      cols: ['task_id', 'task_code', 'customer_id', 'title', 'description', 'status', 'priority', 'due_at',
        'created_by_user_id', 'completed_at', 'created_at', 'updated_at', 'archived_at',
        'approved_progress', 'pending_updates'],
      pk: 'task_id', prefix: 'TSK', immutable: ['task_id', 'task_code', 'created_by_user_id', 'created_at'],
      derived: ['approved_progress', 'pending_updates']   // tính từ TaskUpdates (26_Derived.js)
    },
    TaskAssignees: {
      cols: ['assignment_id', 'task_id', 'user_id', 'assignee_email_snapshot', 'assignment_role', 'assigned_at', 'active'],
      pk: 'assignment_id', prefix: 'ASG',
      immutable: ['assignment_id', 'task_id', 'user_id', 'assignee_email_snapshot', 'assignment_role', 'assigned_at']
    },
    TaskUpdates: {
      cols: ['update_id', 'task_id', 'progress_pct', 'narrative', 'submitted_by_user_id', 'submitted_by_email_snapshot',
        'submitted_at', 'review_status', 'reviewed_by_user_id', 'reviewed_by_email_snapshot', 'reviewed_at', 'review_comment'],
      pk: 'update_id', prefix: 'UPD',
      immutable: ['update_id', 'task_id', 'progress_pct', 'narrative', 'submitted_by_user_id', 'submitted_by_email_snapshot', 'submitted_at'],
      reviewFields: REVIEW_FIELDS
    },
    Notifications: {
      cols: ['notification_id', 'recipient_user_id', 'event_type', 'source_record_id', 'request_or_event_key', 'message',
        'created_at', 'read_at'],
      pk: 'notification_id', prefix: 'NTF',
      immutable: ['notification_id', 'recipient_user_id', 'event_type', 'source_record_id', 'request_or_event_key', 'message', 'created_at']
    },
    AuditLogs: {
      cols: ['audit_id', 'actor_user_id', 'actor_email_snapshot', 'action', 'entity_type', 'entity_id', 'request_or_event_key', 'created_at'],
      pk: 'audit_id', prefix: 'AUD', appendOnly: true
    }
  };

  var INT_COLS = { 'TaskUpdates.progress_pct': 1, 'Tasks.approved_progress': 1, 'Tasks.pending_updates': 1, 'Users.unread_notifications': 1 };
  var BOOL_COLS = { 'TaskAssignees.active': 1 };

  function isoNoMs(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

  function toInt(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    return isFinite(n) ? Math.round(n) : null;
  }
  function toBool(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
  function toText(v) {
    if (typeof v === 'string') return v;                 // đường nhanh: phần lớn ô là chuỗi
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return isoNoMs(v);
    return String(v);
  }
  /** Bộ chuyển đổi theo cột, chọn MỘT lần cho mỗi bảng (trước đây nối chuỗi "Bảng.cột" cho từng ô của từng dòng). */
  var CONVERTERS = {};
  function convertersOf(t) {
    if (!CONVERTERS[t]) {
      CONVERTERS[t] = tables[t].cols.map(function (c) {
        var key = t + '.' + c;
        return INT_COLS[key] ? toInt : BOOL_COLS[key] ? toBool : toText;
      });
    }
    return CONVERTERS[t];
  }

  Q.Schema = {
    tables: tables,
    /** Cột mở rộng so với data-dictionary.md (cần bổ sung vào từ điển khi nghiệp vụ chấp thuận). */
    extensions: [
      'Tasks.archived_at — lưu trữ thay vì xóa cứng (PER-03, R5)',
      'Customers.archived_at — xóa mềm (PER-08)',
      'Customers.company_representative — Người đại diện công ty (R17)',
      'Tasks.approved_progress, Tasks.pending_updates — số liệu dẫn xuất từ TaskUpdates (tối ưu đọc, xem 26_Derived.js)',
      'Users.unread_notifications — số thông báo chưa đọc, dẫn xuất từ Notifications (xem 26_Derived.js)'
    ],
    names: Object.keys(tables),
    cols: function (t) { return tables[t].cols; },
    normalize: function (t, obj) {
      var cols = tables[t].cols, conv = convertersOf(t), out = {};
      for (var i = 0; i < cols.length; i++) out[cols[i]] = conv[i](obj[cols[i]]);
      return out;
    },
    toArray: function (t, obj) {
      return tables[t].cols.map(function (c) {
        var key = t + '.' + c, v = obj[c];
        if (BOOL_COLS[key]) return v ? 'TRUE' : 'FALSE';
        if (INT_COLS[key]) return (v === null || v === undefined) ? '' : v;
        return v === null || v === undefined ? '' : v;
      });
    }
  };
})(QLCV);
